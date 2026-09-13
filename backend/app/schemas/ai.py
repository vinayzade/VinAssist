from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

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


# --- Assistant (multimodal, app-scoped chat) --------------------------------------------

ASSISTANT_MESSAGE_MAX = 4_000
ASSISTANT_OCR_TEXT_MAX = 20_000

AttachmentTypeIn = Literal["document", "image", "ocr", "analysis"]
AnalysisKindIn = Literal["image_quality", "sentiment", "extraction", "summary", "other"]


class AssistantAttachmentIn(CamelModel):
    """
    One piece of the user's material for this turn.

    - `document`: an uploaded PDF/image, by id (retrieved with RAG).
    - `image`: an uploaded image, by id; `text` may carry on-device OCR of it.
    - `ocr`: text recognised on the device, sent inline.
    - `analysis`: a result the app produced (image quality, sentiment, ...).
    """

    type: AttachmentTypeIn
    document_id: uuid.UUID | None = None
    text: str | None = Field(default=None, max_length=ASSISTANT_OCR_TEXT_MAX)
    title: str | None = Field(default=None, max_length=120)
    kind: AnalysisKindIn | None = None
    data: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _check_shape(self) -> AssistantAttachmentIn:
        if self.type in ("document", "image") and self.document_id is None:
            raise ValueError(f"{self.type} attachments need a documentId")
        if self.type == "ocr" and not (self.text or "").strip():
            raise ValueError("ocr attachments need text")
        if self.type == "analysis" and (self.kind is None or not isinstance(self.data, dict)):
            raise ValueError("analysis attachments need kind and data")
        return self


class AssistantChatRequestIn(CamelModel):
    conversation_id: uuid.UUID | None = None
    """May be blank when attachments are present; the assistant then describes them."""
    message: str = Field(default="", max_length=ASSISTANT_MESSAGE_MAX)
    attachments: list[AssistantAttachmentIn] = Field(default_factory=list, max_length=5)
    input_mode: Literal["text", "voice"] = "text"

    @model_validator(mode="after")
    def _something_to_say(self) -> AssistantChatRequestIn:
        self.message = self.message.strip()
        if not self.message and not self.attachments:
            raise ValueError("Type a message or attach something")
        return self


class AssistantContextItemOut(CamelModel):
    """Material the conversation currently holds (attachments from all turns)."""

    type: AttachmentTypeIn
    document_id: uuid.UUID | None = None
    title: str
    kind: str | None = None
    """For documents/images: whether passages are available for retrieval."""
    indexed: bool | None = None
    note: str | None = None


class AssistantSourceOut(SourceChunkOut):
    document_id: uuid.UUID
    document_name: str | None = None


AssistantScopeOut = Literal["material", "no_material"]


class AssistantChatOut(CamelModel):
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    answer: str
    sources: list[AssistantSourceOut]
    """False when the assistant could not answer from the material."""
    grounded: bool
    """`no_material` means nothing is attached yet and the model was not called."""
    scope: AssistantScopeOut
    suggestions: list[str]
    context: list[AssistantContextItemOut]
    model_name: str
    provider: str
    retrieval_ms: int
    generation_ms: int
    processing_ms: int
    created_at: datetime


class AssistantMessageOut(CamelModel):
    id: uuid.UUID
    role: Literal["user", "assistant", "system"]
    content: str
    attachments: list[AssistantContextItemOut] = Field(default_factory=list)
    sources: list[AssistantSourceOut] = Field(default_factory=list)
    grounded: bool | None = None
    created_at: datetime


class AssistantConversationOut(CamelModel):
    id: uuid.UUID
    title: str | None
    messages: list[AssistantMessageOut]
    context: list[AssistantContextItemOut]
    created_at: datetime
    updated_at: datetime


class AssistantConversationSummaryOut(CamelModel):
    id: uuid.UUID
    title: str | None
    last_message_at: datetime | None
    created_at: datetime
