"""
Core AI abstractions.

    AIProvider                 one vendor / runtime (Hugging Face, OpenAI, local, mock)
      ├── chat                 ChatService
      ├── vision               VisionService
      ├── sentiment            SentimentService
      ├── summarization        SummarizationService
      ├── embeddings           EmbeddingService
      ├── ocr                  OCRService
      └── extraction           ExtractionService (classify + structured fields)

Everything outside `app/ai/providers/` depends only on the interfaces in
`app/ai/<capability>/base.py` and on this module. Controllers obtain a
service through `app/api/deps.py`, which asks the registry for whatever
provider `AI_PROVIDER` names; swapping vendors is a config change.
"""

from __future__ import annotations

import enum
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from fastapi import status

from app.core.exceptions import AppError

if TYPE_CHECKING:
    from app.ai.chat.base import ChatService
    from app.ai.embeddings.base import EmbeddingService
    from app.ai.extraction.base import ExtractionService
    from app.ai.ocr.base import OCRService
    from app.ai.sentiment.base import SentimentService
    from app.ai.summarization.base import SummarizationService
    from app.ai.vision.base import VisionService


class AICapability(str, enum.Enum):
    CHAT = "chat"
    VISION = "vision"
    SENTIMENT = "sentiment"
    SUMMARIZATION = "summarization"
    EMBEDDINGS = "embeddings"
    OCR = "ocr"
    EXTRACTION = "extraction"


# --- Errors ----------------------------------------------------------------------
# Providers translate their own exceptions into these so controllers and
# clients see one vocabulary regardless of vendor.


class AIError(AppError):
    """The provider failed to produce a result."""

    status_code = status.HTTP_502_BAD_GATEWAY
    code = "AI_PROVIDER_ERROR"
    message = "The AI service could not complete the request."


class AIUnavailableError(AIError):
    """Not configured, model loading, or the capability is unsupported."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "AI_UNAVAILABLE"
    message = "The AI service is temporarily unavailable."


class AIRateLimitedError(AIError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "AI_RATE_LIMITED"
    message = "Too many AI requests. Please wait a moment and try again."


class AIInvalidInputError(AIError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "AI_INVALID_INPUT"
    message = "The AI service rejected the input."


class AITimeoutError(AIError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    code = "AI_TIMEOUT"
    message = "The AI service took too long to respond."


# --- Shared value objects ------------------------------------------------------


@dataclass(frozen=True)
class Usage:
    """Token accounting when the provider reports it; zeros otherwise."""

    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass(frozen=True)
class ModelInfo:
    """Which provider/model produced a result; stored alongside results."""

    provider: str
    model: str


@dataclass(frozen=True)
class ProviderHealth:
    provider: str
    ok: bool
    capabilities: frozenset[AICapability]
    detail: str | None = None


@dataclass(frozen=True)
class ImageInput:
    """Raw image bytes plus MIME type; providers encode as they need."""

    data: bytes
    mime_type: str = "image/jpeg"
    labels: tuple[str, ...] = field(default_factory=tuple)


# --- Provider -----------------------------------------------------------------------


class AIProvider(ABC):
    """
    A bundle of capability services from one vendor. Subclasses implement
    the services they support and return `None` for the rest; callers use
    `require_*` to get a typed service or a clear 503.
    """

    name: str = "abstract"

    @property
    @abstractmethod
    def capabilities(self) -> frozenset[AICapability]: ...

    # Optional services. Default: unsupported.
    @property
    def chat(self) -> ChatService | None:
        return None

    @property
    def vision(self) -> VisionService | None:
        return None

    @property
    def sentiment(self) -> SentimentService | None:
        return None

    @property
    def summarization(self) -> SummarizationService | None:
        return None

    @property
    def embeddings(self) -> EmbeddingService | None:
        return None

    @property
    def ocr(self) -> OCRService | None:
        return None

    @property
    def extraction(self) -> ExtractionService | None:
        return None

    # Typed accessors that fail loudly.
    def require_chat(self) -> ChatService:
        return self._require(self.chat, AICapability.CHAT)

    def require_vision(self) -> VisionService:
        return self._require(self.vision, AICapability.VISION)

    def require_sentiment(self) -> SentimentService:
        return self._require(self.sentiment, AICapability.SENTIMENT)

    def require_summarization(self) -> SummarizationService:
        return self._require(self.summarization, AICapability.SUMMARIZATION)

    def require_embeddings(self) -> EmbeddingService:
        return self._require(self.embeddings, AICapability.EMBEDDINGS)

    def require_ocr(self) -> OCRService:
        return self._require(self.ocr, AICapability.OCR)

    def require_extraction(self) -> ExtractionService:
        return self._require(self.extraction, AICapability.EXTRACTION)

    async def health(self) -> ProviderHealth:
        """Cheap liveness check; providers override to ping their backend."""
        return ProviderHealth(provider=self.name, ok=True, capabilities=self.capabilities)

    async def close(self) -> None:
        """Release connections. Called from the app lifespan."""

    def _require(self, service, capability: AICapability):  # type: ignore[no-untyped-def]
        if service is None:
            raise AIUnavailableError(
                f"The configured AI provider ({self.name}) does not support {capability.value}.",
                code="AI_CAPABILITY_UNSUPPORTED",
            )
        return service
