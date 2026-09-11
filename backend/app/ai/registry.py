"""
Provider registry: the only place that knows concrete provider classes.

    AI_PROVIDER=mock         -> MockProvider (default; no network, no keys)
    AI_PROVIDER=huggingface  -> HuggingFaceProvider (needs HUGGINGFACE_API_KEY)

Adding a vendor = one factory function registered in `_FACTORIES`.
Controllers never import from here; they use `app.api.deps`.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from app.ai.base import AIProvider, AIUnavailableError
from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

ProviderFactory = Callable[[Settings], AIProvider]


def _mock(_: Settings) -> AIProvider:
    from app.ai.providers.mock import MockProvider

    return MockProvider()


def _huggingface(settings: Settings) -> AIProvider:
    from app.ai.providers.huggingface import HuggingFaceModels, HuggingFaceProvider

    if not settings.huggingface_api_key:
        raise AIUnavailableError(
            "AI_PROVIDER is 'huggingface' but HUGGINGFACE_API_KEY is not set.",
            code="AI_MISCONFIGURED",
        )
    return HuggingFaceProvider(
        settings.huggingface_api_key,
        models=HuggingFaceModels(
            chat=settings.hf_chat_model,
            sentiment=settings.hf_sentiment_model,
            summarization=settings.hf_summarization_model,
            embeddings=settings.hf_embedding_model,
            vision=settings.hf_vision_model,
            embedding_dimensions=settings.hf_embedding_dimensions,
        ),
        base_url=settings.huggingface_base_url,
        chat_url=settings.huggingface_chat_url,
        timeout=settings.ai_timeout_seconds,
    )


_FACTORIES: dict[str, ProviderFactory] = {
    "mock": _mock,
    "huggingface": _huggingface,
}

_current: AIProvider | None = None


def available_providers() -> tuple[str, ...]:
    return tuple(_FACTORIES)


def register_provider(name: str, factory: ProviderFactory) -> None:
    """Lets plugins/tests add vendors without editing this module."""
    _FACTORIES[name] = factory


def create_provider(settings: Settings | None = None) -> AIProvider:
    settings = settings or get_settings()
    try:
        factory = _FACTORIES[settings.ai_provider]
    except KeyError as exc:
        raise AIUnavailableError(
            f"Unknown AI_PROVIDER {settings.ai_provider!r}. "
            f"Available: {', '.join(_FACTORIES)}.",
            code="AI_MISCONFIGURED",
        ) from exc
    provider = factory(settings)
    logger.info("AI provider: %s (%s)", provider.name, ", ".join(sorted(c.value for c in provider.capabilities)))
    return provider


def get_ai_provider() -> AIProvider:
    """Process-wide provider, created lazily on first use."""
    global _current
    if _current is None:
        _current = create_provider()
    return _current


def set_ai_provider(provider: AIProvider | None) -> None:
    """Overrides the process-wide provider (tests, admin tooling)."""
    global _current
    _current = provider


async def shutdown_ai_provider() -> None:
    global _current
    if _current is not None:
        await _current.close()
        _current = None
