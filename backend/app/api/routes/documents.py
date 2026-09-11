from __future__ import annotations

import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, DocumentServiceDep, RAGDep
from app.api.routes.ocr import page_params
from app.core.exceptions import AppError
from app.schemas.ai import IndexDocumentOut, IndexDocumentRequestIn
from app.schemas.base import PageParams, Paginated
from app.schemas.document import DocumentDetail, DocumentSummary

router = APIRouter(tags=["documents"])

ServiceDep = DocumentServiceDep


class MissingFileError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "MISSING_FILE"
    message = "Attach a file in the 'file' field."


@router.post(
    "/upload",
    response_model=DocumentSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF or image",
    responses={
        400: {"description": "Extension/type mismatch, empty file, or unreadable content"},
        413: {"description": "File exceeds the size limit for its type"},
        415: {"description": "Unsupported MIME type or extension"},
    },
)
async def upload_document(
    user: CurrentUser,
    service: ServiceDep,
    file: Annotated[UploadFile | None, File(description="PDF or image")] = None,
) -> DocumentSummary:
    """
    Validates MIME type, extension, real content (magic bytes) and size while
    streaming to storage; only metadata goes to the database.
    """
    if file is None or not file.filename:
        raise MissingFileError()
    document = await service.upload(user, file)
    return DocumentSummary.model_validate(document)


@router.get("", response_model=Paginated[DocumentSummary], summary="List my documents")
async def list_documents(
    user: CurrentUser,
    service: ServiceDep,
    params: Annotated[PageParams, Depends(page_params)],
) -> Paginated[DocumentSummary]:
    rows, total = await service.list(user, offset=params.offset, limit=params.page_size)
    items = [DocumentSummary.model_validate(r) for r in rows]
    return Paginated.build(items, page=params.page, page_size=params.page_size, total=total)


@router.get("/{document_id}", response_model=DocumentDetail, summary="Document metadata")
async def get_document(
    document_id: uuid.UUID, user: CurrentUser, service: ServiceDep
) -> DocumentDetail:
    return DocumentDetail.from_row(await service.get(user, document_id))


@router.get("/{document_id}/content", summary="Download the stored file")
async def get_document_content(
    document_id: uuid.UUID, user: CurrentUser, service: ServiceDep
) -> StreamingResponse:
    document, stream = await service.open_content(user, document_id)
    filename = quote(document.name)
    return StreamingResponse(
        stream,
        media_type=document.mime_type,
        headers={
            "Content-Length": str(document.size_bytes),
            "Content-Disposition": f"inline; filename*=UTF-8''{filename}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete(
    "/{document_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a document"
)
async def delete_document(
    document_id: uuid.UUID, user: CurrentUser, service: ServiceDep
) -> Response:
    await service.delete(user, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{document_id}/index",
    response_model=IndexDocumentOut,
    summary="Chunk and embed a document for chat",
    responses={422: {"description": "The document has no text to index"}},
)
async def index_document(
    document_id: uuid.UUID,
    user: CurrentUser,
    rag: RAGDep,
    body: IndexDocumentRequestIn | None = None,
) -> IndexDocumentOut:
    """
    Text priority: `text` in the body (e.g. on-device OCR) > previously
    stored text > the PDF's own text layer. Re-indexing replaces all chunks.
    """
    result = await rag.index_document(
        user, document_id, text=body.text if body else None, force=bool(body and body.force)
    )
    return IndexDocumentOut(
        document_id=result.document_id,
        chunk_count=result.chunk_count,
        characters=result.characters,
        embedding_model=result.embedding_model,
        processing_ms=result.processing_ms,
    )
