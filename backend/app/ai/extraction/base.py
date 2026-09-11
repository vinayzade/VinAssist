"""
Document classification + structured extraction interface.

    OCR text -> classify() -> DocumentType -> extract() -> typed data

Providers return *raw* candidate JSON; the application layer validates it
(see `validation.py`) before anything reaches a client. Providers must not
be trusted to honour the schema.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.ai.base import ModelInfo, Usage
from app.ai.extraction.schemas import DocumentType


@dataclass(frozen=True)
class ClassificationRequest:
    text: str
    language: str | None = None


@dataclass(frozen=True)
class ClassificationResponse:
    document_type: DocumentType
    """0-1 confidence in `document_type`."""
    confidence: float
    model: ModelInfo
    """Per-type scores when available."""
    scores: dict[str, float] = field(default_factory=dict)
    usage: Usage = Usage()


@dataclass(frozen=True)
class ExtractionRequest:
    text: str
    document_type: DocumentType
    language: str | None = None


@dataclass(frozen=True)
class ExtractionResponse:
    """`data` is whatever the model produced, still unvalidated."""

    document_type: DocumentType
    data: dict[str, Any]
    model: ModelInfo
    usage: Usage = Usage()
    """Free-form caveats from the provider (low confidence, truncated input...)."""
    notes: tuple[str, ...] = field(default_factory=tuple)


class ExtractionService(ABC):
    @abstractmethod
    async def classify(self, request: ClassificationRequest) -> ClassificationResponse: ...

    @abstractmethod
    async def extract(self, request: ExtractionRequest) -> ExtractionResponse: ...
