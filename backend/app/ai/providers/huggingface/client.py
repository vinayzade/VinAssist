"""
Thin async HTTP client for the Hugging Face Inference API.

Two endpoints are used:
- `{base_url}/models/{model}` for task pipelines (classification, summarisation,
  feature extraction, image-to-text), and
- `{chat_url}` for OpenAI-compatible chat completions.

All Hugging Face specific error shapes are translated to `AIError`s here,
so the services above stay free of vendor details.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.ai.base import (
    AIError,
    AIInvalidInputError,
    AIRateLimitedError,
    AITimeoutError,
    AIUnavailableError,
)

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://router.huggingface.co/hf-inference"
DEFAULT_CHAT_URL = "https://router.huggingface.co/v1/chat/completions"


class HuggingFaceClient:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        chat_url: str = DEFAULT_CHAT_URL,
        timeout: float = 60.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.chat_url = chat_url
        self._http = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            timeout=timeout,
            transport=transport,
        )

    async def close(self) -> None:
        await self._http.aclose()

    async def pipeline(
        self, model: str, payload: dict[str, Any], *, task: str | None = None
    ) -> Any:
        """
        Calls a task pipeline and returns the decoded JSON body. `task` pins
        the pipeline (e.g. "feature-extraction") for models the router would
        otherwise serve through a different default task.
        """
        url = f"{self.base_url}/models/{model}"
        if task:
            url += f"/pipeline/{task}"
        return await self._post_json(
            url,
            json={**payload, "options": {"wait_for_model": True, **payload.get("options", {})}},
        )

    async def pipeline_binary(self, model: str, data: bytes, content_type: str) -> Any:
        """Calls a pipeline that takes raw bytes (image-to-text, ASR)."""
        return await self._request(
            "POST",
            f"{self.base_url}/models/{model}",
            content=data,
            headers={"Content-Type": content_type, "X-Wait-For-Model": "true"},
        )

    async def chat_completions(self, payload: dict[str, Any]) -> Any:
        return await self._post_json(self.chat_url, json=payload)

    async def _post_json(self, url: str, *, json: dict[str, Any]) -> Any:
        return await self._request("POST", url, json=json)

    async def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        try:
            response = await self._http.request(method, url, **kwargs)
        except httpx.TimeoutException as exc:
            raise AITimeoutError() from exc
        except httpx.HTTPError as exc:
            raise AIUnavailableError("Could not reach the AI provider.") from exc
        return self._decode(response)

    @staticmethod
    def _decode(response: httpx.Response) -> Any:
        status = response.status_code
        if status == 200:
            return response.json()
        detail = _error_message(response)
        if status in (401, 403):
            logger.error("Hugging Face rejected credentials: %s", detail)
            raise AIUnavailableError("The AI provider is not configured correctly.", code="AI_MISCONFIGURED")
        if status == 429:
            raise AIRateLimitedError()
        if status in (400, 413, 422):
            raise AIInvalidInputError(detail or AIInvalidInputError.message)
        if status == 503:
            # Model still loading despite wait_for_model, or capacity issue.
            raise AIUnavailableError(detail or AIUnavailableError.message)
        if status == 504:
            raise AITimeoutError()
        logger.error("Hugging Face error %s: %s", status, detail)
        raise AIError()


def _error_message(response: httpx.Response) -> str | None:
    try:
        body = response.json()
    except ValueError:
        return response.text[:200] or None
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, str):
            return err
        if isinstance(err, dict):
            return str(err.get("message") or err)
    return None
