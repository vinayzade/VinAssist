"""
Application service: classify -> extract -> validate.

The provider's JSON is never returned as-is. `validate_extraction` parses,
shapes and grounds it against the source text; the client only ever sees a
schema-conformant object plus the list of fields that were dropped and why.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.ai import (
    AIError,
    AITimeoutError,
    ClassificationRequest,
    DocumentType,
    ExtractionRequest,
    ExtractionService,
    ValidatedExtraction,
    validate_extraction,
)
from app.ai.extraction.validation import ExtractionValidationError
from app.schemas.ai import ExtractOut
from app.utils.time import utcnow

logger = logging.getLogger(__name__)

# Below this the classifier's guess is not trusted and GENERIC is used instead.
MIN_CLASSIFICATION_CONFIDENCE = 0.35


class AIExtractionService:
    def __init__(self, provider_service: ExtractionService, *, timeout_seconds: float) -> None:
        self.provider_service = provider_service
        self.timeout_seconds = timeout_seconds

    async def run(self, text: str, forced_type: DocumentType | None = None) -> ExtractOut:
        started = time.perf_counter()
        deadline = self.timeout_seconds

        try:
            if forced_type is not None:
                document_type, confidence, scores = forced_type, 1.0, {}
            else:
                classification = await asyncio.wait_for(
                    self.provider_service.classify(ClassificationRequest(text=text)),
                    timeout=deadline,
                )
                document_type = classification.document_type
                confidence = classification.confidence
                scores = classification.scores
                if confidence < MIN_CLASSIFICATION_CONFIDENCE:
                    document_type = DocumentType.GENERIC

            remaining = max(1.0, deadline - (time.perf_counter() - started))
            extraction = await asyncio.wait_for(
                self.provider_service.extract(
                    ExtractionRequest(text=text, document_type=document_type)
                ),
                timeout=remaining,
            )
        except asyncio.TimeoutError as exc:
            logger.warning("Extraction timed out after %.0fs", deadline)
            raise AITimeoutError() from exc
        except AIError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("Extraction provider raised an unexpected error")
            raise AIError() from exc

        validated = self._validate(document_type, extraction.data, text)
        warnings = list(validated.warnings) + list(extraction.notes)
        if validated.completeness == 0:
            warnings.append("No fields could be extracted from this text.")

        return ExtractOut(
            document_type=validated.document_type.value,  # type: ignore[arg-type]
            confidence=round(confidence, 3),
            data=validated.data.model_dump(),
            scores=scores,
            warnings=warnings,
            completeness=round(validated.completeness, 2),
            processing_ms=int((time.perf_counter() - started) * 1000),
            model_name=extraction.model.model,
            provider=extraction.model.provider,
            created_at=utcnow(),
        )

    @staticmethod
    def _validate(document_type: DocumentType, raw: Any, text: str) -> ValidatedExtraction:
        try:
            return validate_extraction(document_type, raw, text)
        except ExtractionValidationError as exc:
            logger.warning("Extraction output rejected by validator: %s", exc)
            # Degrade to an empty-but-valid object rather than failing the request.
            empty = validate_extraction(document_type, {}, text)
            empty.warnings.append(f"The model's output was not usable: {exc}")
            return empty
