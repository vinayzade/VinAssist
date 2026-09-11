"""
Deterministic, dependency-free provider.

Used when `AI_PROVIDER=mock` (the default) and in tests. Every capability
is implemented with simple heuristics so the rest of the system can be
exercised end to end without a network or an API key. Nothing here is
meant to be smart; it is meant to be predictable.
"""

from __future__ import annotations

import hashlib
import math
import re
import struct
from collections.abc import AsyncIterator

from app.ai.base import AICapability, AIInvalidInputError, AIProvider, ModelInfo, Usage
from app.ai.chat.base import ChatMessage, ChatRequest, ChatResponse, ChatService
from app.ai.embeddings.base import EmbeddingRequest, EmbeddingResponse, EmbeddingService
from app.ai.extraction.base import ExtractionService
from app.ai.ocr.base import OCRRequest, OCRResponse, OCRService
from app.ai.providers.mock.extraction import MockExtractionService
from app.ai.sentiment.base import SentimentRequest, SentimentResponse, SentimentService
from app.ai.summarization.base import (
    SummarizationRequest,
    SummarizationResponse,
    SummarizationService,
)
from app.ai.vision.base import VisionLabel, VisionRequest, VisionResponse, VisionService

PROVIDER = "mock"
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
_WORD = re.compile(r"[^\W_]+", re.UNICODE)


def _words(text: str) -> list[str]:
    return _WORD.findall(text)


def _model(task: str) -> ModelInfo:
    return ModelInfo(provider=PROVIDER, model=f"mock-{task}")


class MockChatService(ChatService):
    async def complete(self, request: ChatRequest) -> ChatResponse:
        last_user = next((m for m in reversed(request.messages) if m.role == "user"), None)
        if last_user is None or not last_user.content.strip():
            raise AIInvalidInputError("The conversation has no user message.")
        prompt_tokens = sum(len(_words(m.content)) for m in request.messages)
        if request.metadata.get("task") == "rag":
            reply = _rag_answer(last_user.content, request.metadata.get("context", "[]"))
        else:
            reply = f"[mock] You said: {last_user.content.strip()[:200]}"
        return ChatResponse(
            message=ChatMessage(role="assistant", content=reply),
            model=_model("chat"),
            usage=Usage(prompt_tokens=prompt_tokens, completion_tokens=len(_words(reply))),
            finish_reason="stop",
        )

    async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
        response = await self.complete(request)
        for token in response.message.content.split(" "):
            yield token + " "


_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "of", "to", "in", "on", "for", "and", "or",
    "what", "who", "when", "where", "how", "which", "does", "do", "did", "this", "that", "it",
    "be", "by", "with", "from", "at", "as", "much", "many", "there", "any",
}


def _rag_answer(user_content: str, context_json: str) -> str:
    """
    Extractive stand-in for an LLM: returns the passage sentence sharing the
    most keywords with the question, cited as [n]; the canonical not-found
    reply when nothing overlaps.
    """
    import json as _json

    try:
        passages = _json.loads(context_json)
    except ValueError:
        passages = []
    question = user_content.rsplit("Question:", 1)[-1]
    keywords = {w.lower() for w in _words(question) if w.lower() not in _STOPWORDS and len(w) > 2}
    best: tuple[int, str, int] | None = None
    for index, passage in enumerate(passages):
        for sentence in _SENTENCE.split(str(passage)):
            words = {w.lower() for w in _words(sentence)}
            score = len(keywords & words)
            if score and (best is None or score > best[0]):
                best = (score, sentence.strip(), index + 1)
    if best is None:
        return "I couldn't find that in the document."
    return f"{best[1]} [{best[2]}]"


class MockVisionService(VisionService):
    async def describe(self, request: VisionRequest) -> VisionResponse:
        size = len(request.image.data)
        if size == 0:
            raise AIInvalidInputError("The image is empty.")
        kind = request.image.mime_type.split("/")[-1].upper()
        description = f"[mock] A {kind} image of {size} bytes."
        if request.prompt:
            description += f' Prompt: "{request.prompt.strip()[:100]}".'
        return VisionResponse(
            description=description,
            model=_model("vision"),
            labels=(VisionLabel(name="image", confidence=1.0),),
        )


_POSITIVE = {
    "good", "great", "excellent", "love", "happy", "amazing", "wonderful", "best",
    "fantastic", "pleased", "perfect", "thanks", "thank", "helpful", "enjoy",
}
_NEGATIVE = {
    "bad", "terrible", "awful", "hate", "sad", "angry", "worst", "poor", "broken",
    "disappointed", "useless", "slow", "bug", "problem", "fail", "failed", "never",
}


class MockSentimentService(SentimentService):
    async def analyze(self, request: SentimentRequest) -> SentimentResponse:
        words = [w.lower() for w in _words(request.text)]
        if not words:
            raise AIInvalidInputError("The text is empty.")
        pos = sum(w in _POSITIVE for w in words)
        neg = sum(w in _NEGATIVE for w in words)
        total = pos + neg
        if total == 0:
            scores = {"positive": 0.2, "neutral": 0.6, "negative": 0.2}
        else:
            p = pos / total
            n = neg / total
            neutral = max(0.0, 1 - abs(p - n)) * 0.5
            raw = {"positive": p, "negative": n, "neutral": neutral}
            norm = sum(raw.values())
            scores = {k: v / norm for k, v in raw.items()}
        label = max(scores, key=scores.get)  # type: ignore[arg-type]
        return SentimentResponse(
            label=label,  # type: ignore[arg-type]
            confidence=round(scores[label], 3),
            scores={k: round(v, 3) for k, v in scores.items()},
            model=_model("sentiment"),
            explanation=f"[mock] {pos} positive and {neg} negative cue words.",
        )


_ACTION_CUES = re.compile(
    r"\b(please|must|should|need to|needs to|have to|has to|required|due|deadline|"
    r"by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)|"
    r"submit|send|pay|review|sign|confirm|schedule|call|reply|complete|remember|ensure)\b",
    re.IGNORECASE,
)


class MockSummarizationService(SummarizationService):
    """Extractive heuristics per mode; predictable, not clever."""

    async def summarize(self, request: SummarizationRequest) -> SummarizationResponse:
        text = " ".join(request.text.split())
        if not text:
            raise AIInvalidInputError("The text is empty.")
        sentences = [s.strip() for s in _SENTENCE.split(text) if s.strip()]
        budget = request.word_budget
        words_in = len(_words(text))

        if request.mode == "action_items":
            items = tuple(s for s in sentences if _ACTION_CUES.search(s))[:8]
            summary = (
                f"[mock] {len(items)} action item{'s' if len(items) != 1 else ''} found."
                if items
                else "[mock] No action items found."
            )
        elif request.mode == "bullet_points":
            items = tuple(_lead(s, 140) for s in sentences[: max(3, min(8, budget // 20))])
            summary = f"[mock] {len(items)} key points."
        else:
            items = ()
            summary = _take_words(sentences, budget) or " ".join(_words(text)[:budget])

        return SummarizationResponse(
            summary=summary,
            items=items,
            mode=request.mode,
            document_type=_guess_type(text),
            model=_model("summarization"),
            usage=Usage(prompt_tokens=words_in, completion_tokens=len(_words(summary))),
        )


def _take_words(sentences: list[str], budget: int) -> str:
    out: list[str] = []
    used = 0
    for sentence in sentences:
        n = len(_words(sentence))
        if out and used + n > budget:
            break
        out.append(sentence)
        used += n
    return " ".join(out)


def _lead(sentence: str, limit: int) -> str:
    return sentence if len(sentence) <= limit else sentence[: limit - 1].rstrip() + "…"


def _guess_type(text: str) -> str | None:
    lowered = text.lower()
    for marker, kind in (
        ("invoice", "invoice"),
        ("receipt", "receipt"),
        ("dear ", "letter"),
        ("agreement", "contract"),
        ("minutes", "meeting notes"),
    ):
        if marker in lowered:
            return kind
    return None


class MockEmbeddingService(EmbeddingService):
    """Hashed bag-of-words: stable, cheap, and cosine-comparable for tests."""

    # Matches the pgvector column so the mock can drive RAG end to end.
    _DIMENSIONS = 384

    @property
    def dimensions(self) -> int:
        return self._DIMENSIONS

    async def embed(self, request: EmbeddingRequest) -> EmbeddingResponse:
        if not request.texts:
            raise AIInvalidInputError("No texts to embed.")
        vectors = tuple(self._vector(t) for t in request.texts)
        return EmbeddingResponse(
            vectors=vectors,
            dimensions=self._DIMENSIONS,
            model=_model("embeddings"),
            usage=Usage(prompt_tokens=sum(len(_words(t)) for t in request.texts)),
        )

    def _vector(self, text: str) -> tuple[float, ...]:
        acc = [0.0] * self._DIMENSIONS
        for word in _words(text.lower()):
            digest = hashlib.blake2b(word.encode("utf-8"), digest_size=8).digest()
            (h,) = struct.unpack("<Q", digest)
            acc[h % self._DIMENSIONS] += 1.0 if (h >> 63) else -1.0
        norm = math.sqrt(sum(v * v for v in acc)) or 1.0
        return tuple(v / norm for v in acc)


class MockOCRService(OCRService):
    async def recognize(self, request: OCRRequest) -> OCRResponse:
        if not request.image.data:
            raise AIInvalidInputError("The image is empty.")
        # A text/plain "image" lets tests feed known content through.
        text = (
            request.image.data.decode("utf-8", errors="ignore")
            if request.image.mime_type == "text/plain"
            else ""
        )
        return OCRResponse(text=text, model=_model("ocr"), confidence=1.0 if text else None)


class MockProvider(AIProvider):
    name = PROVIDER

    def __init__(self) -> None:
        self._chat = MockChatService()
        self._vision = MockVisionService()
        self._sentiment = MockSentimentService()
        self._summarization = MockSummarizationService()
        self._embeddings = MockEmbeddingService()
        self._ocr = MockOCRService()
        self._extraction = MockExtractionService()

    @property
    def capabilities(self) -> frozenset[AICapability]:
        return frozenset(AICapability)

    @property
    def chat(self) -> ChatService:
        return self._chat

    @property
    def vision(self) -> VisionService:
        return self._vision

    @property
    def sentiment(self) -> SentimentService:
        return self._sentiment

    @property
    def summarization(self) -> SummarizationService:
        return self._summarization

    @property
    def embeddings(self) -> EmbeddingService:
        return self._embeddings

    @property
    def ocr(self) -> OCRService:
        return self._ocr

    @property
    def extraction(self) -> ExtractionService:
        return self._extraction


__all__ = ["MockProvider"]
