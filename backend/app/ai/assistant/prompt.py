"""
Prompt for the multimodal in-app assistant.

The assistant is deliberately narrow: it answers about the user's own
material inside the app (uploaded documents, images, OCR text, and the
results of the app's AI analyses). The model sees that material as
numbered passages (retrieved document chunks) and "cards" (image
captions, OCR text, analysis results), and is told to answer from those
only. General-knowledge chat is declined by instruction and, when there
is no material at all, by the service without calling the model.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.ai.chat.base import ChatMessage
from app.ai.rag.store import RetrievedChunk

ASSISTANT_TASK = "assistant"

NOT_FOUND = "I couldn't find that in your attached material."

SYSTEM_PROMPT = (
    "You are the assistant inside the Vin's AI Assist mobile app. You help the user "
    "with THEIR OWN material only: documents they uploaded, images they attached, text "
    "recognised by OCR, and results of the app's analyses (image quality, sentiment, "
    "summaries, extracted fields).\n"
    "Rules:\n"
    "1. Answer ONLY from the material provided in the message. Passages from documents "
    "are labelled [1], [2], ...; cite the passages you rely on in square brackets after "
    "the relevant sentence, e.g. 'The total is 1,250 [2].' Cards describe images, OCR "
    "text and analysis results; refer to them by their title.\n"
    f'2. If the material does not contain the answer, reply exactly: "{NOT_FOUND}" '
    "and, in one short sentence, say what the user could attach or run in the app.\n"
    "3. Do not answer general-knowledge questions, write essays or code, or chat about "
    "topics unrelated to the material. Politely say this assistant only works with the "
    "user's documents, images and analyses.\n"
    "4. Never invent numbers, names, dates or fields. OCR text may contain recognition "
    "errors; interpret it sensibly.\n"
    "5. Be concise and practical. Plain text, no markdown headings."
)

CARD_BODY_MAX = 3_000


@dataclass(frozen=True)
class MaterialCard:
    """One non-passage piece of context: an image caption, OCR text, an analysis."""

    kind: str  # image | ocr | analysis | document
    title: str
    body: str

    def render(self) -> str:
        body = self.body.strip()
        if len(body) > CARD_BODY_MAX:
            body = body[: CARD_BODY_MAX - 1].rstrip() + "…"
        return f"### {self.title} ({self.kind})\n{body}"


def build_messages(
    question: str,
    passages: Sequence[RetrievedChunk],
    cards: Sequence[MaterialCard],
    history: Sequence[ChatMessage] = (),
    document_names: Mapping[Any, str] | None = None,
) -> tuple[ChatMessage, ...]:
    """History is included for coherence; only the current material is cited."""
    parts: list[str] = []
    if cards:
        parts.append("Cards:\n\n" + "\n\n".join(card.render() for card in cards))
    if passages:
        names = document_names or {}
        lines = []
        for i, chunk in enumerate(passages):
            name = names.get(chunk.document_id)
            label = f"[{i + 1}]" + (f' (from "{name}")' if name else "")
            lines.append(f"{label} {chunk.text}")
        parts.append("Passages:\n\n" + "\n\n".join(lines))
    material = "\n\n".join(parts) if parts else "(no material attached)"
    user = f"Material:\n\n{material}\n\nQuestion: {question.strip()}"
    trimmed = tuple(history[-6:])  # last three exchanges at most
    return (*trimmed, ChatMessage(role="user", content=user))


def context_metadata(
    passages: Sequence[RetrievedChunk], cards: Sequence[MaterialCard]
) -> dict[str, str]:
    """Lets providers without real reasoning (the mock) see the material."""
    context = [c.text for c in passages] + [card.body for card in cards]
    return {"task": ASSISTANT_TASK, "context": json.dumps(context), "not_found": NOT_FOUND}


# --- analysis cards ---------------------------------------------------------------------------

_KEY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def _label(key: str) -> str:
    return _KEY.sub(" ", key).replace("_", " ").strip().capitalize()


def _fmt(value: Any) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        return f"{value:.2f}".rstrip("0").rstrip(".")
    if value is None:
        return "unknown"
    if isinstance(value, (list, tuple)):
        return ", ".join(_fmt(v) for v in value) if value else "none"
    if isinstance(value, dict):
        return "; ".join(f"{_label(k)}: {_fmt(v)}" for k, v in value.items()) or "none"
    return str(value)


def render_analysis(kind: str, data: Mapping[str, Any]) -> str:
    """Turns an analysis result the app produced into readable lines for the prompt."""
    if kind == "image_quality":
        return _render_image_quality(data)
    if kind == "sentiment":
        parts = [f"Sentiment: {_fmt(data.get('sentiment'))}"]
        if data.get("confidence") is not None:
            parts.append(f"Confidence: {round(float(data['confidence']) * 100)}%")
        if data.get("explanation"):
            parts.append(f"Explanation: {data['explanation']}")
        if data.get("text"):
            parts.append(f"Analysed text: {data['text']}")
        return "\n".join(parts)
    if kind == "extraction":
        parts = [f"Document type: {_fmt(data.get('documentType'))}"]
        if data.get("confidence") is not None:
            parts.append(f"Classification confidence: {round(float(data['confidence']) * 100)}%")
        fields = data.get("data")
        if isinstance(fields, Mapping):
            for key, value in fields.items():
                if value not in (None, "", [], {}):
                    parts.append(f"{_label(key)}: {_fmt(value)}")
        if data.get("warnings"):
            parts.append(f"Warnings: {_fmt(data['warnings'])}")
        return "\n".join(parts)
    if kind == "summary":
        parts = []
        if data.get("mode"):
            parts.append(f"Mode: {_fmt(data['mode'])}")
        if data.get("summary"):
            parts.append(f"Summary: {data['summary']}")
        items = data.get("items")
        if isinstance(items, list) and items:
            parts.extend(f"- {item}" for item in items)
        return "\n".join(parts)
    # Unknown kind: flatten generically so nothing is silently dropped.
    return "\n".join(f"{_label(k)}: {_fmt(v)}" for k, v in data.items())


def _render_image_quality(data: Mapping[str, Any]) -> str:
    parts = []
    for key in (
        "overallScore",
        "blurScore",
        "brightnessScore",
        "resolutionScore",
        "faceScore",
        "score",
    ):
        if data.get(key) is not None:
            parts.append(f"{_label(key)}: {_fmt(data[key])}/100")
    for key in ("verdict", "recommendation", "blur", "exposure", "width", "height", "faceCount"):
        if data.get(key) is not None:
            parts.append(f"{_label(key)}: {_fmt(data[key])}")
    warnings = data.get("warnings") or data.get("issues")
    if isinstance(warnings, list) and warnings:
        rendered = []
        for w in warnings:
            if isinstance(w, Mapping):
                rendered.append(str(w.get("message") or w.get("code") or w))
            else:
                rendered.append(str(w))
        parts.append("Warnings: " + "; ".join(rendered))
    elif "warnings" in data or "issues" in data:
        parts.append("Warnings: none")
    return "\n".join(parts) or _fmt(dict(data))
