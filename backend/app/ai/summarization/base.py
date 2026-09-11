from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

from app.ai.base import ModelInfo, Usage

SummaryMode = Literal["quick", "detailed", "bullet_points", "action_items"]

SUMMARY_MODES: tuple[SummaryMode, ...] = ("quick", "detailed", "bullet_points", "action_items")

# Default length budget per mode, in words.
MODE_MAX_WORDS: dict[SummaryMode, int] = {
    "quick": 60,
    "detailed": 220,
    "bullet_points": 160,
    "action_items": 160,
}


@dataclass(frozen=True)
class SummarizationRequest:
    text: str
    mode: SummaryMode = "quick"
    """Upper bound on summary length, in words. None = the mode's default."""
    max_words: int | None = None
    """Hint about origin ("ocr", "document", "chat") so noise can be tolerated."""
    source: str | None = None
    language: str | None = None

    @property
    def word_budget(self) -> int:
        return self.max_words or MODE_MAX_WORDS[self.mode]


@dataclass(frozen=True)
class SummarizationResponse:
    """
    `summary` is always prose (one or more sentences). For `bullet_points`
    and `action_items`, `items` carries the list and `summary` is a one-line
    lead-in, so clients can render either form.
    """

    summary: str
    model: ModelInfo
    mode: SummaryMode = "quick"
    items: tuple[str, ...] = field(default_factory=tuple)
    """Best guess at the document category, e.g. "invoice", when inferable."""
    document_type: str | None = None
    usage: Usage = Usage()


class SummarizationService(ABC):
    @abstractmethod
    async def summarize(self, request: SummarizationRequest) -> SummarizationResponse: ...
