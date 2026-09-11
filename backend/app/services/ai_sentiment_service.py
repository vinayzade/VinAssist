"""
Application service for sentiment analysis.

Sits between the route and the vendor-neutral `SentimentService`:
- enforces a hard timeout regardless of provider,
- converts any unexpected provider failure into an `AIError`,
- measures processing time and persists the result with its provenance.

The provider's API key never leaves the backend; the app only ever sees
labels, confidences and model names.
"""

from __future__ import annotations

import asyncio
import logging
import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIError, AITimeoutError, SentimentRequest, SentimentService
from app.models.enums import SentimentLabel
from app.models.results import SentimentResult
from app.models.user import User
from app.repositories.base import BaseRepository
from app.schemas.ai import SentimentOut

logger = logging.getLogger(__name__)


class SentimentResultRepository(BaseRepository[SentimentResult]):
    model = SentimentResult


class AISentimentService:
    def __init__(
        self, session: AsyncSession, provider_service: SentimentService, *, timeout_seconds: float
    ) -> None:
        self.results = SentimentResultRepository(session)
        self.session = session
        self.provider_service = provider_service
        self.timeout_seconds = timeout_seconds

    async def analyze(self, user: User, text: str) -> SentimentOut:
        started = time.perf_counter()
        try:
            result = await asyncio.wait_for(
                self.provider_service.analyze(SentimentRequest(text=text)),
                timeout=self.timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            logger.warning("Sentiment analysis timed out after %.0fs", self.timeout_seconds)
            raise AITimeoutError() from exc
        except AIError:
            raise
        except Exception as exc:  # noqa: BLE001 - provider bugs must not become 500s
            logger.exception("Sentiment provider raised an unexpected error")
            raise AIError() from exc
        processing_ms = int((time.perf_counter() - started) * 1000)

        row = await self.results.add(
            SentimentResult(
                user_id=user.id,
                input_text=text,
                label=SentimentLabel(result.label),
                confidence=result.confidence,
                explanation=result.explanation,
                provider=result.model.provider,
                model=result.model.model,
                processing_ms=processing_ms,
            )
        )
        await self.session.refresh(row)

        return SentimentOut(
            sentiment=result.label.upper(),  # type: ignore[arg-type]
            confidence=round(result.confidence, 4),
            explanation=result.explanation,
            scores=result.scores,
            id=row.id,
            provider=row.provider or result.model.provider,
            model=row.model or result.model.model,
            processing_ms=processing_ms,
            created_at=row.created_at,
        )
