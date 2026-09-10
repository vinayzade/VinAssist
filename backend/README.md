# AI SmartAssist backend

FastAPI + PostgreSQL + SQLAlchemy 2 (async) + Alembic + Pydantic v2.

## Layout

    app/
      api/           routers and FastAPI dependencies (thin; no business logic)
      core/          settings, logging, exception -> HTTP mapping
      database/      async engine, session factory, declarative Base
      models/        SQLAlchemy ORM models (+ id/timestamp mixins)
      schemas/       Pydantic request/response models (camelCase for the app)
      repositories/  all SQL for one aggregate; services never touch the session
      services/      business logic, framework-free
      ai/            provider clients and pipelines (empty until AI work starts)
      middleware/    request id, timing, CORS
      utils/         small pure helpers
      main.py        create_app() factory + module-level `app`
    migrations/      Alembic (async env; URL comes from settings, not alembic.ini)
    tests/           pytest + httpx against a real PostgreSQL (embedded via pgserver)

Request flow: route -> service -> repository -> session. Errors raised as
`AppError` subclasses become `{"detail": ..., "code": ...}`, the shape the
mobile client parses.

## Run

    python -m venv .venv
    .venv\Scripts\activate           # Windows
    pip install -r requirements.txt
    copy .env.example .env           # then set DATABASE_URL
    uvicorn app.main:app --reload --port 8000

The mobile app's development build points at `http://10.0.2.2:8000` (Android
emulator alias for the host). Endpoints for the app live under `/api/v1`;
`/health` and `/ready` are at the root for infrastructure probes.

    GET /health -> {"status": "healthy"}
    GET /ready  -> {"status": "ready" | "degraded", "database": bool}

## Database

PostgreSQL only (asyncpg). SQLite is not supported anywhere, including tests.

    createdb smartassist                       # or via pgAdmin
    alembic upgrade head                       # applies migrations/versions/*
    alembic revision --autogenerate -m "..."   # after changing app/models
    alembic check                              # fails if models and DB drift

Tables (all with UUID `id`, `created_at`, `updated_at`):
`users`, `refresh_tokens`, `documents`, `ai_conversations`, `ai_messages`,
`ocr_results`, `image_quality_results`, `sentiment_results`.

Conventions baked into the initial migration:

- Enum columns are native PostgreSQL enum types (`document_status`, `chat_role`, ...).
- `updated_at` is maintained by a database trigger, so raw SQL and jobs stay correct.
- Emails are unique case-insensitively (`uq_users_email_lower`).
- Deleting a user cascades to everything they own; deleting a document
  keeps its OCR / quality results and nulls the reference.
- New models must be imported in `app/models/__init__.py` so autogenerate sees them.

## Test

    pytest

Tests boot an embedded PostgreSQL (the `pgserver` package) in `.pgdata-test/`,
create a fresh database, run `alembic upgrade head`, and exercise the schema.
On CI with a Postgres service container, set `TEST_DATABASE_URL` instead:

    TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres pytest
