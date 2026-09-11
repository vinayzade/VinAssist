from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.enums import BlurLevel, ExposureLevel
from app.schemas.base import CamelModel

QualityStatus = Literal["GOOD", "FAIR", "POOR"]
ResolutionGrade = Literal["LOW", "OK", "GOOD"]


class QualityChecks(CamelModel):
    face_detected: bool
    blur: bool
    low_light: bool
    overexposed: bool
    multiple_faces: bool
    face_outside_frame: bool
    resolution: ResolutionGrade


class SaveImageQualityRequest(CamelModel):
    """Scores computed on the device; the image itself is never sent."""

    overall_score: int = Field(ge=0, le=100)
    status: QualityStatus
    blur_score: int = Field(ge=0, le=100)
    brightness_score: int = Field(ge=0, le=100)
    resolution_score: int = Field(ge=0, le=100)
    face_score: int | None = Field(default=None, ge=0, le=100)
    face_count: int = Field(ge=0)
    checks: QualityChecks
    warnings: list[str] = Field(default_factory=list, max_length=20)
    recommendation: str = Field(max_length=500)
    engine: str = Field(min_length=1, max_length=100)
    processing_ms: int | None = Field(default=None, ge=0)
    image_width: int | None = Field(default=None, ge=0)
    image_height: int | None = Field(default=None, ge=0)
    source_uri: str | None = Field(default=None, max_length=2048)

    @property
    def blur_level(self) -> BlurLevel:
        if self.checks.blur:
            return BlurLevel.HEAVY if self.blur_score < 25 else BlurLevel.SLIGHT
        return BlurLevel.NONE

    @property
    def exposure_level(self) -> ExposureLevel:
        if self.checks.low_light:
            return ExposureLevel.UNDER
        if self.checks.overexposed:
            return ExposureLevel.OVER
        return ExposureLevel.GOOD


class ImageQualitySummary(CamelModel):
    id: uuid.UUID
    score: int
    status: QualityStatus
    blur: BlurLevel
    exposure: ExposureLevel
    issues: list[str]
    engine: str
    created_at: datetime
