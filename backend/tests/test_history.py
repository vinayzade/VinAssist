"""AI activity history: recording, paging, search, filters, rename, favourite, delete."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from tests.test_rag import CONTRACT, _auth, _index, _upload

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def _ocr(client: AsyncClient, headers: dict[str, str], text: str) -> dict[str, Any]:
    r = await client.post("/api/v1/ocr/results", json={"text": text, "engine": "mlkit-latin"}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _quality(client: AsyncClient, headers: dict[str, str], score: int) -> dict[str, Any]:
    r = await client.post(
        "/api/v1/image-quality/results",
        json={
            "overallScore": score, "status": "GOOD" if score >= 70 else "POOR", "blurScore": score,
            "brightnessScore": 80, "resolutionScore": 90, "faceCount": 0,
            "checks": {
                "faceDetected": False, "blur": score < 70, "lowLight": False, "overexposed": False,
                "multipleFaces": False, "faceOutsideFrame": False, "resolution": "GOOD",
            },
            "warnings": [],
            "recommendation": "Looks sharp.", "engine": "mlkit",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _history(client: AsyncClient, headers: dict[str, str], **params: Any) -> dict[str, Any]:
    r = await client.get("/api/v1/history", params=params, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_every_ai_operation_is_recorded(client: AsyncClient) -> None:
    headers = await _auth(client)
    ocr = await _ocr(client, headers, "INVOICE 2026-001\nTotal due: 1,250.00")
    await _quality(client, headers, 82)
    r = await client.post("/api/v1/ai/sentiment", json={"text": "I love this app"}, headers=headers)
    assert r.status_code == 200, r.text
    r = await client.post(
        "/api/v1/ai/summarize", json={"text": "The meeting is on Monday. Please bring the report."}, headers=headers
    )
    assert r.status_code == 200, r.text
    r = await client.post("/api/v1/ai/extract", json={"text": "INVOICE 2026-001 Total due 1,250.00"}, headers=headers)
    assert r.status_code == 200, r.text
    doc_id = await _upload(client, headers)
    await _index(client, headers, doc_id)
    r = await client.post(
        "/api/v1/ai/document-chat",
        json={"documentId": doc_id, "question": "How many days of written notice are needed to terminate?"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    r = await client.post(
        "/api/v1/documents/upload", headers=headers, files={"file": ("photo.png", PNG, "image/png")}
    )
    image_id = r.json()["id"]
    r = await client.post(
        "/api/v1/ai/chat",
        json={"message": "What does the picture show?", "attachments": [{"type": "image", "documentId": image_id}]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    conversation_id = r.json()["conversationId"]

    page = await _history(client, headers, pageSize=50)
    kinds = sorted(item["kind"] for item in page["items"])
    assert kinds == sorted(
        ["ocr", "image_quality", "sentiment", "document_analysis", "document_analysis",
         "document_analysis", "conversation", "image_analysis"]
    )
    assert page["total"] == 8 and page["hasMore"] is False

    by_kind = {item["kind"]: item for item in page["items"]}
    assert by_kind["ocr"]["title"] == "INVOICE 2026-001"
    assert by_kind["ocr"]["refId"] == ocr["id"]
    assert by_kind["image_quality"]["title"] == "Good · 82/100"
    assert by_kind["sentiment"]["title"].startswith("Positive")
    assert by_kind["conversation"]["refId"] == conversation_id
    assert "Assistant:" in by_kind["conversation"]["preview"]
    assert by_kind["image_analysis"]["preview"].startswith("[mock] A PNG image")

    # A follow-up turn refreshes the conversation entry instead of adding one.
    r = await client.post(
        "/api/v1/ai/chat", json={"conversationId": conversation_id, "message": "Anything else?"}, headers=headers
    )
    assert r.status_code == 200
    page = await _history(client, headers, kind="conversation")
    assert page["total"] == 1
    assert "Anything else?" in page["items"][0]["preview"]
    assert page["items"][0]["id"] == by_kind["conversation"]["id"]

    # Detail carries the stored payload.
    r = await client.get(f"/api/v1/history/{by_kind['sentiment']['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["payload"]["sentiment"] == "POSITIVE"


@pytest.mark.asyncio
async def test_pagination_search_and_filters(client: AsyncClient) -> None:
    headers = await _auth(client)
    for i in range(7):
        await _ocr(client, headers, f"Receipt number {i}\nCoffee {i}.50")
    await _quality(client, headers, 40)
    r = await client.post("/api/v1/ai/sentiment", json={"text": "terrible experience"}, headers=headers)
    assert r.status_code == 200

    first = await _history(client, headers, pageSize=4)
    assert first["page"] == 1 and first["pageSize"] == 4 and first["total"] == 9 and first["hasMore"] is True
    assert [i["kind"] for i in first["items"]] == ["sentiment", "image_quality", "ocr", "ocr"]  # newest first
    second = await _history(client, headers, page=2, pageSize=4)
    third = await _history(client, headers, page=3, pageSize=4)
    ids = [i["id"] for i in first["items"] + second["items"] + third["items"]]
    assert len(ids) == 9 and len(set(ids)) == 9
    assert third["hasMore"] is False

    # Page size is capped so the whole history can never be pulled at once.
    r = await client.get("/api/v1/history", params={"pageSize": 500}, headers=headers)
    assert r.status_code == 422

    searched = await _history(client, headers, q="number 3")
    assert searched["total"] == 1 and searched["items"][0]["title"] == "Receipt number 3"
    searched = await _history(client, headers, q="coffee")  # matches previews, case-insensitive
    assert searched["total"] == 7

    filtered = await _history(client, headers, kind=["ocr", "sentiment"])
    assert filtered["total"] == 8
    filtered = await _history(client, headers, kind="ocr,sentiment")  # comma form
    assert filtered["total"] == 8
    r = await client.get("/api/v1/history", params={"kind": "bogus"}, headers=headers)
    assert r.status_code == 422
    filtered = await _history(client, headers, kind="image_quality")
    assert filtered["total"] == 1 and filtered["items"][0]["title"] == "Poor · 40/100"


@pytest.mark.asyncio
async def test_rename_favourite_and_delete(client: AsyncClient) -> None:
    headers = await _auth(client)
    ocr = await _ocr(client, headers, "Business card\nJane Doe")
    item = (await _history(client, headers))["items"][0]

    r = await client.patch(f"/api/v1/history/{item['id']}", json={"title": "Jane's card"}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Jane's card" and r.json()["favourite"] is False
    r = await client.patch(f"/api/v1/history/{item['id']}", json={"favourite": True}, headers=headers)
    assert r.json()["favourite"] is True
    assert (await _history(client, headers, favourite=True))["total"] == 1
    r = await client.patch(f"/api/v1/history/{item['id']}", json={"title": "   "}, headers=headers)
    assert r.status_code == 422
    r = await client.patch(f"/api/v1/history/{item['id']}", json={}, headers=headers)
    assert r.status_code == 422

    # Deleting the entry also removes the OCR result it points at.
    r = await client.delete(f"/api/v1/history/{item['id']}", headers=headers)
    assert r.status_code == 204
    assert (await _history(client, headers))["total"] == 0
    r = await client.get(f"/api/v1/ocr/results/{ocr['id']}", headers=headers)
    assert r.status_code == 404
    r = await client.delete(f"/api/v1/history/{item['id']}", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_deleting_a_conversation_removes_its_history_and_clear_empties_all(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.post("/api/v1/ai/chat", json={"message": "hello"}, headers=headers)
    conversation_id = r.json()["conversationId"]
    await _ocr(client, headers, "note")
    assert (await _history(client, headers))["total"] == 2

    r = await client.delete(f"/api/v1/ai/conversations/{conversation_id}", headers=headers)
    assert r.status_code == 204
    assert (await _history(client, headers))["total"] == 1

    r = await client.delete("/api/v1/history", headers=headers)
    assert r.status_code == 204
    assert (await _history(client, headers))["total"] == 0


@pytest.mark.asyncio
async def test_history_is_private_per_user(client: AsyncClient) -> None:
    owner = await _auth(client)
    await _ocr(client, owner, "secret note")
    item = (await _history(client, owner))["items"][0]

    other = await _auth(client)
    assert (await _history(client, other))["total"] == 0
    assert (await client.get(f"/api/v1/history/{item['id']}", headers=other)).status_code == 404
    assert (await client.patch(f"/api/v1/history/{item['id']}", json={"favourite": True}, headers=other)).status_code == 404
    assert (await client.delete(f"/api/v1/history/{item['id']}", headers=other)).status_code == 404
    assert (await client.get("/api/v1/history")).status_code == 401


def test_contract_fixture_present() -> None:
    assert "SERVICE AGREEMENT" in CONTRACT and isinstance(uuid.uuid4(), uuid.UUID)
