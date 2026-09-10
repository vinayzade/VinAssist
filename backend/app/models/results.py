"""
Stored outputs of the single-shot AI features (OCR, image quality,
sentiment). Each row is one run; the app's History screen is built from
these plus documents and conversations.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.base import AIResultMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import BlurLevel, ExposureLevel, SentimentLabel

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.user import User


def _user_fk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def _document_fk() -> Mapped[uuid.UUID | None]:
    # Optional: results can come from an ad-hoc camera capture that was never
    # saved as a document. Deleting the document keeps the result.
    return mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"))


class OcrResult(UUIDPrimaryKeyMixin, TimestampMixin, AIResultMixin, Base):
    __tablename__ = "ocr_results"

    user_id: Mapped[uuid.UUID] = _user_fk()
    document_id: Mapped[uuid.UUID | None] = _document_fk()
    source_key: Mapped[str | None] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    language: Mapped[str | None] = mapped_column(String(16))

    user: Mapped[User] = relationship(back_populates="ocr_results")
    document: Mapped[Document | None] = relationship(back_populates="ocr_results")

    __table_args__ = (
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)", name="confidence_range"
        ),
        Index("ix_ocr_results_user_created", "user_id", "created_at"),
    )


class ImageQualityResult(UUIDPrimaryKeyMixin, TimestampMixin, AIResultMixin, Base):
    __tablename__ = "image_quality_results"

    user_id: Mapped[uuid.UUID] = _user_fk()
    document_id: Mapped[uuid.UUID | None] = _document_fk()
    source_key: Mapped[str | None] = mapped_column(Text)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    blur: Mapped[BlurLevel] = mapped_column(
        Enum(BlurLevel, name="blur_level", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    exposure: Mapped[ExposureLevel] = mapped_column(
        Enum(ExposureLevel, name="exposure_level", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    # ["low resolution", "glare on page", ...]
    issues: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")

    user: Mapped[User] = relationship(back_populates="image_quality_results")
    document: Mapped[Document | None] = relationship(back_populates="image_quality_results")

    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= 100", name="score_range"),
        Index("ix_image_quality_results_user_created", "user_id", "created_at"),
    )


class SentimentResult(UUIDPrimaryKeyMixin, TimestampMixin, AIResultMixin, Base):
    __tablename__ = "sentiment_results"

    user_id: Mapped[uuid.UUID] = _user_fk()
    input_text: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[SentimentLabel] = mapped_column(
        Enum(SentimentLabel, name="sentiment_label", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="sentiment_results")

    __table_args__ = (
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="confidence_range"),
        Index("ix_sentiment_results_user_created", "user_id", "created_at"),
    )
