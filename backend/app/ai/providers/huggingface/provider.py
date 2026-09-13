"""
Hugging Face provider: implements every capability except OCR on top of the
Inference API. Model ids come from settings so they can be changed without
code. Response parsing is deliberately defensive; the pipelines return
slightly different shapes across models.
"""

from __future__ import annotations

import base64
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import httpx

from app.ai.base import (
    AICapability,
    AIError,
    AIInvalidInputError,
    AIProvider,
    AIRateLimitedError,
    ModelInfo,
    ProviderHealth,
    Usage,
)
from app.ai.chat.base import ChatMessage, ChatRequest, ChatResponse, ChatService
from app.ai.embeddings.base import EmbeddingRequest, EmbeddingResponse, EmbeddingService
from app.ai.extraction.base import ExtractionService
from app.ai.providers.huggingface.client import DEFAULT_BASE_URL, DEFAULT_CHAT_URL, HuggingFaceClient
from app.ai.providers.huggingface.extraction import HFExtractionService
from app.ai.sentiment.base import SentimentRequest, SentimentResponse, SentimentService
from app.ai.summarization.base import (
    SummarizationRequest,
    SummarizationResponse,
    SummarizationService,
)
from app.ai.vision.base import VisionRequest, VisionResponse, VisionService

PROVIDER = "huggingface"
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class HuggingFaceModels:
    chat: str = "meta-llama/Llama-3.1-8B-Instruct"
    sentiment: str = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    summarization: str = "facebook/bart-large-cnn"
    embeddings: str = "sentence-transformers/all-MiniLM-L6-v2"
    vision: str = "google/gemma-3-12b-it"
    embedding_dimensions: int = 384


def _info(model: str) -> ModelInfo:
    return ModelInfo(provider=PROVIDER, model=model)


# --- Chat ---------------------------------------------------------------------------------


class HFChatService(ChatService):
    def __init__(self, client: HuggingFaceClient, model: str) -> None:
        self.client = client
        self.model = model

    async def complete(self, request: ChatRequest) -> ChatResponse:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        if request.system and not any(m["role"] == "system" for m in messages):
            messages.insert(0, {"role": "system", "content": request.system})
        if not any(m["role"] == "user" for m in messages):
            raise AIInvalidInputError("The conversation has no user message.")

        body = await self.client.chat_completions(
            {
                "model": self.model,
                "messages": messages,
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
                "stream": False,
            }
        )
        try:
            choice = body["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("Unexpected chat response from the provider.") from exc
        usage = body.get("usage") or {}
        return ChatResponse(
            message=ChatMessage(role="assistant", content=content.strip()),
            model=_info(body.get("model") or self.model),
            usage=Usage(
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
            ),
            finish_reason=choice.get("finish_reason"),
        )

    async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
        # Chunked streaming can be added with SSE parsing; for now fall back.
        response = await self.complete(request)
        yield response.message.content


# --- Sentiment ------------------------------------------------------------------------------

_LABEL_ALIASES = {
    "positive": "positive",
    "negative": "negative",
    "neutral": "neutral",
    "label_2": "positive",
    "label_1": "neutral",
    "label_0": "negative",
    "pos": "positive",
    "neg": "negative",
    "neu": "neutral",
}


class HFSentimentService(SentimentService):
    def __init__(self, client: HuggingFaceClient, model: str) -> None:
        self.client = client
        self.model = model

    async def analyze(self, request: SentimentRequest) -> SentimentResponse:
        if not request.text.strip():
            raise AIInvalidInputError("The text is empty.")
        body = await self.client.pipeline(self.model, {"inputs": request.text[:2000]})
        # Shape: [[{"label": "...", "score": 0.9}, ...]] or [{"label":..}, ...]
        candidates = body[0] if body and isinstance(body[0], list) else body
        scores: dict[str, float] = {}
        for item in candidates or []:
            label = _LABEL_ALIASES.get(str(item.get("label", "")).lower())
            if label:
                scores[label] = max(scores.get(label, 0.0), float(item.get("score", 0.0)))
        if not scores:
            raise AIError("Unexpected sentiment response from the provider.")
        for missing in ("positive", "neutral", "negative"):
            scores.setdefault(missing, 0.0)
        label = max(scores, key=scores.get)  # type: ignore[arg-type]
        return SentimentResponse(
            label=label,  # type: ignore[arg-type]
            confidence=round(scores[label], 4),
            scores={k: round(v, 4) for k, v in scores.items()},
            model=_info(self.model),
        )


# --- Summarization ----------------------------------------------------------------------------

_SENTENCE = re.compile(r"(?<=[.!?])\s+")
_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")

_MODE_INSTRUCTIONS: dict[str, str] = {
    "quick": (
        "Summarise the text in at most {words} words of plain prose. "
        "Do not use bullet points. Do not add commentary."
    ),
    "detailed": (
        "Write a thorough summary of the text in at most {words} words of plain prose, "
        "covering every important fact, figure, name and date. Do not use bullet points."
    ),
    "bullet_points": (
        "Extract the key points of the text as a list of at most 8 concise bullet points. "
        "Start every line with '- '. Output only the list."
    ),
    "action_items": (
        "List every action item, task, deadline or request in the text as bullet points. "
        "Start every line with '- ' and begin each with a verb. If there are none, output "
        "exactly: - No action items found. Output only the list."
    ),
}

_SYSTEM = (
    "You are a precise assistant that condenses documents. The input may be OCR "
    "output with recognition errors; infer the intended words. Never invent facts."
)


def _user_prompt(instruction: str, text: str) -> str:
    fence = '"""'
    return f"{instruction}\n\nText:\n{fence}\n{text[:12000]}\n{fence}"


class HFSummarizationService(SummarizationService):
    """
    Uses the instruction-following chat model so every mode is honoured. If
    the chat model is unavailable, the plain summarisation pipeline answers
    `quick`/`detailed` (bullet modes are then derived from its sentences).
    """

    def __init__(self, client: HuggingFaceClient, pipeline_model: str, chat_model: str) -> None:
        self.client = client
        self.pipeline_model = pipeline_model
        self.chat_model = chat_model

    async def summarize(self, request: SummarizationRequest) -> SummarizationResponse:
        text = request.text.strip()
        if not text:
            raise AIInvalidInputError("The text is empty.")
        try:
            return await self._via_chat(text, request)
        except (AIRateLimitedError, AIInvalidInputError):
            raise
        except AIError as exc:
            logger.warning("Chat summarisation failed (%s); falling back to pipeline", exc.code)
            return await self._via_pipeline(text, request)

    async def _via_chat(self, text: str, request: SummarizationRequest) -> SummarizationResponse:
        instruction = _MODE_INSTRUCTIONS[request.mode].format(words=request.word_budget)
        body = await self.client.chat_completions(
            {
                "model": self.chat_model,
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": _user_prompt(instruction, text)},
                ],
                "max_tokens": max(64, int(request.word_budget * 2)),
                "temperature": 0.2,
                "stream": False,
            }
        )
        try:
            content = body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("Unexpected summarisation response from the provider.") from exc
        usage = body.get("usage") or {}
        return _shape(
            content,
            request,
            _info(body.get("model") or self.chat_model),
            Usage(
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
            ),
        )

    async def _via_pipeline(self, text: str, request: SummarizationRequest) -> SummarizationResponse:
        max_tokens = max(30, int(request.word_budget * 1.4))
        body = await self.client.pipeline(
            self.pipeline_model,
            {
                "inputs": text[:6000],
                "parameters": {"max_length": max_tokens, "min_length": min(20, max_tokens)},
            },
        )
        try:
            summary = body[0]["summary_text"].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("Unexpected summarisation response from the provider.") from exc
        return _shape(summary, request, _info(self.pipeline_model), Usage())


def _shape(
    content: str, request: SummarizationRequest, model: ModelInfo, usage: Usage
) -> SummarizationResponse:
    """Normalises model output into prose + items according to the mode."""
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    bullets = tuple(_BULLET.sub("", ln).strip() for ln in lines if _BULLET.match(ln))

    if request.mode in ("bullet_points", "action_items"):
        items = bullets or tuple(s.strip() for s in _SENTENCE.split(content) if s.strip())
        items = tuple(i for i in items if i)[:10]
        if request.mode == "action_items" and any("no action items" in i.lower() for i in items):
            items = ()
        lead = (
            f"{len(items)} action item{'s' if len(items) != 1 else ''}."
            if request.mode == "action_items"
            else f"{len(items)} key points."
        )
        return SummarizationResponse(summary=lead, items=items, mode=request.mode, model=model, usage=usage)

    prose = " ".join(bullets) if bullets and not any(not _BULLET.match(ln) for ln in lines) else " ".join(lines)
    return SummarizationResponse(summary=prose, items=(), mode=request.mode, model=model, usage=usage)


# --- Embeddings ----------------------------------------------------------------------------------


class HFEmbeddingService(EmbeddingService):
    def __init__(self, client: HuggingFaceClient, model: str, dimensions: int) -> None:
        self.client = client
        self.model = model
        self._dimensions = dimensions

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(self, request: EmbeddingRequest) -> EmbeddingResponse:
        if not request.texts:
            raise AIInvalidInputError("No texts to embed.")
        # Sentence-transformer models default to the sentence-similarity task
        # on the router; pin feature-extraction to get raw vectors back.
        body = await self.client.pipeline(
            self.model,
            {"inputs": list(request.texts), "options": {"use_cache": True}},
            task="feature-extraction",
        )
        vectors = _as_vectors(body, expected=len(request.texts))
        dims = len(vectors[0]) if vectors else self._dimensions
        return EmbeddingResponse(
            vectors=vectors, dimensions=dims, model=_info(self.model)
        )


def _as_vectors(body: Any, *, expected: int) -> tuple[tuple[float, ...], ...]:
    """Feature-extraction returns [[f...]] for a batch or [f...] for one input."""
    if isinstance(body, list) and body and isinstance(body[0], (int, float)):
        body = [body]
    if not isinstance(body, list) or len(body) != expected:
        raise AIError("Unexpected embedding response from the provider.")
    try:
        return tuple(tuple(float(x) for x in vec) for vec in body)
    except (TypeError, ValueError) as exc:
        raise AIError("Unexpected embedding response from the provider.") from exc


# --- Vision --------------------------------------------------------------------------------------


class HFVisionService(VisionService):
    """
    Image understanding through a vision-capable chat model on the
    OpenAI-compatible endpoint (the router no longer serves the classic
    image-to-text pipelines). The image travels as a data URL; the prompt
    defaults to a short caption request.
    """

    DEFAULT_PROMPT = (
        "Describe this image in one or two plain sentences: what it shows, and if it is a "
        "document, what kind (invoice, receipt, business card, form, letter...)."
    )

    def __init__(self, client: HuggingFaceClient, model: str) -> None:
        self.client = client
        self.model = model

    async def describe(self, request: VisionRequest) -> VisionResponse:
        if not request.image.data:
            raise AIInvalidInputError("The image is empty.")
        data_url = (
            f"data:{request.image.mime_type};base64,"
            f"{base64.b64encode(request.image.data).decode('ascii')}"
        )
        body = await self.client.chat_completions(
            {
                "model": self.model,
                "max_tokens": request.max_tokens,
                "temperature": 0.2,
                "stream": False,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": request.prompt or self.DEFAULT_PROMPT},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    }
                ],
            }
        )
        try:
            description = body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("Unexpected vision response from the provider.") from exc
        usage = body.get("usage") or {}
        return VisionResponse(
            description=description,
            model=_info(body.get("model") or self.model),
            usage=Usage(
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
            ),
        )


# --- Provider ------------------------------------------------------------------------------------


class HuggingFaceProvider(AIProvider):
    name = PROVIDER

    def __init__(
        self,
        api_key: str,
        *,
        models: HuggingFaceModels | None = None,
        base_url: str = DEFAULT_BASE_URL,
        chat_url: str = DEFAULT_CHAT_URL,
        timeout: float = 60.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.models = models or HuggingFaceModels()
        self.client = HuggingFaceClient(
            api_key, base_url=base_url, chat_url=chat_url, timeout=timeout, transport=transport
        )
        self._chat = HFChatService(self.client, self.models.chat)
        self._sentiment = HFSentimentService(self.client, self.models.sentiment)
        self._summarization = HFSummarizationService(
            self.client, self.models.summarization, self.models.chat
        )
        self._embeddings = HFEmbeddingService(
            self.client, self.models.embeddings, self.models.embedding_dimensions
        )
        self._vision = HFVisionService(self.client, self.models.vision)
        self._extraction = HFExtractionService(self.client, self.models.chat)

    @property
    def capabilities(self) -> frozenset[AICapability]:
        return frozenset(
            {
                AICapability.CHAT,
                AICapability.SENTIMENT,
                AICapability.SUMMARIZATION,
                AICapability.EMBEDDINGS,
                AICapability.VISION,
                AICapability.EXTRACTION,
            }
        )

    @property
    def chat(self) -> ChatService:
        return self._chat

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
    def vision(self) -> VisionService:
        return self._vision

    @property
    def extraction(self) -> ExtractionService:
        return self._extraction

    async def health(self) -> ProviderHealth:
        try:
            await self._sentiment.analyze(SentimentRequest(text="ok"))
        except AIError as exc:
            return ProviderHealth(self.name, False, self.capabilities, detail=exc.message)
        return ProviderHealth(self.name, True, self.capabilities)

    async def close(self) -> None:
        await self.client.close()


__all__ = ["HuggingFaceModels", "HuggingFaceProvider"]
