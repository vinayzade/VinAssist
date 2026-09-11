from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.models.enums import DocumentKind, DocumentStatus
from app.schemas.base import CamelModel


class DocumentSummary(CamelModel):
    """Matches `DocumentSummary` in the app's `documentApi.ts`."""

    id: uuid.UUID
    name: str
    mime_type: str
    size_bytes: int
    kind: DocumentKind
    status: DocumentStatus
    sha256: str | None
    created_at: datetime


class DocumentAnalysis(CamelModel):
    summary: str
    key_points: list[str]
    document_type: str | None = None


class DocumentDetail(DocumentSummary):
    """Matches `DocumentDetail`: adds extraction/analysis output when present."""

    text: str | None = None
    analysis: DocumentAnalysis | None = None
    error_message: str | None = None
    processed_at: datetime | None = None

    @classmethod
    def from_row(cls, row: Any) -> "DocumentDetail":
        analysis = None
        if row.analysis:
            analysis = DocumentAnalysis(
                summary=row.analysis.get("summary", ""),
                key_points=list(row.analysis.get("keyPoints", [])),
                document_type=row.analysis.get("documentType"),
            )
        return cls(
            id=row.id,
            name=row.name,
            mime_type=row.mime_type,
            size_bytes=row.size_bytes,
            kind=row.kind,
            status=row.status,
            sha256=row.sha256,
            created_at=row.created_at,
            text=row.extracted_text,
            analysis=analysis,
            error_message=row.error_message,
            processed_at=row.processed_at,
        )
