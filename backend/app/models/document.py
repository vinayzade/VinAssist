from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import DocumentKind, DocumentStatus

if TYPE_CHECKING:
    from app.models.rag import DocumentChunk
    from app.models.results import ImageQualityResult, OcrResult
    from app.models.user import User


class Document(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    A file the user uploaded (PDF or image). The bytes live in object storage
    under `storage_key`; this row tracks metadata, processing state, and the
    extraction/analysis output. Mirrors `DocumentDetail` in the mobile app.
    """

    __tablename__ = "documents"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    extension: Mapped[str] = mapped_column(String(16), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    kind: Mapped[DocumentKind] = mapped_column(
        Enum(DocumentKind, name="document_kind", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        server_default=DocumentStatus.UPLOADED.value,
    )
    storage_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    sha256: Mapped[str | None] = mapped_column(String(64))

    extracted_text: Mapped[str | None] = mapped_column(Text)
    # {"summary": str, "keyPoints": [str], "documentType": str | null}
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # RAG index state (see models.rag.DocumentChunk).
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    embedding_model: Mapped[str | None] = mapped_column(String(100))

    user: Mapped[User] = relationship(back_populates="documents")
    ocr_results: Mapped[list[OcrResult]] = relationship(back_populates="document")
    image_quality_results: Mapped[list[ImageQualityResult]] = relationship(
        back_populates="document"
    )
    chunks: Mapped[list[DocumentChunk]] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="size_positive"),
        # Listing is always "this user's documents, newest first".
        Index("ix_documents_user_created", "user_id", "created_at"),
    )
