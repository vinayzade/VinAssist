from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.base import CamelModel

TEXT_MAX = 200_000


class SaveOcrResultRequest(CamelModel):
    """Recognition ran on the device; we store the outcome, not the image."""

    text: str = Field(max_length=TEXT_MAX)
    confidence: float | None = Field(default=None, ge=0, le=1)
    language: str | None = Field(default=None, max_length=16)
    engine: str = Field(min_length=1, max_length=100)
    processing_ms: int | None = Field(default=None, ge=0)
    image_width: int | None = Field(default=None, ge=0)
    image_height: int | None = Field(default=None, ge=0)
    source_uri: str | None = Field(default=None, max_length=2048)

    @field_validator("text")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class OcrResultSummary(CamelModel):
    id: uuid.UUID
    preview: str
    word_count: int
    confidence: float | None
    language: str | None
    engine: str
    created_at: datetime


class OcrResultDetail(OcrResultSummary):
    text: str
