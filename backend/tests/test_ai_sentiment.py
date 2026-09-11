"""POST /api/v1/ai/sentiment: provider integration, persistence, and error handling."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterator

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.ai import (
    AICapability,
    AIProvider,
    AIRateLimitedError,
    AIUnavailableError,
    ModelInfo,
    SentimentRequest,
    SentimentResponse,
    SentimentService,
    set_ai_provider,
)
from app.ai.providers.huggingface import HuggingFaceProvider
from app.core.config import get_settings
from app.database.session import get_session_factory
from app.models.results import SentimentResult


async def _auth(client: AsyncClient) -> dict[str, str]:
    payload = {
        "name": "Sentiment Tester",
        "email": f"{uuid.uuid4().hex[:10]}@example.com",
        "password": "Str0ngPassw0rd",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


class _StubProvider(AIProvider):
    name = "stub"

    def __init__(self, service: SentimentService) -> None:
        self._service = service

    @property
    def capabilities(self) -> frozenset[AICapability]:
        return frozenset({AICapability.SENTIMENT})

    @property
    def sentiment(self) -> SentimentService:
        return self._service


@pytest.fixture
def use_provider() -> Iterator[object]:
    """Swaps the process-wide provider for the test and restores the default after."""

    def _use(provider: AIProvider) -> None:
        set_ai_provider(provider)

    yield _use
    set_ai_provider(None)


# --- happy path (mock provider, the default in tests) -----------------------------------


async def test_sentiment_returns_label_confidence_and_stores_provenance(client: AsyncClient) -> None:
    headers = await _auth(client)

    response = await client.post(
        "/api/v1/ai/sentiment", json={"text": "The application is excellent."}, headers=headers
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sentiment"] == "POSITIVE"
    assert 0 < body["confidence"] <= 1
    assert body["provider"] == "mock" and body["model"] == "mock-sentiment"
    assert isinstance(body["processingMs"], int) and body["processingMs"] >= 0
    assert body["createdAt"]
    assert set(body) >= {"sentiment", "confidence", "id", "provider", "model", "processingMs", "createdAt"}

    async with get_session_factory()() as session:
        row = (await session.execute(select(SentimentResult).where(SentimentResult.id == uuid.UUID(body["id"])))).scalar_one()
    assert row.label.value == "positive"
    assert row.confidence == pytest.approx(body["confidence"], abs=1e-4)
    assert row.provider == "mock" and row.model == "mock-sentiment"
    assert row.processing_ms == body["processingMs"]
    assert row.created_at is not None
    assert row.input_text == "The application is excellent."


async def test_sentiment_requires_auth_and_validates_input(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/ai/sentiment", json={"text": "hi"})).status_code == 401

    headers = await _auth(client)
    blank = await client.post("/api/v1/ai/sentiment", json={"text": "   "}, headers=headers)
    assert blank.status_code == 422
    assert blank.json()["detail"][0]["loc"][-1] == "text"

    too_long = await client.post("/api/v1/ai/sentiment", json={"text": "x" * 6000}, headers=headers)
    assert too_long.status_code == 422


# --- error handling ---------------------------------------------------------------------------


async def test_provider_timeout_becomes_504(client: AsyncClient, use_provider, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    class Slow(SentimentService):
        async def analyze(self, request: SentimentRequest) -> SentimentResponse:
            await asyncio.sleep(5)
            raise AssertionError("should have timed out")

    monkeypatch.setattr(get_settings(), "ai_timeout_seconds", 0.05)
    use_provider(_StubProvider(Slow()))
    headers = await _auth(client)

    response = await client.post("/api/v1/ai/sentiment", json={"text": "slow"}, headers=headers)

    assert response.status_code == 504
    assert response.json() == {
        "detail": "The AI service took too long to respond.",
        "code": "AI_TIMEOUT",
    }


async def test_provider_rate_limit_and_unavailable_are_passed_through(client: AsyncClient, use_provider) -> None:  # type: ignore[no-untyped-def]
    class Limited(SentimentService):
        async def analyze(self, request: SentimentRequest) -> SentimentResponse:
            raise AIRateLimitedError()

    class Down(SentimentService):
        async def analyze(self, request: SentimentRequest) -> SentimentResponse:
            raise AIUnavailableError("Model is loading")

    headers = await _auth(client)

    use_provider(_StubProvider(Limited()))
    limited = await client.post("/api/v1/ai/sentiment", json={"text": "x"}, headers=headers)
    assert limited.status_code == 429 and limited.json()["code"] == "AI_RATE_LIMITED"

    use_provider(_StubProvider(Down()))
    down = await client.post("/api/v1/ai/sentiment", json={"text": "x"}, headers=headers)
    assert down.status_code == 503
    assert down.json() == {"detail": "Model is loading", "code": "AI_UNAVAILABLE"}


async def test_unexpected_provider_exception_becomes_502_not_500(client: AsyncClient, use_provider) -> None:  # type: ignore[no-untyped-def]
    class Buggy(SentimentService):
        async def analyze(self, request: SentimentRequest) -> SentimentResponse:
            raise KeyError("choices")

    use_provider(_StubProvider(Buggy()))
    headers = await _auth(client)

    response = await client.post("/api/v1/ai/sentiment", json={"text": "x"}, headers=headers)

    assert response.status_code == 502
    assert response.json()["code"] == "AI_PROVIDER_ERROR"
    assert "choices" not in response.text


async def test_provider_without_sentiment_capability_is_503(client: AsyncClient, use_provider) -> None:  # type: ignore[no-untyped-def]
    class NoSentiment(AIProvider):
        name = "bare"

        @property
        def capabilities(self) -> frozenset[AICapability]:
            return frozenset()

    use_provider(NoSentiment())
    headers = await _auth(client)

    response = await client.post("/api/v1/ai/sentiment", json={"text": "x"}, headers=headers)

    assert response.status_code == 503
    assert response.json()["code"] == "AI_CAPABILITY_UNSUPPORTED"


async def test_failed_calls_store_nothing(client: AsyncClient, use_provider) -> None:  # type: ignore[no-untyped-def]
    class Down(SentimentService):
        async def analyze(self, request: SentimentRequest) -> SentimentResponse:
            raise AIUnavailableError()

    use_provider(_StubProvider(Down()))
    headers = await _auth(client)
    marker = f"unique-{uuid.uuid4().hex}"

    await client.post("/api/v1/ai/sentiment", json={"text": marker}, headers=headers)

    async with get_session_factory()() as session:
        rows = (await session.execute(select(SentimentResult).where(SentimentResult.input_text == marker))).all()
    assert rows == []


# --- hugging face end to end through the route (fake transport) --------------------------------


async def test_route_with_hugging_face_provider_never_leaks_the_token(client: AsyncClient, use_provider) -> None:  # type: ignore[no-untyped-def]
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["Authorization"]
        return httpx.Response(
            200, json=[[{"label": "positive", "score": 0.97}, {"label": "negative", "score": 0.03}]]
        )

    provider = HuggingFaceProvider("hf_secret_token", transport=httpx.MockTransport(handler))
    use_provider(provider)
    headers = await _auth(client)
    try:
        response = await client.post(
            "/api/v1/ai/sentiment", json={"text": "The application is excellent."}, headers=headers
        )
    finally:
        await provider.close()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sentiment"] == "POSITIVE" and body["confidence"] == 0.97
    assert body["provider"] == "huggingface"
    assert body["model"] == "cardiffnlp/twitter-roberta-base-sentiment-latest"
    assert seen["auth"] == "Bearer hf_secret_token"
    assert "hf_secret_token" not in response.text
    for header_value in response.headers.values():
        assert "hf_secret_token" not in header_value


async def test_sentiment_result_stores_model_and_confidence(client: AsyncClient) -> None:
    class Fixed(SentimentService):
        async def analyze(self, request: SentimentRequest) -> SentimentResponse:
            return SentimentResponse(
                label="negative",
                confidence=0.8123,
                model=ModelInfo(provider="vendor-x", model="model-y"),
                scores={"negative": 0.8123, "neutral": 0.1, "positive": 0.0877},
            )

    set_ai_provider(_StubProvider(Fixed()))
    try:
        headers = await _auth(client)
        response = await client.post("/api/v1/ai/sentiment", json={"text": "meh"}, headers=headers)
    finally:
        set_ai_provider(None)

    body = response.json()
    assert body["sentiment"] == "NEGATIVE"
    assert body["provider"] == "vendor-x" and body["model"] == "model-y"
    assert body["scores"]["negative"] == 0.8123
