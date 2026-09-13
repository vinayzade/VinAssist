"""
Authorization: every protected resource is invisible to other users and to
requests without a valid access token. One matrix, run against each
resource kind, so a new endpoint cannot quietly skip the ownership check.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.core.security import create_access_token, create_password_reset_token
from tests.test_rag import PDF, _auth

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
QUALITY = {
    "overallScore": 80, "status": "GOOD", "blurScore": 80, "brightnessScore": 80, "resolutionScore": 90,
    "faceCount": 0,
    "checks": {"faceDetected": False, "blur": False, "lowLight": False, "overexposed": False,
               "multipleFaces": False, "faceOutsideFrame": False, "resolution": "GOOD"},
    "warnings": [], "recommendation": "Fine.", "engine": "mlkit",
}


async def _owned_resources(client: AsyncClient, headers: dict[str, str]) -> dict[str, str]:
    """Creates one of everything for a user and returns the ids."""
    ids: dict[str, str] = {}
    r = await client.post("/api/v1/documents/upload", headers=headers, files={"file": ("c.pdf", PDF, "application/pdf")})
    assert r.status_code == 201, r.text
    ids["document"] = r.json()["id"]
    r = await client.post("/api/v1/ocr/results", headers=headers, json={"text": "Receipt 1", "engine": "mlkit"})
    assert r.status_code == 201, r.text
    ids["ocr"] = r.json()["id"]
    r = await client.post("/api/v1/image-quality/results", headers=headers, json=QUALITY)
    assert r.status_code == 201, r.text
    ids["quality"] = r.json()["id"]
    r = await client.post("/api/v1/ai/chat", headers=headers, json={"message": "hello"})
    assert r.status_code == 200, r.text
    ids["conversation"] = r.json()["conversationId"]
    r = await client.get("/api/v1/history", headers=headers)
    ids["activity"] = r.json()["items"][0]["id"]
    return ids


def _requests(ids: dict[str, str]) -> list[tuple[str, str, dict[str, Any] | None]]:
    return [
        ("GET", f"/api/v1/documents/{ids['document']}", None),
        ("GET", f"/api/v1/documents/{ids['document']}/content", None),
        ("DELETE", f"/api/v1/documents/{ids['document']}", None),
        ("POST", f"/api/v1/documents/{ids['document']}/index", {"text": "some text to index"}),
        ("POST", "/api/v1/ai/document-chat", {"documentId": ids["document"], "question": "What?"}),
        ("POST", "/api/v1/ai/chat", {"message": "x", "attachments": [{"type": "document", "documentId": ids["document"]}]}),
        ("GET", f"/api/v1/ocr/results/{ids['ocr']}", None),
        ("DELETE", f"/api/v1/ocr/results/{ids['ocr']}", None),
        ("DELETE", f"/api/v1/image-quality/results/{ids['quality']}", None),
        ("GET", f"/api/v1/ai/conversations/{ids['conversation']}", None),
        ("DELETE", f"/api/v1/ai/conversations/{ids['conversation']}", None),
        ("POST", "/api/v1/ai/chat", {"conversationId": ids["conversation"], "message": "again"}),
        ("GET", f"/api/v1/history/{ids['activity']}", None),
        ("PATCH", f"/api/v1/history/{ids['activity']}", {"favourite": True}),
        ("DELETE", f"/api/v1/history/{ids['activity']}", None),
    ]


@pytest.mark.asyncio
async def test_another_user_cannot_read_change_or_delete_my_resources(client: AsyncClient) -> None:
    owner = await _auth(client)
    intruder = await _auth(client)
    ids = await _owned_resources(client, owner)

    for method, path, body in _requests(ids):
        response = await client.request(method, path, headers=intruder, json=body)
        assert response.status_code == 404, f"{method} {path} -> {response.status_code}: {response.text}"
        assert response.json()["code"].endswith("NOT_FOUND"), (method, path, response.json())

    # Nothing changed for the owner.
    assert (await client.get(f"/api/v1/documents/{ids['document']}", headers=owner)).status_code == 200
    assert (await client.get(f"/api/v1/ocr/results/{ids['ocr']}", headers=owner)).status_code == 200
    assert (await client.get(f"/api/v1/ai/conversations/{ids['conversation']}", headers=owner)).status_code == 200
    activity = await client.get(f"/api/v1/history/{ids['activity']}", headers=owner)
    assert activity.status_code == 200 and activity.json()["favourite"] is False


@pytest.mark.asyncio
async def test_lists_only_contain_the_callers_own_rows(client: AsyncClient) -> None:
    owner = await _auth(client)
    other = await _auth(client)
    await _owned_resources(client, owner)

    for path in ("/api/v1/documents", "/api/v1/ocr/results", "/api/v1/image-quality/results", "/api/v1/history", "/api/v1/ai/conversations"):
        mine = await client.get(path, headers=owner)
        theirs = await client.get(path, headers=other)
        assert mine.status_code == theirs.status_code == 200, path
        mine_items = mine.json()["items"] if isinstance(mine.json(), dict) else mine.json()
        their_items = theirs.json()["items"] if isinstance(theirs.json(), dict) else theirs.json()
        assert len(mine_items) >= 1, path
        assert their_items == [], path


@pytest.mark.asyncio
async def test_missing_malformed_expired_and_wrong_purpose_tokens_are_rejected(client: AsyncClient) -> None:
    registered = await client.post(
        "/api/v1/auth/register",
        json={"name": "Token Tester", "email": f"{uuid.uuid4().hex[:8]}@example.com", "password": "Str0ngPassw0rd"},
    )
    user_id = uuid.UUID(registered.json()["user"]["id"])
    settings = get_settings()
    expired = create_access_token(user_id, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm, ttl=timedelta(seconds=-1))
    wrong_secret = create_access_token(user_id, secret="not-the-secret", algorithm=settings.jwt_algorithm, ttl=timedelta(minutes=5))
    reset_token = create_password_reset_token(user_id, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm, ttl=timedelta(minutes=5), password_hash="x")
    unknown_user = create_access_token(uuid.uuid4(), secret=settings.jwt_secret, algorithm=settings.jwt_algorithm, ttl=timedelta(minutes=5))

    cases = {
        "missing": {},
        "not bearer": {"Authorization": "Basic abc"},
        "malformed": {"Authorization": "Bearer not.a.jwt"},
        "expired": {"Authorization": f"Bearer {expired}"},
        "wrong secret": {"Authorization": f"Bearer {wrong_secret}"},
        "reset token used as access": {"Authorization": f"Bearer {reset_token}"},
        "deleted user": {"Authorization": f"Bearer {unknown_user}"},
    }
    for label, headers in cases.items():
        for method, path, body in (
            ("GET", "/api/v1/users/me", None),
            ("GET", "/api/v1/history", None),
            ("POST", "/api/v1/ai/sentiment", {"text": "hello"}),
            ("POST", "/api/v1/documents/upload", None),
        ):
            response = await client.request(method, path, headers=headers, json=body)
            assert response.status_code == 401, f"{label}: {method} {path} -> {response.status_code}"
            assert "code" in response.json(), label
            assert response.headers.get("content-type", "").startswith("application/json")


@pytest.mark.asyncio
async def test_revoked_session_cannot_be_reused_after_logout(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/auth/register",
        json={"name": "Token Tester", "email": f"{uuid.uuid4().hex[:8]}@example.com", "password": "Str0ngPassw0rd"},
    )
    tokens = r.json()
    headers = {"Authorization": f"Bearer {tokens['accessToken']}"}
    r = await client.post("/api/v1/auth/logout", headers=headers, json={"refreshToken": tokens["refreshToken"]})
    assert r.status_code in (200, 204)
    r = await client.post("/api/v1/auth/refresh", json={"refreshToken": tokens["refreshToken"]})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_health_is_public_but_everything_else_under_the_api_is_not(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/health")).status_code == 200
    for path in ("/api/v1/users/me", "/api/v1/documents", "/api/v1/history", "/api/v1/ai/conversations", "/api/v1/ocr/results"):
        assert (await client.get(path)).status_code == 401, path


def test_png_fixture_is_valid_magic() -> None:
    assert PNG.startswith(b"\x89PNG")
