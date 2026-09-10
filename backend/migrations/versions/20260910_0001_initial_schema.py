"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-09-10 13:00:00 UTC

Creates: users, refresh_tokens, documents, ai_conversations, ai_messages,
ocr_results, image_quality_results, sentiment_results.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# --- Enum types ------------------------------------------------------------
# Created explicitly (create_type=False on the column references) so each
# type is created exactly once and dropped cleanly on downgrade.
document_kind = postgresql.ENUM("pdf", "image", name="document_kind", create_type=False)
document_status = postgresql.ENUM(
    "uploaded", "processing", "ready", "failed", name="document_status", create_type=False
)
chat_role = postgresql.ENUM("user", "assistant", "system", name="chat_role", create_type=False)
blur_level = postgresql.ENUM("none", "slight", "heavy", name="blur_level", create_type=False)
exposure_level = postgresql.ENUM("under", "good", "over", name="exposure_level", create_type=False)
sentiment_label = postgresql.ENUM(
    "positive", "neutral", "negative", name="sentiment_label", create_type=False
)
ENUMS = (document_kind, document_status, chat_role, blur_level, exposure_level, sentiment_label)


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        server_default=sa.text("gen_random_uuid()"),
        nullable=False,
    )


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def _ai_provenance() -> list[sa.Column]:
    return [
        sa.Column("provider", sa.String(), nullable=True),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("processing_ms", sa.Integer(), nullable=True),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    for enum in ENUMS:
        enum.create(bind, checkfirst=True)

    # --- users ---------------------------------------------------------------
    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(
        "uq_users_email_lower", "users", [sa.text("lower(email)")], unique=True
    )

    # --- refresh_tokens ------------------------------------------------------
    op.create_table(
        "refresh_tokens",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["replaced_by_id"],
            ["refresh_tokens.id"],
            name=op.f("fk_refresh_tokens_replaced_by_id_refresh_tokens"),
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"])

    # --- documents -----------------------------------------------------------
    op.create_table(
        "documents",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=127), nullable=False),
        sa.Column("extension", sa.String(length=16), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("kind", document_kind, nullable=False),
        sa.Column("status", document_status, server_default="uploaded", nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("analysis", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_documents")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_documents_user_id_users"), ondelete="CASCADE"
        ),
        sa.UniqueConstraint("storage_key", name=op.f("uq_documents_storage_key")),
        sa.CheckConstraint("size_bytes > 0", name=op.f("ck_documents_size_positive")),
    )
    op.create_index("ix_documents_user_created", "documents", ["user_id", "created_at"])

    # --- ai_conversations ----------------------------------------------------
    op.create_table(
        "ai_conversations",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_conversations")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ai_conversations_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_ai_conversations_user_last_message",
        "ai_conversations",
        ["user_id", "last_message_at"],
    )

    # --- ai_messages ---------------------------------------------------------
    op.create_table(
        "ai_messages",
        _uuid_pk(),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", chat_role, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_messages")),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["ai_conversations.id"],
            name=op.f("fk_ai_messages_conversation_id_ai_conversations"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_ai_messages_conversation_created", "ai_messages", ["conversation_id", "created_at"]
    )

    # --- ocr_results ---------------------------------------------------------
    op.create_table(
        "ocr_results",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_key", sa.Text(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("language", sa.String(length=16), nullable=True),
        *_ai_provenance(),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ocr_results")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ocr_results_user_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name=op.f("fk_ocr_results_document_id_documents"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name=op.f("ck_ocr_results_confidence_range"),
        ),
    )
    op.create_index("ix_ocr_results_user_created", "ocr_results", ["user_id", "created_at"])

    # --- image_quality_results -----------------------------------------------
    op.create_table(
        "image_quality_results",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_key", sa.Text(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("blur", blur_level, nullable=False),
        sa.Column("exposure", exposure_level, nullable=False),
        sa.Column(
            "issues", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False
        ),
        *_ai_provenance(),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_image_quality_results")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_image_quality_results_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name=op.f("fk_image_quality_results_document_id_documents"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "score >= 0 AND score <= 100", name=op.f("ck_image_quality_results_score_range")
        ),
    )
    op.create_index(
        "ix_image_quality_results_user_created",
        "image_quality_results",
        ["user_id", "created_at"],
    )

    # --- sentiment_results ---------------------------------------------------
    op.create_table(
        "sentiment_results",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("input_text", sa.Text(), nullable=False),
        sa.Column("label", sentiment_label, nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        *_ai_provenance(),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sentiment_results")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_sentiment_results_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name=op.f("ck_sentiment_results_confidence_range"),
        ),
    )
    op.create_index(
        "ix_sentiment_results_user_created", "sentiment_results", ["user_id", "created_at"]
    )

    # --- updated_at trigger --------------------------------------------------
    # Keeps updated_at correct for writes that bypass the ORM (psql, jobs).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
        BEGIN
            -- clock_timestamp(), not now(): now() is frozen for the whole
            -- transaction, which would make same-transaction updates invisible.
            NEW.updated_at = clock_timestamp();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    for table in TABLES:
        op.execute(
            f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
            """
        )


# Child tables first so drops never hit a foreign key.
TABLES = (
    "sentiment_results",
    "image_quality_results",
    "ocr_results",
    "ai_messages",
    "ai_conversations",
    "documents",
    "refresh_tokens",
    "users",
)


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")

    for table in TABLES:
        op.drop_table(table)

    bind = op.get_bind()
    for enum in ENUMS:
        enum.drop(bind, checkfirst=True)
