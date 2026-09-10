from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.database import session as db_session

pytestmark = pytest.mark.asyncio


async def test_health_returns_exact_contract(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


async def test_health_sets_request_and_timing_headers(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-ID": "abc-123"})

    assert response.headers["X-Request-ID"] == "abc-123"
    assert response.headers["X-Response-Time"].endswith("ms")


async def test_ready_reports_database_up(client: AsyncClient) -> None:
    response = await client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": True}


async def test_ready_degrades_when_database_is_down(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def failing_check() -> bool:
        return False

    monkeypatch.setattr("app.services.health.check_database", failing_check)

    response = await client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "degraded", "database": False}


async def test_database_check_round_trips(client: AsyncClient) -> None:
    assert await db_session.check_database() is True
