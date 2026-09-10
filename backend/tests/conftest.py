"""
Test fixtures.

Tests run against a real PostgreSQL server, never SQLite, so enum types,
JSONB, triggers and constraints behave exactly as in production.

- Set `TEST_DATABASE_URL` (postgresql+asyncpg://...) to use an existing
  server, e.g. a CI service container.
- Otherwise `pgserver` boots an embedded PostgreSQL in a temp directory.

Either way a fresh database is created for the session and migrated with
Alembic, so the migrations themselves are exercised on every run.
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _make_database(admin_url: str) -> str:
    """Create a uniquely named database on the server and return its URL."""
    import asyncio

    import asyncpg
    from sqlalchemy.engine import make_url

    url = make_url(admin_url)
    name = f"test_{uuid.uuid4().hex[:12]}"

    async def create() -> None:
        conn = await asyncpg.connect(
            user=url.username,
            password=url.password,
            host=url.host,
            port=url.port,
            database=url.database,
        )
        try:
            await conn.execute(f'CREATE DATABASE "{name}"')
        finally:
            await conn.close()

    asyncio.run(create())
    return url.set(database=name).render_as_string(hide_password=False)


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        yield _make_database(explicit)
        return

    import pgserver

    server = pgserver.get_server(BACKEND_DIR / ".pgdata-test", cleanup_mode="stop")
    port = server.get_uri().rsplit(":", 1)[1].split("/", 1)[0]
    name = f"test_{uuid.uuid4().hex[:12]}"
    server.psql(f'CREATE DATABASE "{name}"')
    yield f"postgresql+asyncpg://postgres:@127.0.0.1:{port}/{name}"


@pytest.fixture(scope="session", autouse=True)
def _configure_environment(database_url: str) -> None:
    os.environ["APP_ENV"] = "test"
    os.environ["DATABASE_URL"] = database_url
    os.environ["LOG_LEVEL"] = "WARNING"
    os.environ["CORS_ORIGINS"] = ""

    from app.core.config import get_settings

    get_settings.cache_clear()

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"alembic upgrade failed:\n{result.stdout}\n{result.stderr}"


@pytest.fixture(autouse=True)
async def _dispose_engine_after_test() -> AsyncIterator[None]:
    yield
    from app.database import session as db_session

    await db_session.dispose_engine()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    from app.core.config import get_settings
    from app.main import create_app

    app = create_app(get_settings())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db() -> AsyncIterator[AsyncSession]:
    """A session that is always rolled back, so tests never leak rows."""
    from app.database.session import get_session_factory

    async with get_session_factory()() as session:
        yield session
        await session.rollback()
