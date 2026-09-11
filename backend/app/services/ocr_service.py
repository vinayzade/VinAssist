"""
Persistence for on-device OCR results.

Recognition itself does not happen here (it runs on the phone via ML Kit).
This service records what was recognised so it shows up in history and can
be handed to AI features without re-scanning.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.results import OcrResult
from app.models.user import User
from app.repositories.base import BaseRepository
from app.schemas.ocr import OcrResultDetail, OcrResultSummary, SaveOcrResultRequest

PREVIEW_MAX = 120
_HAS_ALNUM = re.compile(r"[^\W_]", re.UNICODE)


def word_count(text: str) -> int:
    """Whitespace-separated tokens containing a letter or digit (same rule as the app)."""
    return sum(1 for token in text.split() if _HAS_ALNUM.search(token))


def preview_of(text: str) -> str:
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    return first if len(first) <= PREVIEW_MAX else first[: PREVIEW_MAX - 1] + "…"


class OcrResultRepository(BaseRepository[OcrResult]):
    model = OcrResult

    async def list_for_user(
        self, user_id: uuid.UUID, *, offset: int, limit: int
    ) -> Sequence[OcrResult]:
        stmt = (
            select(OcrResult)
            .where(OcrResult.user_id == user_id)
            .order_by(OcrResult.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.execute(stmt)).scalars().all()

    async def count_for_user(self, user_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(OcrResult).where(OcrResult.user_id == user_id)
        return int(await self.session.scalar(stmt) or 0)


class OcrService:
    def __init__(self, session: AsyncSession) -> None:
        self.results = OcrResultRepository(session)

    async def save(self, user: User, payload: SaveOcrResultRequest) -> OcrResultDetail:
        row = await self.results.add(
            OcrResult(
                user_id=user.id,
                text=payload.text,
                confidence=payload.confidence,
                language=payload.language,
                provider="on-device",
                model=payload.engine,
                processing_ms=payload.processing_ms,
                source_key=payload.source_uri,
            )
        )
        await self.results.session.refresh(row)
        return self._detail(row)

    async def get(self, user: User, result_id: uuid.UUID) -> OcrResultDetail:
        row = await self.results.get(result_id)
        if row is None or row.user_id != user.id:
            raise NotFoundError("OCR result not found.", code="OCR_RESULT_NOT_FOUND")
        return self._detail(row)

    async def list(
        self, user: User, *, offset: int, limit: int
    ) -> tuple[list[OcrResultSummary], int]:
        rows = await self.results.list_for_user(user.id, offset=offset, limit=limit)
        total = await self.results.count_for_user(user.id)
        return [self._summary(r) for r in rows], total

    async def delete(self, user: User, result_id: uuid.UUID) -> None:
        row = await self.results.get(result_id)
        if row is None or row.user_id != user.id:
            raise NotFoundError("OCR result not found.", code="OCR_RESULT_NOT_FOUND")
        await self.results.delete(row)

    @staticmethod
    def _summary(row: OcrResult) -> OcrResultSummary:
        return OcrResultSummary(
            id=row.id,
            preview=preview_of(row.text),
            word_count=word_count(row.text),
            confidence=row.confidence,
            language=row.language,
            engine=row.model or "unknown",
            created_at=row.created_at,
        )

    @classmethod
    def _detail(cls, row: OcrResult) -> OcrResultDetail:
        return OcrResultDetail(**cls._summary(row).model_dump(), text=row.text)
