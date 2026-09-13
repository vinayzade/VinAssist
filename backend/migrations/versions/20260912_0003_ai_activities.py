"""AI activity history

Revision ID: 0003_ai_activities
Revises: 0002_document_chunks
Create Date: 2026-09-12 15:00:00 UTC
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_ai_activities"
down_revision: Union[str, None] = "0002_document_chunks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KINDS = ("ocr", "document_analysis", "image_analysis", "image_quality", "sentiment", "conversation")


def upgrade() -> None:
    activity_kind = postgresql.ENUM(*KINDS, name="activity_kind", create_type=False)
    activity_kind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "ai_activities",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", activity_kind, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("preview", sa.Text(), nullable=False, server_default=""),
        sa.Column("ref_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("favourite", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_activities")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ai_activities_user_id_users"), ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_ai_activities_user_last_activity", "ai_activities", ["user_id", "last_activity_at"]
    )
    op.create_index("ix_ai_activities_user_kind", "ai_activities", ["user_id", "kind"])
    op.create_index("ix_ai_activities_user_favourite", "ai_activities", ["user_id", "favourite"])
    op.create_index("ix_ai_activities_ref", "ai_activities", ["ref_id"])
    op.execute(
        """
        CREATE TRIGGER trg_ai_activities_updated_at
        BEFORE UPDATE ON ai_activities
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_ai_activities_updated_at ON ai_activities")
    op.drop_index("ix_ai_activities_ref", table_name="ai_activities")
    op.drop_index("ix_ai_activities_user_favourite", table_name="ai_activities")
    op.drop_index("ix_ai_activities_user_kind", table_name="ai_activities")
    op.drop_index("ix_ai_activities_user_last_activity", table_name="ai_activities")
    op.drop_table("ai_activities")
    op.execute("DROP TYPE IF EXISTS activity_kind")
