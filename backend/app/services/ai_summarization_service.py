"""
Application service for text summarisation: hard timeout, error
normalisation, and timing. Stateless; nothing is persisted here because a
summary belongs to whatever it summarised (an OCR result, a document).
"""

from __future__ import annotations

import asyncio
import logging
import time

from app.ai import AIError, AITimeoutError, SummarizationRequest, SummarizationService
from app.schemas.ai import SummarizeOut, SummarizeRequestIn
from app.utils.time import utcnow

logger = logging.getLogger(__name__)


class AISummarizationService:
    def __init__(self, provider_service: SummarizationService, *, timeout_seconds: float) -> None:
        self.provider_service = provider_service
        self.timeout_seconds = timeout_seconds

    async def summarize(self, body: SummarizeRequestIn) -> SummarizeOut:
        started = time.perf_counter()
        try:
            result = await asyncio.wait_for(
                self.provider_service.summarize(
                    SummarizationRequest(text=body.text, mode=body.mode, source=body.source)
                ),
                timeout=self.timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            logger.warning("Summarisation timed out after %.0fs", self.timeout_seconds)
            raise AITimeoutError() from exc
        except AIError:
            raise
        except Exception as exc:  # noqa: BLE001 - provider bugs must not become 500s
            logger.exception("Summarisation provider raised an unexpected error")
            raise AIError() from exc

        return SummarizeOut(
            summary=result.summary,
            items=list(result.items),
            mode=result.mode,
            document_type=result.document_type,
            processing_ms=int((time.perf_counter() - started) * 1000),
            model_name=result.model.model,
            provider=result.model.provider,
            created_at=utcnow(),
        )
