from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class ActivityKind(str, enum.Enum):
    """Mirrors `ActivityKind` in the app's `historyApi.ts`."""

    OCR = "ocr"
    DOCUMENT_ANALYSIS = "document_analysis"
    IMAGE_ANALYSIS = "image_analysis"
    IMAGE_QUALITY = "image_quality"
    SENTIMENT = "sentiment"
    CONVERSATION = "conversation"


class AIActivity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    One entry in the user's AI activity history.

    Every AI operation records one row here (a conversation records one row
    that is refreshed on each turn). The row carries what the history list
    needs (kind, title, preview, favourite) plus a pointer to the detailed
    result in its own table and a JSON snapshot for kinds without one.
    """

    __tablename__ = "ai_activities"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[ActivityKind] = mapped_column(
        Enum(ActivityKind, name="activity_kind", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    preview: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Row in the kind's own table (ocr_results, ai_conversations, ...), when any.
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    favourite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Result snapshot for the detail view (scores, labels, model, ...).
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # When the underlying operation last happened (a conversation's latest turn).
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship(back_populates="activities")

    __table_args__ = (
        Index("ix_ai_activities_user_last_activity", "user_id", "last_activity_at"),
        Index("ix_ai_activities_user_kind", "user_id", "kind"),
        Index("ix_ai_activities_user_favourite", "user_id", "favourite"),
        Index("ix_ai_activities_ref", "ref_id"),
    )
