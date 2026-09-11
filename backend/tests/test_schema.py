"""Schema-level guarantees, exercised against the migrated PostgreSQL database."""

from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_engine
from app.models import (
    AIConversation,
    AIMessage,
    BlurLevel,
    ChatRole,
    Document,
    DocumentKind,
    DocumentStatus,
    ExposureLevel,
    ImageQualityResult,
    OcrResult,
    RefreshToken,
    SentimentLabel,
    SentimentResult,
    User,
)

EXPECTED_TABLES = {
    "users",
    "refresh_tokens",
    "documents",
    "document_chunks",
    "ai_conversations",
    "ai_messages",
    "ocr_results",
    "image_quality_results",
    "sentiment_results",
}


def _user(email: str | None = None) -> User:
    return User(
        email=email or f"{uuid.uuid4().hex}@example.com",
        name="Test User",
        hashed_password="x" * 60,
    )


async def test_all_tables_exist_with_uuid_and_timestamps() -> None:
    async with get_engine().connect() as conn:

        def introspect(sync_conn):  # type: ignore[no-untyped-def]
            insp = inspect(sync_conn)
            tables = set(insp.get_table_names()) - {"alembic_version"}
            columns = {t: {c["name"]: c for c in insp.get_columns(t)} for t in tables}
            pks = {t: insp.get_pk_constraint(t)["constrained_columns"] for t in tables}
            return tables, columns, pks

        tables, columns, pks = await conn.run_sync(introspect)

    assert tables == EXPECTED_TABLES
    for table in EXPECTED_TABLES:
        assert pks[table] == ["id"], table
        assert str(columns[table]["id"]["type"]) == "UUID", table
        for ts in ("created_at", "updated_at"):
            assert ts in columns[table], f"{table}.{ts}"
            assert columns[table][ts]["nullable"] is False


async def test_enum_types_are_native() -> None:
    async with get_engine().connect() as conn:
        rows = await conn.execute(
            text("SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname")
        )
        names = {r[0] for r in rows}
    assert names >= {
        "document_kind",
        "document_status",
        "chat_role",
        "blur_level",
        "exposure_level",
        "sentiment_label",
    }


async def test_ids_and_timestamps_are_generated(db: AsyncSession) -> None:
    user = _user()
    db.add(user)
    await db.flush()

    assert isinstance(user.id, uuid.UUID)
    await db.refresh(user)
    assert user.created_at is not None
    assert user.created_at.tzinfo is not None
    assert user.updated_at == user.created_at


async def test_updated_at_trigger_fires_for_raw_sql(db: AsyncSession) -> None:
    user = _user()
    db.add(user)
    await db.flush()
    before = (await db.execute(select(User.updated_at).where(User.id == user.id))).scalar_one()

    await asyncio.sleep(0.01)
    await db.execute(
        text("UPDATE users SET name = 'Renamed' WHERE id = :id"), {"id": user.id}
    )
    after = (await db.execute(select(User.updated_at).where(User.id == user.id))).scalar_one()

    assert after > before


async def test_email_is_unique_case_insensitively(db: AsyncSession) -> None:
    db.add(_user("Case@Example.com"))
    await db.flush()

    db.add(_user("case@example.com"))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_full_graph_round_trips_and_cascades(db: AsyncSession) -> None:
    user = _user()
    doc = Document(
        user=user,
        name="scan.pdf",
        mime_type="application/pdf",
        extension="pdf",
        size_bytes=1234,
        kind=DocumentKind.PDF,
        storage_key=f"docs/{uuid.uuid4()}",
        analysis={"summary": "s", "keyPoints": ["a"], "documentType": "invoice"},
    )
    convo = AIConversation(user=user, title="Hello")
    convo.messages.append(AIMessage(role=ChatRole.USER, content="hi", metadata_={"k": 1}))
    convo.messages.append(AIMessage(role=ChatRole.ASSISTANT, content="hello"))
    ocr = OcrResult(user=user, document=doc, text="hello", confidence=0.9)
    quality = ImageQualityResult(
        user=user,
        document=doc,
        score=80,
        blur=BlurLevel.SLIGHT,
        exposure=ExposureLevel.GOOD,
        issues=["glare"],
    )
    sentiment = SentimentResult(
        user=user, input_text="great", label=SentimentLabel.POSITIVE, confidence=0.99
    )
    token = RefreshToken(
        user=user,
        token_hash="a" * 64,
        expires_at=text("now() + interval '1 day'"),
    )
    db.add_all([user, doc, convo, ocr, quality, sentiment])
    db.add(token)
    await db.flush()
    # Capture ids now: expire_all() below makes attribute access reload lazily,
    # which an async session cannot do outside an awaited call.
    ids = {
        RefreshToken: token.id,
        AIConversation: convo.id,
        AIMessage: convo.messages[0].id,
        OcrResult: ocr.id,
        ImageQualityResult: quality.id,
        SentimentResult: sentiment.id,
    }

    # Status defaults server-side; enums and JSONB round-trip.
    await db.refresh(doc)
    assert doc.status is DocumentStatus.UPLOADED
    assert doc.analysis["keyPoints"] == ["a"]
    await db.refresh(quality)
    assert quality.blur is BlurLevel.SLIGHT
    assert quality.issues == ["glare"]

    # Deleting the document keeps results but nulls the reference.
    await db.delete(doc)
    await db.flush()
    db.expire_all()
    assert (await db.get(OcrResult, ids[OcrResult])).document_id is None

    # Deleting the user cascades to everything it owns.
    await db.delete(user)
    await db.flush()
    db.expire_all()
    for model, id_ in ids.items():
        assert await db.get(model, id_) is None, model.__name__


@pytest.mark.parametrize(
    ("factory", "message"),
    [
        (
            lambda u: SentimentResult(
                user=u, input_text="x", label=SentimentLabel.NEUTRAL, confidence=1.5
            ),
            "confidence_range",
        ),
        (
            lambda u: ImageQualityResult(
                user=u, score=101, blur=BlurLevel.NONE, exposure=ExposureLevel.GOOD
            ),
            "score_range",
        ),
        (
            lambda u: Document(
                user=u,
                name="empty",
                mime_type="image/png",
                extension="png",
                size_bytes=0,
                kind=DocumentKind.IMAGE,
                storage_key=f"docs/{uuid.uuid4()}",
            ),
            "size_positive",
        ),
    ],
)
async def test_check_constraints_reject_bad_values(
    db: AsyncSession, factory, message: str  # type: ignore[no-untyped-def]
) -> None:
    user = _user()
    db.add(user)
    db.add(factory(user))
    with pytest.raises(IntegrityError, match=message):
        await db.flush()
