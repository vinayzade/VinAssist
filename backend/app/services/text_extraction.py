"""
Server-side text extraction for stored documents.

PDFs with a text layer are read with pypdf. Images are not handled here:
the app runs OCR on the device and sends the text with the index request.
"""

from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)


def extract_document_text(data: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        return extract_pdf_text(data)
    return ""


def extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001 - malformed PDFs raise many things
        logger.warning("Could not open PDF for text extraction: %s", exc)
        return ""
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not extract a PDF page: %s", exc)
    return "\n\n".join(p for p in pages if p.strip())
