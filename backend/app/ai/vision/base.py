from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.ai.base import ImageInput, ModelInfo, Usage


@dataclass(frozen=True)
class VisionRequest:
    image: ImageInput
    """What to do with the image; providers without prompting ignore it."""
    prompt: str | None = None
    max_tokens: int = 256


@dataclass(frozen=True)
class VisionLabel:
    name: str
    confidence: float


@dataclass(frozen=True)
class VisionResponse:
    """Natural-language description plus optional labels/tags."""

    description: str
    model: ModelInfo
    labels: tuple[VisionLabel, ...] = field(default_factory=tuple)
    usage: Usage = Usage()


class VisionService(ABC):
    """Understands image content (captioning, Q&A, tagging)."""

    @abstractmethod
    async def describe(self, request: VisionRequest) -> VisionResponse: ...
