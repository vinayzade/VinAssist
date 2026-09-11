"""POST /api/v1/ai/summarize and the Hugging Face summariser's mode handling."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from httpx import AsyncClient

from app.ai import (
    AICapability,
    AIProvider,
    AIUnavailableError,
    SummarizationRequest,
    SummarizationResponse,
    SummarizationService,
    set_ai_provider,
)
from app.ai.providers.huggingface import HuggingFaceProvider

TEXT = (
    "INVOICE 2026-001. Bill to: Vinay Zade. Total due 1,250.00. "
    "Please pay by Friday via bank transfer. Contact billing with questions."
)


async def _auth(client: AsyncClient) -> dict[str, str]:
    payload = {
        "name": "Sum Tester",
        "email": f"{uuid.uuid4().hex[:10]}@example.com",
        "password": "Str0ngPassw0rd",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


@pytest.fixture
def use_provider() -> Iterator[Any]:
    yield set_ai_provider
    set_ai_provider(None)


# --- endpoint (mock provider) ---------------------------------------------------------------


@pytest.mark.parametrize("mode", ["quick", "detailed", "bullet_points", "action_items"])
async def test_summarize_returns_summary_timing_and_model(client: AsyncClient, mode: str) -> None:
    headers = await _auth(client)

    response = await client.post(
        "/api/v1/ai/summarize", json={"text": TEXT, "mode": mode}, headers=headers
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == mode
    assert body["summary"]
    assert isinstance(body["processingMs"], int)
    assert body["modelName"] == "mock-summarization" and body["provider"] == "mock"
    assert body["createdAt"]
    assert set(body) == {
        "summary", "items", "mode", "documentType", "processingMs", "modelName", "provider", "createdAt",
    }
    if mode in ("bullet_points", "action_items"):
        assert body["items"], body
    else:
        assert body["items"] == []


async def test_summarize_defaults_to_quick_and_validates(client: AsyncClient) -> None:
    headers = await _auth(client)

    default = await client.post("/api/v1/ai/summarize", json={"text": TEXT}, headers=headers)
    assert default.status_code == 200 and default.json()["mode"] == "quick"

    bad_mode = await client.post(
        "/api/v1/ai/summarize", json={"text": TEXT, "mode": "haiku"}, headers=headers
    )
    assert bad_mode.status_code == 422
    assert bad_mode.json()["detail"][0]["loc"][-1] == "mode"

    too_short = await client.post("/api/v1/ai/summarize", json={"text": "hi"}, headers=headers)
    assert too_short.status_code == 422

    assert (await client.post("/api/v1/ai/summarize", json={"text": TEXT})).status_code == 401


async def test_summarize_provider_failure_is_mapped(client: AsyncClient, use_provider: Any) -> None:
    class Down(SummarizationService):
        async def summarize(self, request: SummarizationRequest) -> SummarizationResponse:
            raise AIUnavailableError("Model is loading")

    class P(AIProvider):
        name = "stub"

        @property
        def capabilities(self) -> frozenset[AICapability]:
            return frozenset({AICapability.SUMMARIZATION})

        @property
        def summarization(self) -> SummarizationService:
            return Down()

    use_provider(P())
    headers = await _auth(client)
    response = await client.post("/api/v1/ai/summarize", json={"text": TEXT}, headers=headers)
    assert response.status_code == 503
    assert response.json() == {"detail": "Model is loading", "code": "AI_UNAVAILABLE"}


# --- hugging face summariser (fake transport) ----------------------------------------------------


def _chat_reply(content: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "model": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
            "choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 20},
        },
    )


async def test_hf_uses_chat_model_with_mode_instruction_and_parses_bullets() -> None:
    seen: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/chat/completions")
        seen.append(json.loads(request.content))
        return _chat_reply("- Pay 1,250 by Friday\n- Contact billing with questions\n")

    provider = HuggingFaceProvider("hf_x", transport=httpx.MockTransport(handler))
    try:
        result = await provider.require_summarization().summarize(
            SummarizationRequest(text=TEXT, mode="action_items")
        )
    finally:
        await provider.close()

    prompt = seen[0]["messages"][1]["content"]
    assert "action item" in prompt.lower() and TEXT in prompt
    assert seen[0]["model"] == "meta-llama/Llama-3.1-8B-Instruct"
    assert result.mode == "action_items"
    assert result.items == ("Pay 1,250 by Friday", "Contact billing with questions")
    assert result.summary == "2 action items."
    assert result.model.model == "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"
    assert result.usage.total_tokens == 120


async def test_hf_action_items_none_sentinel_yields_empty_list() -> None:
    provider = HuggingFaceProvider(
        "hf_x", transport=httpx.MockTransport(lambda r: _chat_reply("- No action items found."))
    )
    try:
        result = await provider.require_summarization().summarize(
            SummarizationRequest(text=TEXT, mode="action_items")
        )
    finally:
        await provider.close()
    assert result.items == () and result.summary == "0 action items."


async def test_hf_falls_back_to_pipeline_when_chat_is_unavailable() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("/chat/completions"):
            return httpx.Response(503, json={"error": "no provider"})
        return httpx.Response(200, json=[{"summary_text": "Pay 1,250 by Friday."}])

    provider = HuggingFaceProvider("hf_x", transport=httpx.MockTransport(handler))
    try:
        result = await provider.require_summarization().summarize(
            SummarizationRequest(text=TEXT, mode="quick")
        )
    finally:
        await provider.close()

    assert [p.split("/")[-1] for p in calls] == ["completions", "bart-large-cnn"]
    assert result.summary == "Pay 1,250 by Friday."
    assert result.model.model == "facebook/bart-large-cnn"
