"""
`/api/v1/ai/*`: the only place the mobile app touches AI.

Routes depend on capability interfaces from `app.api.deps`; which vendor
answers is decided by `AI_PROVIDER` in the environment. Provider keys are
read from the environment on the server and never sent to clients.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.ai import DocumentType
from app.ai import ChatMessage
from app.api.deps import (
    AppSettings,
    CurrentUser,
    DbSession,
    ExtractionServiceDep,
    RAGDep,
    SentimentServiceDep,
    SummarizationServiceDep,
)
from app.schemas.ai import (
    DocumentChatOut,
    DocumentChatRequestIn,
    ExtractOut,
    ExtractRequestIn,
    SentimentOut,
    SentimentRequestIn,
    SourceChunkOut,
    SummarizeOut,
    SummarizeRequestIn,
)
from app.services.ai_extraction_service import AIExtractionService
from app.services.ai_sentiment_service import AISentimentService
from app.services.ai_summarization_service import AISummarizationService
from app.utils.time import utcnow

router = APIRouter(tags=["ai"])


def get_ai_sentiment_service(
    db: DbSession, provider_service: SentimentServiceDep, settings: AppSettings
) -> AISentimentService:
    return AISentimentService(
        db, provider_service, timeout_seconds=settings.ai_timeout_seconds
    )


AISentimentDep = Annotated[AISentimentService, Depends(get_ai_sentiment_service)]


@router.post(
    "/sentiment",
    response_model=SentimentOut,
    summary="Classify the sentiment of a text",
    responses={
        400: {"description": "The provider rejected the input"},
        429: {"description": "Provider rate limit reached"},
        502: {"description": "Provider error"},
        503: {"description": "Provider unavailable or misconfigured"},
        504: {"description": "Provider timed out"},
    },
)
async def analyze_sentiment(
    body: SentimentRequestIn, user: CurrentUser, service: AISentimentDep
) -> SentimentOut:
    return await service.analyze(user, body.text)


def get_ai_summarization_service(
    provider_service: SummarizationServiceDep, settings: AppSettings
) -> AISummarizationService:
    return AISummarizationService(provider_service, timeout_seconds=settings.ai_timeout_seconds)


AISummarizeDep = Annotated[AISummarizationService, Depends(get_ai_summarization_service)]


@router.post(
    "/summarize",
    response_model=SummarizeOut,
    summary="Summarise a text in one of four modes",
    responses={
        400: {"description": "The provider rejected the input"},
        429: {"description": "Provider rate limit reached"},
        502: {"description": "Provider error"},
        503: {"description": "Provider unavailable or misconfigured"},
        504: {"description": "Provider timed out"},
    },
)
async def summarize(
    body: SummarizeRequestIn, _user: CurrentUser, service: AISummarizeDep
) -> SummarizeOut:
    """Modes: `quick`, `detailed`, `bullet_points`, `action_items`."""
    return await service.summarize(body)


def get_ai_extraction_service(
    provider_service: ExtractionServiceDep, settings: AppSettings
) -> AIExtractionService:
    return AIExtractionService(provider_service, timeout_seconds=settings.ai_timeout_seconds)


AIExtractDep = Annotated[AIExtractionService, Depends(get_ai_extraction_service)]


@router.post(
    "/extract",
    response_model=ExtractOut,
    summary="Classify a document and extract structured fields",
    responses={
        400: {"description": "The provider rejected the input"},
        429: {"description": "Provider rate limit reached"},
        502: {"description": "Provider error"},
        503: {"description": "Provider unavailable or misconfigured"},
        504: {"description": "Provider timed out"},
    },
)
async def extract_document(
    body: ExtractRequestIn, _user: CurrentUser, service: AIExtractDep
) -> ExtractOut:
    """
    OCR text -> classifier -> document type -> type-specific extraction.
    Types: BUSINESS_CARD, RESUME, INVOICE, RECEIPT, GENERIC. Pass
    `documentType` to skip classification. The model's JSON is validated,
    normalised and grounded against the text before it is returned.
    """
    forced = DocumentType(body.document_type) if body.document_type else None
    return await service.run(body.text, forced)




@router.post(
    "/document-chat",
    response_model=DocumentChatOut,
    summary="Ask a question about an uploaded document (RAG)",
    responses={
        404: {"description": "Document not found"},
        422: {"description": "Document has no text to index"},
        429: {"description": "Provider rate limit reached"},
        502: {"description": "Provider error"},
        503: {"description": "Provider unavailable or misconfigured"},
        504: {"description": "Provider timed out"},
    },
)
async def document_chat(
    body: DocumentChatRequestIn, user: CurrentUser, rag: RAGDep
) -> DocumentChatOut:
    """
    Embeds the question, retrieves the most similar chunks from pgvector,
    and asks the LLM to answer from those passages only. The document is
    indexed on first use if needed. Sources list the passages used.
    """
    history = tuple(ChatMessage(role=t.role, content=t.content) for t in body.history)
    result = await rag.ask(user, body.document_id, body.question, history)
    return DocumentChatOut(
        document_id=result.document_id,
        question=result.question,
        answer=result.answer,
        sources=[
            SourceChunkOut(
                chunk_id=s.chunk_id,
                chunk_index=s.chunk_index,
                text=s.text,
                start_offset=s.start_offset,
                end_offset=s.end_offset,
                similarity=s.similarity,
                cited=s.cited,
            )
            for s in result.sources
        ],
        grounded=result.grounded,
        model_name=result.model,
        provider=result.provider,
        retrieval_ms=result.retrieval_ms,
        generation_ms=result.generation_ms,
        processing_ms=result.processing_ms,
        created_at=utcnow(),
    )
