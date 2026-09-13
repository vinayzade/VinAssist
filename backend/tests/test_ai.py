"""AI abstraction: interfaces, providers, registry, and decoupling."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import httpx
import pytest

from app.ai import (
    AICapability,
    AIError,
    AIInvalidInputError,
    AIProvider,
    AIRateLimitedError,
    AITimeoutError,
    AIUnavailableError,
    ChatMessage,
    ChatRequest,
    EmbeddingRequest,
    ImageInput,
    OCRRequest,
    SentimentRequest,
    SummarizationRequest,
    VisionRequest,
    available_providers,
    create_provider,
    get_ai_provider,
    register_provider,
    set_ai_provider,
)
from app.ai.providers.huggingface import HuggingFaceProvider
from app.ai.providers.mock import MockProvider
from app.core.config import Settings


BACKEND = Path(__file__).resolve().parents[1]


# --- interface contracts (run against the mock provider) --------------------------------


@pytest.fixture
def provider() -> AIProvider:
    return MockProvider()


async def test_chat_returns_assistant_reply_with_usage(provider: AIProvider) -> None:
    chat = provider.require_chat()
    response = await chat.complete(
        ChatRequest(messages=(ChatMessage("system", "Be brief."), ChatMessage("user", "Hello there")))
    )
    assert response.message.role == "assistant"
    assert "Hello there" in response.message.content
    assert response.model.provider == "mock"
    assert response.usage.total_tokens > 0

    chunks = [c async for c in chat.stream(ChatRequest(messages=(ChatMessage("user", "hi"),)))]
    assert "".join(chunks).strip() == response.message.content.replace("Hello there", "hi")


async def test_chat_rejects_conversations_without_a_user_turn(provider: AIProvider) -> None:
    with pytest.raises(AIInvalidInputError):
        await provider.require_chat().complete(ChatRequest(messages=(ChatMessage("system", "x"),)))


async def test_sentiment_labels_and_scores(provider: AIProvider) -> None:
    sentiment = provider.require_sentiment()
    good = await sentiment.analyze(SentimentRequest("This is great, I love it"))
    bad = await sentiment.analyze(SentimentRequest("Terrible and broken, the worst"))
    flat = await sentiment.analyze(SentimentRequest("The meeting is at noon."))

    assert good.label == "positive" and bad.label == "negative" and flat.label == "neutral"
    for r in (good, bad, flat):
        assert set(r.scores) == {"positive", "neutral", "negative"}
        assert 0 <= r.confidence <= 1
        assert math.isclose(sum(r.scores.values()), 1.0, abs_tol=0.01)


async def test_summarization_modes(provider: AIProvider) -> None:
    text = "Invoice 2026-001 is due. Total is 1,250. Please pay by Friday. Thank you for your business."
    service = provider.require_summarization()

    quick = await service.summarize(SummarizationRequest(text=text, mode="quick", max_words=8))
    assert quick.summary.startswith("Invoice 2026-001 is due.")
    assert len(quick.summary.split()) <= 12
    assert quick.items == () and quick.mode == "quick"
    assert quick.document_type == "invoice"

    bullets = await service.summarize(SummarizationRequest(text=text, mode="bullet_points"))
    assert bullets.items[0] == "Invoice 2026-001 is due."
    assert len(bullets.items) == 4

    actions = await service.summarize(SummarizationRequest(text=text, mode="action_items"))
    assert actions.items == ("Invoice 2026-001 is due.", "Please pay by Friday.")
    assert actions.mode == "action_items"


async def test_embeddings_are_normalised_and_similar_for_similar_text(provider: AIProvider) -> None:
    embeddings = provider.require_embeddings()
    response = await embeddings.embed(
        EmbeddingRequest(texts=("invoice payment due", "payment due invoice", "cat photo"))
    )
    assert response.dimensions == embeddings.dimensions == 384
    a, b, c = response.vectors
    dot = lambda x, y: sum(i * j for i, j in zip(x, y))  # noqa: E731
    assert math.isclose(dot(a, a), 1.0, abs_tol=1e-6)
    assert dot(a, b) > 0.99  # same words, different order
    assert dot(a, c) < 0.5


async def test_vision_and_ocr_contracts(provider: AIProvider) -> None:
    vision = await provider.require_vision().describe(
        VisionRequest(image=ImageInput(b"\xff\xd8\xff" + b"\x00" * 10), prompt="What is this?")
    )
    assert "JPEG" in vision.description and "What is this?" in vision.description

    ocr = await provider.require_ocr().recognize(
        OCRRequest(image=ImageInput(b"hello from ocr", mime_type="text/plain"))
    )
    assert ocr.text == "hello from ocr"

    with pytest.raises(AIInvalidInputError):
        await provider.require_vision().describe(VisionRequest(image=ImageInput(b"")))


async def test_health_reports_capabilities(provider: AIProvider) -> None:
    health = await provider.health()
    assert health.ok and health.capabilities == frozenset(AICapability)


# --- registry ---------------------------------------------------------------------------


def _settings(**overrides: object) -> Settings:
    return Settings(app_env="test", database_url="postgresql+asyncpg://u:p@h/db", **overrides)  # type: ignore[arg-type]


def test_registry_selects_provider_from_settings() -> None:
    assert set(available_providers()) >= {"mock", "huggingface"}
    assert create_provider(_settings(ai_provider="mock")).name == "mock"

    hf = create_provider(_settings(ai_provider="huggingface", huggingface_api_key="hf_x"))
    assert hf.name == "huggingface"
    assert AICapability.OCR not in hf.capabilities

    with pytest.raises(AIUnavailableError, match="HUGGINGFACE_API_KEY"):
        create_provider(_settings(ai_provider="huggingface", huggingface_api_key=None))
    with pytest.raises(AIUnavailableError, match="Unknown AI_PROVIDER"):
        create_provider(_settings(ai_provider="nope"))


def test_registry_accepts_plugins_and_overrides() -> None:
    class Stub(AIProvider):
        name = "stub"

        @property
        def capabilities(self) -> frozenset[AICapability]:
            return frozenset()

    register_provider("stub", lambda _s: Stub())
    assert create_provider(_settings(ai_provider="stub")).name == "stub"

    stub = Stub()
    set_ai_provider(stub)
    try:
        assert get_ai_provider() is stub
        with pytest.raises(AIUnavailableError, match="does not support chat"):
            stub.require_chat()
    finally:
        set_ai_provider(None)


# --- hugging face provider (fake transport) ------------------------------------------------


def _hf(handler) -> HuggingFaceProvider:  # type: ignore[no-untyped-def]
    return HuggingFaceProvider("hf_test", transport=httpx.MockTransport(handler))


async def test_hf_chat_uses_openai_compatible_endpoint() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "model": "meta-llama/Llama-3.1-8B-Instruct",
                "choices": [{"message": {"role": "assistant", "content": " Hi! "}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 2},
            },
        )

    provider = _hf(handler)
    try:
        response = await provider.require_chat().complete(
            ChatRequest(messages=(ChatMessage("user", "Hello"),), system="Be nice", max_tokens=64)
        )
    finally:
        await provider.close()

    assert seen["url"] == "https://router.huggingface.co/v1/chat/completions"
    assert seen["auth"] == "Bearer hf_test"
    body = seen["body"]
    assert body["messages"][0] == {"role": "system", "content": "Be nice"}  # type: ignore[index]
    assert body["max_tokens"] == 64  # type: ignore[index]
    assert response.message.content == "Hi!"
    assert response.usage.total_tokens == 14
    assert response.model.provider == "huggingface"


async def test_hf_sentiment_maps_labels_from_pipeline_shape() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/models/cardiffnlp/twitter-roberta-base-sentiment-latest")
        assert json.loads(request.content)["options"]["wait_for_model"] is True
        return httpx.Response(
            200,
            json=[[{"label": "LABEL_2", "score": 0.91}, {"label": "LABEL_1", "score": 0.07}, {"label": "LABEL_0", "score": 0.02}]],
        )

    provider = _hf(handler)
    try:
        result = await provider.require_sentiment().analyze(SentimentRequest("lovely"))
    finally:
        await provider.close()
    assert result.label == "positive" and result.confidence == 0.91
    assert result.scores == {"positive": 0.91, "neutral": 0.07, "negative": 0.02}


async def test_hf_summarization_embeddings_and_vision_parse_pipeline_output() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/chat/completions"):
            body = json.loads(request.content)
            content = body["messages"][-1]["content"]
            if isinstance(content, list):  # vision: text + image data URL
                assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")
                return httpx.Response(200, json={"choices": [{"message": {"content": "a cat on a sofa"}}]})
            return httpx.Response(200, json={"choices": [{"message": {"content": "First point. Second point."}}]})
        if "MiniLM" in path:
            assert path.endswith("/pipeline/feature-extraction"), path
            return httpx.Response(200, json=[[0.1, 0.2, 0.3], [0.3, 0.2, 0.1]])
        return httpx.Response(404)

    provider = _hf(handler)
    try:
        summary = await provider.require_summarization().summarize(SummarizationRequest("long text here"))
        vectors = await provider.require_embeddings().embed(EmbeddingRequest(texts=("a", "b")))
        vision = await provider.require_vision().describe(
            VisionRequest(image=ImageInput(b"\x89PNG", mime_type="image/png"))
        )
    finally:
        await provider.close()

    assert summary.summary == "First point. Second point."
    assert summary.items == ()
    assert vectors.dimensions == 3 and len(vectors.vectors) == 2
    assert vision.description == "a cat on a sofa"


@pytest.mark.parametrize(
    ("status", "body", "expected"),
    [
        (401, {"error": "Invalid credentials"}, AIUnavailableError),
        (429, {"error": "Rate limit reached"}, AIRateLimitedError),
        (400, {"error": "inputs too long"}, AIInvalidInputError),
        (503, {"error": "Model is loading", "estimated_time": 20}, AIUnavailableError),
        (504, "", AITimeoutError),
        (500, "boom", AIError),
    ],
)
async def test_hf_errors_are_translated(status: int, body: object, expected: type[AIError]) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=body) if isinstance(body, dict) else httpx.Response(status, text=str(body))

    provider = _hf(handler)
    try:
        with pytest.raises(expected):
            await provider.require_sentiment().analyze(SentimentRequest("x"))
    finally:
        await provider.close()


async def test_hf_network_failures_are_translated() -> None:
    def timeout(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    provider = _hf(timeout)
    try:
        with pytest.raises(AITimeoutError):
            await provider.require_sentiment().analyze(SentimentRequest("x"))
    finally:
        await provider.close()


# --- architecture: nothing outside app/ai/providers may import a provider -------------------


def test_only_the_registry_imports_concrete_providers() -> None:
    offenders = []
    pattern = re.compile(r"app\.ai\.providers")
    for path in (BACKEND / "app").rglob("*.py"):
        rel = path.relative_to(BACKEND).as_posix()
        if rel.startswith("app/ai/providers/") or rel == "app/ai/registry.py":
            continue
        if pattern.search(path.read_text(encoding="utf-8")):
            offenders.append(rel)
    assert offenders == [], f"Concrete providers leaked into: {offenders}"


def test_controllers_depend_on_interfaces_only() -> None:
    api_dir = BACKEND / "app" / "api"
    for path in api_dir.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "huggingface" not in text.lower(), path
        assert "MockProvider" not in text, path
