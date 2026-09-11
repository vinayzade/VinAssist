"""Persistence for on-device image quality reports (see `image_quality_results`)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.results import ImageQualityResult
from app.models.user import User
from app.repositories.base import BaseRepository
from app.schemas.image_quality import ImageQualitySummary, SaveImageQualityRequest


def status_for(score: int) -> str:
    if score >= 75:
        return "GOOD"
    if score >= 50:
        return "FAIR"
    return "POOR"


class ImageQualityRepository(BaseRepository[ImageQualityResult]):
    model = ImageQualityResult

    async def list_for_user(
        self, user_id: uuid.UUID, *, offset: int, limit: int
    ) -> Sequence[ImageQualityResult]:
        stmt = (
            select(ImageQualityResult)
            .where(ImageQualityResult.user_id == user_id)
            .order_by(ImageQualityResult.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.execute(stmt)).scalars().all()

    async def count_for_user(self, user_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(ImageQualityResult)
            .where(ImageQualityResult.user_id == user_id)
        )
        return int(await self.session.scalar(stmt) or 0)


class ImageQualityService:
    def __init__(self, session: AsyncSession) -> None:
        self.results = ImageQualityRepository(session)

    async def save(self, user: User, payload: SaveImageQualityRequest) -> ImageQualitySummary:
        row = await self.results.add(
            ImageQualityResult(
                user_id=user.id,
                score=payload.overall_score,
                blur=payload.blur_level,
                exposure=payload.exposure_level,
                issues=payload.warnings,
                provider="on-device",
                model=payload.engine,
                processing_ms=payload.processing_ms,
                source_key=payload.source_uri,
            )
        )
        await self.results.session.refresh(row)
        return self._summary(row)

    async def list(
        self, user: User, *, offset: int, limit: int
    ) -> tuple[list[ImageQualitySummary], int]:
        rows = await self.results.list_for_user(user.id, offset=offset, limit=limit)
        total = await self.results.count_for_user(user.id)
        return [self._summary(r) for r in rows], total

    async def delete(self, user: User, result_id: uuid.UUID) -> None:
        row = await self.results.get(result_id)
        if row is None or row.user_id != user.id:
            raise NotFoundError("Quality report not found.", code="IMAGE_QUALITY_NOT_FOUND")
        await self.results.delete(row)

    @staticmethod
    def _summary(row: ImageQualityResult) -> ImageQualitySummary:
        return ImageQualitySummary(
            id=row.id,
            score=row.score,
            status=status_for(row.score),  # type: ignore[arg-type]
            blur=row.blur,
            exposure=row.exposure,
            issues=list(row.issues or []),
            engine=row.model or "unknown",
            created_at=row.created_at,
        )
