from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

from app.ai.base import ModelInfo

SentimentLabel = Literal["positive", "neutral", "negative"]


@dataclass(frozen=True)
class SentimentRequest:
    text: str
    language: str | None = None


@dataclass(frozen=True)
class SentimentResponse:
    label: SentimentLabel
    """0-1 confidence in `label`."""
    confidence: float
    model: ModelInfo
    """Per-label probabilities when the model exposes them."""
    scores: dict[str, float] = field(default_factory=dict)
    explanation: str | None = None


class SentimentService(ABC):
    @abstractmethod
    async def analyze(self, request: SentimentRequest) -> SentimentResponse: ...
