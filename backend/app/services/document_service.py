"""
Document upload and lifecycle.

Upload pipeline:

    multipart stream -> type checks (MIME + extension) -> magic-byte sniff
                     -> size-bounded streaming write to storage (hashing)
                     -> metadata row in `documents`

The file is written under an opaque, server-generated key; the client's file
name is kept only as a display label. If the database insert fails after the
bytes were written, the object is removed so storage never holds orphans.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator, Sequence

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import NotFoundError
from app.models.document import Document
from app.models.enums import DocumentStatus
from app.models.user import User
from app.repositories.base import BaseRepository
from app.services.file_validation import (
    SNIFF_BYTES,
    FileTooLargeError,
    SupportedType,
    UploadValidationError,
    check_content,
    format_size,
    max_bytes_for,
    resolve_type,
    safe_display_name,
)
from app.storage.base import FileStorage

logger = logging.getLogger(__name__)

CHUNK_SIZE = 512 * 1024


class DocumentRepository(BaseRepository[Document]):
    model = Document

    async def list_for_user(
        self, user_id: uuid.UUID, *, offset: int, limit: int
    ) -> Sequence[Document]:
        stmt = (
            select(Document)
            .where(Document.user_id == user_id)
            .order_by(Document.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.execute(stmt)).scalars().all()

    async def count_for_user(self, user_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(Document).where(Document.user_id == user_id)
        return int(await self.session.scalar(stmt) or 0)


class DocumentService:
    def __init__(self, session: AsyncSession, storage: FileStorage, settings: Settings) -> None:
        self.session = session
        self.documents = DocumentRepository(session)
        self.storage = storage
        self.settings = settings

    # --- Upload ------------------------------------------------------------------

    async def upload(self, user: User, upload: UploadFile) -> Document:
        supported = resolve_type(upload.content_type, upload.filename)
        limit = max_bytes_for(
            supported.kind,
            pdf_limit=self.settings.max_pdf_bytes,
            image_limit=self.settings.max_image_bytes,
        )
        extension = _extension_for(supported, upload.filename)
        key = f"documents/{user.id}/{uuid.uuid4().hex}.{extension}"

        # Content-Length, when the client sends one, lets us refuse early
        # without reading a byte. The streaming guard below is the real limit.
        if upload.size is not None and upload.size > limit:
            raise FileTooLargeError(_too_large_message(limit))

        stored = await self.storage.save(key, _bounded_chunks(upload, limit, supported))
        if stored.size_bytes == 0:
            await self.storage.delete(key)
            raise UploadValidationError("The file is empty.", code="EMPTY_FILE")

        document = Document(
            user_id=user.id,
            name=safe_display_name(upload.filename, extension),
            mime_type=supported.mime,
            extension=extension,
            size_bytes=stored.size_bytes,
            kind=supported.kind,
            status=DocumentStatus.UPLOADED,
            storage_key=stored.key,
            sha256=stored.sha256,
        )
        try:
            await self.documents.add(document)
        except Exception:
            await self.storage.delete(key)
            raise
        await self.session.refresh(document)
        logger.info(
            "Stored document %s for user %s (%s, %d bytes)",
            document.id,
            user.id,
            supported.mime,
            stored.size_bytes,
        )
        return document

    # --- Read / delete ----------------------------------------------------------------

    async def get(self, user: User, document_id: uuid.UUID) -> Document:
        row = await self.documents.get(document_id)
        if row is None or row.user_id != user.id:
            raise NotFoundError("Document not found.", code="DOCUMENT_NOT_FOUND")
        return row

    async def list(self, user: User, *, offset: int, limit: int) -> tuple[Sequence[Document], int]:
        rows = await self.documents.list_for_user(user.id, offset=offset, limit=limit)
        total = await self.documents.count_for_user(user.id)
        return rows, total

    async def open_content(self, user: User, document_id: uuid.UUID) -> tuple[Document, AsyncIterator[bytes]]:
        document = await self.get(user, document_id)
        try:
            stream = self.storage.open(document.storage_key)
        except FileNotFoundError as exc:
            raise NotFoundError("The stored file is missing.", code="FILE_MISSING") from exc
        return document, stream

    async def delete(self, user: User, document_id: uuid.UUID) -> None:
        document = await self.get(user, document_id)
        key = document.storage_key
        await self.documents.delete(document)
        # Commit-order matters little here: a dangling file is recoverable, a
        # dangling row pointing at nothing is not, so remove the row first.
        await self.storage.delete(key)


# --- helpers --------------------------------------------------------------------------


def _extension_for(supported: SupportedType, filename: str | None) -> str:
    from app.services.file_validation import extension_of

    ext = extension_of(filename)
    return ext if ext in supported.extensions else supported.extensions[0]


def _too_large_message(limit: int) -> str:
    return f"The file is larger than the {format_size(limit)} limit."


async def _bounded_chunks(
    upload: UploadFile, limit: int, expected: SupportedType
) -> AsyncIterator[bytes]:
    """
    Yields the upload in chunks, sniffing the first bytes and aborting as soon
    as the size limit is crossed, so an oversized file never fully lands on
    disk and never fully enters memory.
    """
    total = 0
    head = b""
    sniffed = False
    while True:
        chunk = await upload.read(CHUNK_SIZE)
        if not chunk:
            break
        if not sniffed:
            head += chunk
            if len(head) >= SNIFF_BYTES:
                check_content(head[:SNIFF_BYTES], expected)
                sniffed = True
        total += len(chunk)
        if total > limit:
            raise FileTooLargeError(_too_large_message(limit))
        yield chunk
    if not sniffed and head:
        # Tiny file: sniff whatever we got.
        check_content(head, expected)
