"""
Server-side OCR interface.

The app performs OCR on the device (ML Kit) and never uploads images for it.
This interface exists for server-side jobs on stored documents (e.g. PDFs
already in storage) and for providers that ship a text-recognition model.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.ai.base import ImageInput, ModelInfo


@dataclass(frozen=True)
class OCRRequest:
    image: ImageInput
    language: str | None = None


@dataclass(frozen=True)
class OCRLine:
    text: str
    confidence: float | None = None


@dataclass(frozen=True)
class OCRResponse:
    text: str
    model: ModelInfo
    lines: tuple[OCRLine, ...] = field(default_factory=tuple)
    confidence: float | None = None
    language: str | None = None


class OCRService(ABC):
    @abstractmethod
    async def recognize(self, request: OCRRequest) -> OCRResponse: ...
