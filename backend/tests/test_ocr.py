"""Persisting on-device OCR results."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _auth(client: AsyncClient) -> dict[str, str]:
    payload = {
        "name": "OCR Tester",
        "email": f"{uuid.uuid4().hex[:10]}@example.com",
        "password": "Str0ngPassw0rd",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


SAMPLE = {
    "text": "INVOICE 2026-001\nTotal due: 1,250.00\n\nThank you",
    "confidence": 0.93,
    "language": "en",
    "engine": "mlkit-latin",
    "processingMs": 412,
    "imageWidth": 3000,
    "imageHeight": 4000,
    "sourceUri": "file:///data/user/0/com.vinassist/cache/scan.jpg",
}


async def test_save_list_get_delete_round_trip(client: AsyncClient) -> None:
    headers = await _auth(client)

    saved = await client.post("/api/v1/ocr/results", json=SAMPLE, headers=headers)
    assert saved.status_code == 201, saved.text
    body = saved.json()
    assert body["text"] == SAMPLE["text"]
    assert body["preview"] == "INVOICE 2026-001"
    assert body["wordCount"] == 7  # "2026-001" and "1,250.00" are one word each
    assert body["confidence"] == pytest.approx(0.93)
    assert body["language"] == "en"
    assert body["engine"] == "mlkit-latin"
    assert set(body) == {
        "id", "preview", "wordCount", "confidence", "language", "engine", "createdAt", "text",
    }

    listed = await client.get("/api/v1/ocr/results", headers=headers)
    assert listed.status_code == 200
    page = listed.json()
    assert page["total"] == 1 and page["hasMore"] is False
    assert page["items"][0]["id"] == body["id"]
    assert "text" not in page["items"][0]  # summaries are light

    one = await client.get(f"/api/v1/ocr/results/{body['id']}", headers=headers)
    assert one.status_code == 200 and one.json()["text"] == SAMPLE["text"]

    deleted = await client.delete(f"/api/v1/ocr/results/{body['id']}", headers=headers)
    assert deleted.status_code == 204
    gone = await client.get(f"/api/v1/ocr/results/{body['id']}", headers=headers)
    assert gone.status_code == 404


async def test_results_are_private_to_their_owner(client: AsyncClient) -> None:
    owner = await _auth(client)
    other = await _auth(client)
    saved = (await client.post("/api/v1/ocr/results", json=SAMPLE, headers=owner)).json()

    assert (await client.get(f"/api/v1/ocr/results/{saved['id']}", headers=other)).status_code == 404
    assert (await client.delete(f"/api/v1/ocr/results/{saved['id']}", headers=other)).status_code == 404
    assert (await client.get("/api/v1/ocr/results", headers=other)).json()["total"] == 0


async def test_save_requires_auth_and_validates(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/ocr/results", json=SAMPLE)).status_code == 401

    headers = await _auth(client)
    bad = await client.post(
        "/api/v1/ocr/results", json={**SAMPLE, "confidence": 1.5}, headers=headers
    )
    assert bad.status_code == 422
    assert bad.json()["detail"][0]["loc"][-1] == "confidence"
