"""
Request validation: every endpoint rejects bad input with 422 and a body the
app can render, and never touches a provider or the database on the way.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from tests.test_rag import PDF, _auth


def _fields(response: Any) -> set[str]:
    """Names of the fields FastAPI's validation error points at."""
    body = response.json()
    detail = body.get("detail")
    if isinstance(detail, list):
        return {".".join(str(p) for p in item.get("loc", [])[1:]) for item in detail}
    return set()


@pytest.mark.asyncio
async def test_register_and_login_validation(client: AsyncClient) -> None:
    cases = [
        ({"name": "Vinay", "email": "not-an-email", "password": "Str0ngPassw0rd"}, "email"),
        ({"name": "Vinay", "email": "v@example.com", "password": "short"}, "password"),
        ({"name": "V", "email": "v@example.com", "password": "Str0ngPassw0rd"}, "name"),
        ({"name": "x" * 200, "email": "v@example.com", "password": "Str0ngPassw0rd"}, "name"),
        ({"email": "v@example.com", "password": "Str0ngPassw0rd"}, "name"),
    ]
    for body, field in cases:
        response = await client.post("/api/v1/auth/register", json=body)
        assert response.status_code == 422, (body, response.text)
        assert any(f.startswith(field) for f in _fields(response)), (field, response.json())

    response = await client.post("/api/v1/auth/login", json={"email": "v@example.com"})
    assert response.status_code == 422 and "password" in _fields(response)
    response = await client.post("/api/v1/auth/login", json={"email": "nope", "password": "x"})
    assert response.status_code == 422 and "email" in _fields(response)
    response = await client.post("/api/v1/auth/refresh", json={"refreshToken": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ai_text_endpoints_validate_before_calling_a_provider(client: AsyncClient) -> None:
    headers = await _auth(client)

    # Sentiment: blank and oversized text.
    for body in ({"text": "   "}, {"text": ""}, {}, {"text": "x" * 5_001}):
        response = await client.post("/api/v1/ai/sentiment", json=body, headers=headers)
        assert response.status_code == 422, body

    # Summarise: unknown mode, too few words, oversized text, wrong types.
    for body in (
        {"text": "one two three four", "mode": "haiku"},
        {"text": "one two"},
        {"text": "x " * 20_001},
        {"text": 123},
    ):
        response = await client.post("/api/v1/ai/summarize", json=body, headers=headers)
        assert response.status_code == 422, body

    # Extraction: unknown document type, one-word text.
    for body in ({"text": "invoice total", "documentType": "PASSPORT"}, {"text": "word"}):
        response = await client.post("/api/v1/ai/extract", json=body, headers=headers)
        assert response.status_code == 422, body

    # Document chat: bad ids, blank question, too much history.
    for body in (
        {"documentId": "not-a-uuid", "question": "What?"},
        {"documentId": str(uuid.uuid4()), "question": "   "},
        {"documentId": str(uuid.uuid4()), "question": "q", "history": [{"role": "user", "content": "x"}] * 11},
        {"documentId": str(uuid.uuid4()), "question": "q", "history": [{"role": "system", "content": "x"}]},
    ):
        response = await client.post("/api/v1/ai/document-chat", json=body, headers=headers)
        assert response.status_code == 422, body

    # Nothing was recorded in history by any of the rejected calls.
    history = await client.get("/api/v1/history", headers=headers)
    assert history.json()["total"] == 0


@pytest.mark.asyncio
async def test_assistant_attachment_shapes_are_validated(client: AsyncClient) -> None:
    headers = await _auth(client)
    cases = [
        {"message": ""},  # nothing to say
        {"message": "hi", "attachments": [{"type": "document"}]},  # needs documentId
        {"message": "hi", "attachments": [{"type": "image"}]},
        {"message": "hi", "attachments": [{"type": "ocr", "text": "   "}]},  # needs text
        {"message": "hi", "attachments": [{"type": "analysis", "kind": "sentiment"}]},  # needs data
        {"message": "hi", "attachments": [{"type": "analysis", "kind": "astrology", "data": {}}]},
        {"message": "hi", "attachments": [{"type": "video", "documentId": str(uuid.uuid4())}]},
        {"message": "hi", "attachments": [{"type": "ocr", "text": "x"}] * 6},  # too many
        {"message": "x" * 4_001},
        {"message": "hi", "inputMode": "telepathy"},
        {"message": "hi", "conversationId": "nope"},
    ]
    for body in cases:
        response = await client.post("/api/v1/ai/chat", json=body, headers=headers)
        assert response.status_code == 422, (body, response.text)


@pytest.mark.asyncio
async def test_result_saves_validate_ranges_and_enums(client: AsyncClient) -> None:
    headers = await _auth(client)
    for body in (
        {"text": "hello", "engine": ""},
        {"text": "hello", "engine": "mlkit", "confidence": 1.5},
        {"engine": "mlkit"},
        {"text": "x" * 200_001, "engine": "mlkit"},
    ):
        response = await client.post("/api/v1/ocr/results", json=body, headers=headers)
        assert response.status_code == 422, body

    good = {
        "overallScore": 80, "status": "GOOD", "blurScore": 80, "brightnessScore": 80, "resolutionScore": 90,
        "faceCount": 0,
        "checks": {"faceDetected": False, "blur": False, "lowLight": False, "overexposed": False,
                   "multipleFaces": False, "faceOutsideFrame": False, "resolution": "GOOD"},
        "warnings": [], "recommendation": "Fine.", "engine": "mlkit",
    }
    for patch in (
        {"overallScore": 101},
        {"status": "AMAZING"},
        {"faceCount": -1},
        {"checks": {**good["checks"], "resolution": "HUGE"}},
        {"warnings": ["w"] * 21},
        {"recommendation": "x" * 501},
    ):
        response = await client.post("/api/v1/image-quality/results", json={**good, **patch}, headers=headers)
        assert response.status_code == 422, patch


@pytest.mark.asyncio
async def test_history_and_document_query_parameters_are_bounded(client: AsyncClient) -> None:
    headers = await _auth(client)
    for params in ({"page": 0}, {"pageSize": 0}, {"pageSize": 51}, {"q": "x" * 101}, {"kind": "bogus"}):
        response = await client.get("/api/v1/history", params=params, headers=headers)
        assert response.status_code == 422, params
    for params in ({"page": 0}, {"pageSize": 101}):
        response = await client.get("/api/v1/documents", params=params, headers=headers)
        assert response.status_code == 422, params

    response = await client.patch(f"/api/v1/history/{uuid.uuid4()}", json={"title": ""}, headers=headers)
    assert response.status_code == 422
    response = await client.patch("/api/v1/history/not-a-uuid", json={"favourite": True}, headers=headers)
    assert response.status_code == 422
    response = await client.get("/api/v1/documents/not-a-uuid", headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_upload_validation_errors_use_the_app_error_shape(client: AsyncClient) -> None:
    headers = await _auth(client)
    response = await client.post("/api/v1/documents/upload", headers=headers, files={"file": ("x.exe", b"MZ" + b"\x00" * 32, "application/octet-stream")})
    assert response.status_code in (400, 415, 422)
    body = response.json()
    assert isinstance(body["detail"], str) and body["code"]

    response = await client.post("/api/v1/documents/upload", headers=headers)  # no file part
    assert response.status_code == 422

    response = await client.post(f"/api/v1/documents/{uuid.uuid4()}/index", headers=headers, json={"text": "x" * 200_001})
    assert response.status_code == 422

    ok = await client.post("/api/v1/documents/upload", headers=headers, files={"file": ("c.pdf", PDF, "application/pdf")})
    assert ok.status_code == 201


@pytest.mark.asyncio
async def test_malformed_json_is_a_422_not_a_500(client: AsyncClient) -> None:
    headers = {**(await _auth(client)), "Content-Type": "application/json"}
    response = await client.post("/api/v1/ai/sentiment", content=b"{not json", headers=headers)
    assert response.status_code == 422
    assert "detail" in response.json()
