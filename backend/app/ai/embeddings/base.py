from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.ai.base import ModelInfo, Usage


@dataclass(frozen=True)
class EmbeddingRequest:
    texts: tuple[str, ...]
    """Hint for asymmetric models: "query" vs "document"."""
    purpose: str = "document"


@dataclass(frozen=True)
class EmbeddingResponse:
    """One vector per input text, in the same order."""

    vectors: tuple[tuple[float, ...], ...]
    dimensions: int
    model: ModelInfo
    usage: Usage = Usage()


class EmbeddingService(ABC):
    @abstractmethod
    async def embed(self, request: EmbeddingRequest) -> EmbeddingResponse: ...

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Vector size, so storage schemas can be sized without a call."""
