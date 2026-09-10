"""The error envelope must stay parseable by the mobile app's apiError.ts."""

from __future__ import annotations

import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.main import create_app

pytestmark = pytest.mark.asyncio


async def _client_with_routes(router: APIRouter) -> AsyncClient:
    app = create_app(get_settings())
    app.include_router(router)
    # Starlette re-raises unhandled exceptions after sending the 500 response
    # so servers can log them; tell the test transport not to propagate that.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_unknown_route_uses_detail_and_code(client: AsyncClient) -> None:
    response = await client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found", "code": "HTTP_404"}


async def test_app_error_maps_to_status_and_code() -> None:
    router = APIRouter()

    @router.get("/boom")
    async def boom() -> None:
        raise NotFoundError("No such document.", code="DOCUMENT_NOT_FOUND")

    async with await _client_with_routes(router) as ac:
        response = await ac.get("/boom")

    assert response.status_code == 404
    assert response.json() == {"detail": "No such document.", "code": "DOCUMENT_NOT_FOUND"}


async def test_unexpected_error_is_masked() -> None:
    router = APIRouter()

    @router.get("/crash")
    async def crash() -> None:
        raise RuntimeError("secret internals")

    async with await _client_with_routes(router) as ac:
        response = await ac.get("/crash")

    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert "secret" not in body["detail"]
