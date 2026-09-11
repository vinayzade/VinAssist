"""
Grounded-answer prompt. The model sees only the retrieved passages, each
labelled [n], and is told to answer from them alone and to cite them.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence

from app.ai.chat.base import ChatMessage
from app.ai.rag.store import RetrievedChunk

RAG_TASK = "rag"

SYSTEM_PROMPT = (
    "You answer questions about a document using ONLY the passages provided. "
    "Each passage is labelled [1], [2], ... Cite the passages you rely on in "
    "square brackets after the relevant sentence, e.g. 'The total is 1,250 [2].' "
    "If the passages do not contain the answer, reply exactly: "
    "\"I couldn't find that in the document.\" Do not use outside knowledge and "
    "do not invent details. Keep answers concise. The passages may be OCR output "
    "with recognition errors; interpret them sensibly."
)

_CITATION = re.compile(r"\[(\d+)\]")


def build_context(chunks: Sequence[RetrievedChunk]) -> str:
    return "\n\n".join(f"[{i + 1}] {chunk.text}" for i, chunk in enumerate(chunks))


def build_messages(
    question: str,
    chunks: Sequence[RetrievedChunk],
    history: Sequence[ChatMessage] = (),
    document_name: str | None = None,
) -> tuple[ChatMessage, ...]:
    """History is included for coherence but only the current passages are cited."""
    title = f' "{document_name}"' if document_name else ""
    user = (
        f"Passages from the document{title}:\n\n{build_context(chunks)}\n\n"
        f"Question: {question.strip()}"
    )
    trimmed = tuple(history[-6:])  # last three exchanges at most
    return (*trimmed, ChatMessage(role="user", content=user))


def context_metadata(chunks: Sequence[RetrievedChunk]) -> dict[str, str]:
    """Lets providers without real reasoning (the mock) see the passages."""
    return {"task": RAG_TASK, "context": json.dumps([c.text for c in chunks])}


def cited_indexes(answer: str, available: int) -> list[int]:
    """0-based indexes of passages the answer cites, in order of first use."""
    seen: list[int] = []
    for match in _CITATION.finditer(answer):
        idx = int(match.group(1)) - 1
        if 0 <= idx < available and idx not in seen:
            seen.append(idx)
    return seen


NOT_FOUND = "I couldn't find that in the document."
