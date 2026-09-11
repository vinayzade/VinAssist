"""Persisting on-device image quality reports."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _auth(client: AsyncClient) -> dict[str, str]:
    payload = {
        "name": "IQ Tester",
        "email": f"{uuid.uuid4().hex[:10]}@example.com",
        "password": "Str0ngPassw0rd",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def _report(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "overallScore": 84,
        "status": "GOOD",
        "blurScore": 90,
        "brightnessScore": 70,
        "resolutionScore": 100,
        "faceScore": 100,
        "faceCount": 1,
        "checks": {
            "faceDetected": True,
            "blur": False,
            "lowLight": False,
            "overexposed": False,
            "multipleFaces": False,
            "faceOutsideFrame": False,
            "resolution": "GOOD",
        },
        "warnings": ["Background lighting could be improved."],
        "recommendation": "Usable as is. Background lighting could be improved.",
        "engine": "on-device",
        "processingMs": 210,
        "imageWidth": 3000,
        "imageHeight": 4000,
    }
    base.update(overrides)
    return base


async def test_save_maps_to_enums_and_lists(client: AsyncClient) -> None:
    headers = await _auth(client)

    saved = await client.post("/api/v1/image-quality/results", json=_report(), headers=headers)
    assert saved.status_code == 201, saved.text
    body = saved.json()
    assert body["score"] == 84 and body["status"] == "GOOD"
    assert body["blur"] == "none" and body["exposure"] == "good"
    assert body["issues"] == ["Background lighting could be improved."]
    assert body["engine"] == "on-device"

    listed = await client.get("/api/v1/image-quality/results", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == body["id"]

    deleted = await client.delete(
        f"/api/v1/image-quality/results/{body['id']}", headers=headers
    )
    assert deleted.status_code == 204


@pytest.mark.parametrize(
    ("checks", "blur_score", "expected_blur", "expected_exposure"),
    [
        ({"blur": True}, 30, "slight", "good"),
        ({"blur": True}, 10, "heavy", "good"),
        ({"lowLight": True}, 90, "none", "under"),
        ({"overexposed": True}, 90, "none", "over"),
    ],
)
async def test_check_flags_become_blur_and_exposure_levels(
    client: AsyncClient,
    checks: dict[str, Any],
    blur_score: int,
    expected_blur: str,
    expected_exposure: str,
) -> None:
    headers = await _auth(client)
    report = _report(blurScore=blur_score, overallScore=40, status="POOR")
    report["checks"].update(checks)

    saved = await client.post("/api/v1/image-quality/results", json=report, headers=headers)

    assert saved.status_code == 201, saved.text
    assert saved.json()["blur"] == expected_blur
    assert saved.json()["exposure"] == expected_exposure
    assert saved.json()["status"] == "POOR"


async def test_validation_and_auth(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/image-quality/results", json=_report())).status_code == 401

    headers = await _auth(client)
    bad = await client.post(
        "/api/v1/image-quality/results", json=_report(overallScore=140), headers=headers
    )
    assert bad.status_code == 422
    assert bad.json()["detail"][0]["loc"][-1] == "overallScore"
