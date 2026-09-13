from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.base import CamelModel

ActivityKindOut = Literal[
    "ocr", "document_analysis", "image_analysis", "image_quality", "sentiment", "conversation"
]


class ActivityOut(CamelModel):
    """Matches `ActivityItem` in the app's `historyApi.ts`."""

    id: uuid.UUID
    kind: ActivityKindOut
    title: str
    preview: str
    favourite: bool
    """Id of the detailed result (conversation, OCR result, ...), when any."""
    ref_id: uuid.UUID | None = None
    last_activity_at: datetime
    created_at: datetime


class ActivityDetailOut(ActivityOut):
    payload: dict[str, Any] | None = None


class ActivityUpdateIn(CamelModel):
    title: str | None = Field(default=None, max_length=200)
    favourite: bool | None = None

    @field_validator("title")
    @classmethod
    def _not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Enter a name")
        return value

    @model_validator(mode="after")
    def _something_to_change(self) -> ActivityUpdateIn:
        if self.title is None and self.favourite is None:
            raise ValueError("Nothing to update")
        return self
