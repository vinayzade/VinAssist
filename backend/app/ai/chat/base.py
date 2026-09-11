from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal

from app.ai.base import AIUnavailableError, ModelInfo, Usage

ChatRole = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class ChatMessage:
    role: ChatRole
    content: str


@dataclass(frozen=True)
class ChatRequest:
    messages: tuple[ChatMessage, ...]
    """Optional instruction prepended as the system prompt when the caller has none."""
    system: str | None = None
    max_tokens: int = 512
    temperature: float = 0.7
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ChatResponse:
    message: ChatMessage
    model: ModelInfo
    usage: Usage = Usage()
    finish_reason: str | None = None


class ChatService(ABC):
    """Multi-turn conversation with a language model."""

    @abstractmethod
    async def complete(self, request: ChatRequest) -> ChatResponse: ...

    async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
        """Yields the reply incrementally. Optional; default is unsupported."""
        raise AIUnavailableError("Streaming is not supported by this provider.")
        yield ""  # pragma: no cover - makes this an async generator
