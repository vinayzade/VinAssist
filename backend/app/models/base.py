"""
Column mixins every table uses so ids and timestamps are uniform.

- `id` is a UUID generated in Python (so it is known before the flush) with
  a PostgreSQL `gen_random_uuid()` server default as a fallback for rows
  inserted outside the ORM.
- `created_at` / `updated_at` are timezone-aware and maintained by the
  database (`now()`), so they are correct regardless of which process or
  language writes the row.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AIResultMixin:
    """Provenance shared by every stored model output."""

    provider: Mapped[str | None] = mapped_column(nullable=True)
    model: Mapped[str | None] = mapped_column(nullable=True)
    processing_ms: Mapped[int | None] = mapped_column(nullable=True)
