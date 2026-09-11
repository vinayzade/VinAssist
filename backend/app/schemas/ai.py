from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator

from app.schemas.base import CamelModel

SENTIMENT_TEXT_MAX = 5_000

SentimentLabelOut = Literal["POSITIVE", "NEUTRAL", "NEGATIVE"]


class SentimentRequestIn(CamelModel):
    text: str = Field(min_length=1, max_length=SENTIMENT_TEXT_MAX)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter some text to analyse")
        return value


class SentimentOut(CamelModel):
    """`{ "sentiment": "POSITIVE", "confidence": 0.97 }` plus provenance."""

    sentiment: SentimentLabelOut
    confidence: float = Field(ge=0, le=1)
    explanation: str | None = None
    scores: dict[str, float] = Field(default_factory=dict)

    # Provenance, also persisted in `sentiment_results`.
    id: uuid.UUID
    provider: str
    model: str
    processing_ms: int
    created_at: datetime


SUMMARY_TEXT_MAX = 20_000

SummaryModeIn = Literal["quick", "detailed", "bullet_points", "action_items"]


class SummarizeRequestIn(CamelModel):
    text: str = Field(min_length=1, max_length=SUMMARY_TEXT_MAX)
    mode: SummaryModeIn = "quick"
    """Hint about origin ("ocr", "document", "chat"); lets the model tolerate noise."""
    source: str | None = Field(default=None, max_length=32)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value.split()) < 3:
            raise ValueError("Enter at least a few words to summarise")
        return value


class SummarizeOut(CamelModel):
    summary: str
    """Bullet or action items for list modes; empty for prose modes."""
    items: list[str] = Field(default_factory=list)
    mode: SummaryModeIn
    document_type: str | None = None
    processing_ms: int
    model_name: str
    provider: str
    created_at: datetime


EXTRACT_TEXT_MAX = 20_000

DocumentTypeIn = Literal["BUSINESS_CARD", "RESUME", "INVOICE", "RECEIPT", "GENERIC"]


class ExtractRequestIn(CamelModel):
    text: str = Field(min_length=1, max_length=EXTRACT_TEXT_MAX)
    """Skip classification and extract as this type."""
    document_type: DocumentTypeIn | None = None

    @field_validator("text")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value.split()) < 2:
            raise ValueError("Enter some text to analyse")
        return value


class ExtractOut(CamelModel):
    document_type: DocumentTypeIn
    """0-1 confidence in the classification (1.0 when the type was given)."""
    confidence: float = Field(ge=0, le=1)
    """Validated, schema-shaped fields for `document_type`; unknowns are null."""
    data: dict[str, Any]
    scores: dict[str, float] = Field(default_factory=dict)
    """Fields the validator dropped or could not verify, in plain language."""
    warnings: list[str] = Field(default_factory=list)
    """Share of top-level fields that ended up populated, 0-1."""
    completeness: float = Field(ge=0, le=1)
    processing_ms: int
    model_name: str
    provider: str
    created_at: datetime


# --- Document chat (RAG) ---------------------------------------------------------


class ChatTurn(CamelModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4_000)


class DocumentChatRequestIn(CamelModel):
    document_id: uuid.UUID
    question: str = Field(min_length=1, max_length=2_000)
    """Previous turns for follow-up questions; the current question goes last."""
    history: list[ChatTurn] = Field(default_factory=list, max_length=10)

    @field_validator("question")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Ask a question about the document")
        return value


class SourceChunkOut(CamelModel):
    chunk_id: uuid.UUID
    chunk_index: int
    text: str
    start_offset: int
    end_offset: int
    """Cosine similarity to the question, 0-1."""
    similarity: float
    """True when the answer cites this passage as [n]."""
    cited: bool


class DocumentChatOut(CamelModel):
    document_id: uuid.UUID
    question: str
    answer: str
    """Passages retrieved for this question, most similar first."""
    sources: list[SourceChunkOut]
    """False when nothing relevant was found and the model was told so."""
    grounded: bool
    model_name: str
    provider: str
    retrieval_ms: int
    generation_ms: int
    processing_ms: int
    created_at: datetime


class IndexDocumentRequestIn(CamelModel):
    """Text from on-device OCR; omit to use the stored PDF text layer."""
    text: str | None = Field(default=None, max_length=200_000)
    force: bool = False


class IndexDocumentOut(CamelModel):
    document_id: uuid.UUID
    chunk_count: int
    characters: int
    embedding_model: str
    processing_ms: int
