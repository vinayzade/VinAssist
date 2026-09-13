from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.activity import AIActivity
    from app.models.ai import AIConversation
    from app.models.document import Document
    from app.models.results import ImageQualityResult, OcrResult, SentimentResult


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    documents: Mapped[list[Document]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    conversations: Mapped[list[AIConversation]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    ocr_results: Mapped[list[OcrResult]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    image_quality_results: Mapped[list[ImageQualityResult]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    activities: Mapped[list[AIActivity]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    sentiment_results: Mapped[list[SentimentResult]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        # Case-insensitive uniqueness: "Ann@x.com" and "ann@x.com" are one account.
        Index("uq_users_email_lower", func.lower(email), unique=True),
    )


class RefreshToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    One row per issued refresh token. Only a SHA-256 hash is stored; the raw
    token lives solely on the device. Rotation links the replacement so a
    reused (stolen) token can be detected and the whole chain revoked.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("refresh_tokens.id", ondelete="SET NULL")
    )
    user_agent: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(INET)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")

    @property
    def is_valid(self) -> bool:
        return self.revoked_at is None and self.expires_at > utcnow()
