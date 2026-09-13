"""
`/api/v1/ai/*`: the only place the mobile app touches AI.

Routes depend on capability interfaces from `app.api.deps`; which vendor
answers is decided by `AI_PROVIDER` in the environment. Provider keys are
read from the environment on the server and never sent to clients.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.ai import DocumentType
from app.ai import ChatMessage
from app.api.deps import (
    ActivityDep,
    AppSettings,
    AssistantDep,
    CurrentUser,
    DbSession,
    ExtractionServiceDep,
    RAGDep,
    SentimentServiceDep,
    SummarizationServiceDep,
)
from app.schemas.ai import (
    AssistantChatOut,
    AssistantChatRequestIn,
    AssistantContextItemOut,
    AssistantConversationOut,
    AssistantConversationSummaryOut,
    AssistantMessageOut,
    AssistantSourceOut,
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
from app.models.activity import ActivityKind
from app.models.ai import AIConversation, AIMessage
from app.services.ai_extraction_service import AIExtractionService
from app.services.assistant_service import AssistantService
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
    body: SentimentRequestIn, user: CurrentUser, service: AISentimentDep, activities: ActivityDep
) -> SentimentOut:
    result = await service.analyze(user, body.text)
    await activities.record(
        user,
        ActivityKind.SENTIMENT,
        title=f"{result.sentiment.capitalize()} · {round(result.confidence * 100)}%",
        preview=body.text,
        ref_id=result.id,
        payload={
            "sentiment": result.sentiment,
            "confidence": result.confidence,
            "scores": result.scores,
            "model": result.model,
        },
    )
    return result


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
    body: SummarizeRequestIn, user: CurrentUser, service: AISummarizeDep, activities: ActivityDep
) -> SummarizeOut:
    """Modes: `quick`, `detailed`, `bullet_points`, `action_items`."""
    result = await service.summarize(body)
    mode = body.mode.replace("_", " ")
    await activities.record(
        user,
        ActivityKind.DOCUMENT_ANALYSIS,
        title=f"Summary ({mode})" + (f" · {result.document_type}" if result.document_type else ""),
        preview=result.summary or " · ".join(result.items),
        payload={
            "operation": "summarize",
            "mode": body.mode,
            "summary": result.summary,
            "items": result.items,
            "documentType": result.document_type,
            "model": result.model_name,
            "sourceText": body.text[:2000],
        },
    )
    return result


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
    body: ExtractRequestIn, user: CurrentUser, service: AIExtractDep, activities: ActivityDep
) -> ExtractOut:
    """
    OCR text -> classifier -> document type -> type-specific extraction.
    Types: BUSINESS_CARD, RESUME, INVOICE, RECEIPT, GENERIC. Pass
    `documentType` to skip classification. The model's JSON is validated,
    normalised and grounded against the text before it is returned.
    """
    forced = DocumentType(body.document_type) if body.document_type else None
    result = await service.run(body.text, forced)
    filled = [k for k, v in result.data.items() if v not in (None, "", [], {})]
    scalars = [k for k in filled if not isinstance(result.data[k], (list, dict))]
    await activities.record(
        user,
        ActivityKind.DOCUMENT_ANALYSIS,
        title=f"{result.document_type.replace('_', ' ').title()} · {len(filled)} fields",
        preview=", ".join(f"{k}: {result.data[k]}" for k in scalars[:6]),
        payload={
            "operation": "extract",
            "documentType": result.document_type,
            "confidence": result.confidence,
            "data": result.data,
            "warnings": result.warnings,
            "model": result.model_name,
        },
    )
    return result




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
    body: DocumentChatRequestIn, user: CurrentUser, rag: RAGDep, activities: ActivityDep
) -> DocumentChatOut:
    """
    Embeds the question, retrieves the most similar chunks from pgvector,
    and asks the LLM to answer from those passages only. The document is
    indexed on first use if needed. Sources list the passages used.
    """
    history = tuple(ChatMessage(role=t.role, content=t.content) for t in body.history)
    result = await rag.ask(user, body.document_id, body.question, history)
    await activities.record(
        user,
        ActivityKind.DOCUMENT_ANALYSIS,
        title=body.question,
        preview=result.answer,
        ref_id=body.document_id,
        payload={
            "operation": "document_chat",
            "documentId": str(body.document_id),
            "question": body.question,
            "answer": result.answer,
            "grounded": result.grounded,
            "model": result.model,
        },
    )
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


# --- Assistant (multimodal, app-scoped) ----------------------------------------------------

_PROVIDER_ERRORS = {
    429: {"description": "Provider rate limit reached"},
    502: {"description": "Provider error"},
    503: {"description": "Provider unavailable or misconfigured"},
    504: {"description": "Provider timed out"},
}


def _context_out(item: dict) -> AssistantContextItemOut:  # type: ignore[type-arg]
    return AssistantContextItemOut(
        type=item["type"],
        document_id=item.get("documentId"),
        title=item.get("title") or "",
        kind=item.get("kind"),
        indexed=item.get("indexed"),
        note=item.get("note"),
    )


def _message_out(message: AIMessage) -> AssistantMessageOut:
    meta = message.metadata_ or {}
    return AssistantMessageOut(
        id=message.id,
        role=message.role.value,  # type: ignore[arg-type]
        content=message.content,
        attachments=[_context_out(a) for a in meta.get("attachments") or []],
        sources=[AssistantSourceOut.model_validate(s) for s in meta.get("sources") or []],
        grounded=meta.get("grounded"),
        created_at=message.created_at,
    )


def _conversation_out(conversation: AIConversation) -> AssistantConversationOut:
    return AssistantConversationOut(
        id=conversation.id,
        title=conversation.title,
        messages=[_message_out(m) for m in conversation.messages],
        context=[_context_out(i) for i in AssistantService.context_of(conversation)],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.post(
    "/chat",
    response_model=AssistantChatOut,
    summary="Talk to the in-app assistant about your documents, images and results",
    responses={404: {"description": "Conversation or document not found"}, **_PROVIDER_ERRORS},
)
async def assistant_chat(
    body: AssistantChatRequestIn, user: CurrentUser, assistant: AssistantDep, activities: ActivityDep
) -> AssistantChatOut:
    """
    Multimodal turn: text (typed or transcribed from voice on the device) plus
    optional attachments - uploaded documents and images (by id), OCR text, or
    analysis results the app produced. The conversation keeps every attachment
    as context for follow-ups. Answers come only from that material, with
    cited passages; general chat is declined. Omit `conversationId` to start a
    new conversation.
    """
    result = await assistant.chat_turn(user, body)
    conversation = await assistant.get_conversation(user, result.conversation_id)
    question = body.message or "Tell me about this."
    await activities.touch(
        user,
        ActivityKind.CONVERSATION,
        result.conversation_id,
        title=conversation.title or question,
        preview=f"You: {question} | Assistant: {result.answer}",
        payload={
            "conversationId": str(result.conversation_id),
            "turns": len(conversation.messages) // 2,
        },
    )
    for item in result.context:
        if item.get("type") == "image" and item.get("captioned"):
            await activities.record(
                user,
                ActivityKind.IMAGE_ANALYSIS,
                title=f"Described {item.get('title') or 'an image'}",
                preview=str(item.get("caption") or ""),
                ref_id=uuid.UUID(item["documentId"]) if item.get("documentId") else None,
                payload={"documentId": item.get("documentId"), "caption": item.get("caption")},
            )
    return AssistantChatOut(
        conversation_id=result.conversation_id,
        message_id=result.message_id,
        answer=result.answer,
        sources=[
            AssistantSourceOut(
                chunk_id=s.chunk_id,
                document_id=s.document_id,
                document_name=s.document_name,
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
        scope=result.scope,  # type: ignore[arg-type]
        suggestions=list(result.suggestions),
        context=[_context_out(i) for i in result.context],
        model_name=result.model,
        provider=result.provider,
        retrieval_ms=result.retrieval_ms,
        generation_ms=result.generation_ms,
        processing_ms=result.processing_ms,
        created_at=result.created_at,
    )


@router.get(
    "/conversations",
    response_model=list[AssistantConversationSummaryOut],
    summary="My recent assistant conversations",
)
async def list_conversations(
    user: CurrentUser, assistant: AssistantDep, limit: int = Query(20, ge=1, le=100)
) -> list[AssistantConversationSummaryOut]:
    rows = await assistant.list_conversations(user, limit=limit)
    return [
        AssistantConversationSummaryOut(
            id=c.id, title=c.title, last_message_at=c.last_message_at, created_at=c.created_at
        )
        for c in rows
    ]


@router.get(
    "/conversations/{conversation_id}",
    response_model=AssistantConversationOut,
    summary="One conversation with its messages and current context",
    responses={404: {"description": "Conversation not found"}},
)
async def get_conversation(
    conversation_id: uuid.UUID, user: CurrentUser, assistant: AssistantDep
) -> AssistantConversationOut:
    return _conversation_out(await assistant.get_conversation(user, conversation_id))


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation",
    responses={404: {"description": "Conversation not found"}},
)
async def delete_conversation(
    conversation_id: uuid.UUID, user: CurrentUser, assistant: AssistantDep, activities: ActivityDep
) -> Response:
    await assistant.delete_conversation(user, conversation_id)
    await activities.delete_for_ref(user, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
