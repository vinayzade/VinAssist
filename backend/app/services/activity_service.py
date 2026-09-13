"""
AI activity history.

Every AI operation records a row in `ai_activities`; this service owns the
list (paginated, searchable, filterable) and the per-item actions the app
offers: rename, favourite, delete. Deleting an entry also removes the
detailed result it points at, so nothing lingers after "Delete".
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.activity import ActivityKind, AIActivity
from app.models.ai import AIConversation
from app.models.results import ImageQualityResult, OcrResult, SentimentResult
from app.models.user import User
from app.utils.time import utcnow

TITLE_MAX = 200
PREVIEW_MAX = 500

# Where `ref_id` points for kinds whose detail lives in another table.
_REF_TABLES: dict[ActivityKind, Any] = {
    ActivityKind.OCR: OcrResult,
    ActivityKind.IMAGE_QUALITY: ImageQualityResult,
    ActivityKind.SENTIMENT: SentimentResult,
    ActivityKind.CONVERSATION: AIConversation,
}


class ActivityNotFoundError(NotFoundError):
    code = "ACTIVITY_NOT_FOUND"
    message = "History item not found."


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


class ActivityService:
    """
    Writes commit immediately: the request-scoped session otherwise commits
    only after the response has been sent, and the app refetches the list
    the moment a mutation responds.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # --- writing --------------------------------------------------------------------------

    async def record(
        self,
        user: User,
        kind: ActivityKind,
        *,
        title: str,
        preview: str = "",
        ref_id: uuid.UUID | None = None,
        payload: dict[str, Any] | None = None,
    ) -> AIActivity:
        row = AIActivity(
            user_id=user.id,
            kind=kind,
            title=_clip(title, TITLE_MAX) or kind.value.replace("_", " ").capitalize(),
            preview=_clip(preview, PREVIEW_MAX),
            ref_id=ref_id,
            payload=payload,
            last_activity_at=utcnow(),
        )
        self.session.add(row)
        await self.session.commit()
        return row

    async def touch(
        self,
        user: User,
        kind: ActivityKind,
        ref_id: uuid.UUID,
        *,
        title: str,
        preview: str = "",
        payload: dict[str, Any] | None = None,
    ) -> AIActivity:
        """
        Refreshes the entry for `ref_id` (a conversation's latest turn), or
        creates it. A user-chosen title is kept; only the preview moves.
        """
        stmt = select(AIActivity).where(
            AIActivity.user_id == user.id, AIActivity.kind == kind, AIActivity.ref_id == ref_id
        )
        row = await self.session.scalar(stmt)
        if row is None:
            return await self.record(
                user, kind, title=title, preview=preview, ref_id=ref_id, payload=payload
            )
        row.preview = _clip(preview, PREVIEW_MAX)
        row.last_activity_at = utcnow()
        if payload is not None:
            row.payload = {**(row.payload or {}), **payload}
        if not (row.payload or {}).get("renamed"):
            row.title = _clip(title, TITLE_MAX) or row.title
        await self.session.commit()
        return row

    # --- reading --------------------------------------------------------------------------

    async def list(
        self,
        user: User,
        *,
        offset: int,
        limit: int,
        kinds: Sequence[ActivityKind] = (),
        favourites_only: bool = False,
        query: str | None = None,
    ) -> tuple[Sequence[AIActivity], int]:
        conditions = [AIActivity.user_id == user.id]
        if kinds:
            conditions.append(AIActivity.kind.in_(list(kinds)))
        if favourites_only:
            conditions.append(AIActivity.favourite.is_(True))
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            conditions.append(or_(AIActivity.title.ilike(pattern), AIActivity.preview.ilike(pattern)))

        total = int(
            await self.session.scalar(select(func.count()).select_from(AIActivity).where(*conditions))
            or 0
        )
        rows = (
            await self.session.scalars(
                select(AIActivity)
                .where(*conditions)
                .order_by(AIActivity.last_activity_at.desc(), AIActivity.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return rows, total

    async def get(self, user: User, activity_id: uuid.UUID) -> AIActivity:
        row = await self.session.scalar(
            select(AIActivity).where(AIActivity.id == activity_id, AIActivity.user_id == user.id)
        )
        if row is None:
            raise ActivityNotFoundError()
        return row

    # --- per-item actions ---------------------------------------------------------------------

    async def update(
        self, user: User, activity_id: uuid.UUID, *, title: str | None, favourite: bool | None
    ) -> AIActivity:
        row = await self.get(user, activity_id)
        if title is not None:
            row.title = _clip(title, TITLE_MAX)
            row.payload = {**(row.payload or {}), "renamed": True}
        if favourite is not None:
            row.favourite = favourite
        await self.session.commit()
        return row

    async def delete(self, user: User, activity_id: uuid.UUID) -> None:
        row = await self.get(user, activity_id)
        await self._delete_referenced(row)
        await self.session.delete(row)
        await self.session.commit()

    async def delete_all(self, user: User) -> int:
        rows = (await self.session.scalars(select(AIActivity).where(AIActivity.user_id == user.id))).all()
        for row in rows:
            await self._delete_referenced(row)
            await self.session.delete(row)
        await self.session.commit()
        return len(rows)

    async def delete_for_ref(self, user: User, ref_id: uuid.UUID) -> None:
        """Removes the history entry when its underlying record is deleted elsewhere."""
        await self.session.execute(
            delete(AIActivity).where(AIActivity.user_id == user.id, AIActivity.ref_id == ref_id)
        )
        await self.session.commit()

    async def _delete_referenced(self, row: AIActivity) -> None:
        table = _REF_TABLES.get(row.kind)
        if table is None or row.ref_id is None:
            return
        await self.session.execute(
            delete(table).where(table.id == row.ref_id, table.user_id == row.user_id)
        )


__all__ = ["ActivityNotFoundError", "ActivityService"]
