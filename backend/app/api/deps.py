"""
Shared FastAPI dependencies.

Route handlers declare what they need (`DbSession`, `CurrentUser`, a
service, ...) and this module wires it up, so handlers stay thin and
services stay constructible without FastAPI in tests.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import (
    AIProvider,
    ChatService,
    EmbeddingService,
    ExtractionService,
    OCRService,
    SentimentService,
    SummarizationService,
    VisionService,
    get_ai_provider,
)
from app.core.config import Settings, get_settings
from app.core.exceptions import UnauthorizedError
from app.database.session import get_db
from app.models.user import User
from app.services.auth_service import AuthService, ClientInfo
from app.services.document_service import DocumentService
from app.services.health import HealthService
from app.services.rag_service import RAGService
from app.storage import FileStorage, get_file_storage

DbSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def get_health_service() -> HealthService:
    return HealthService()


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]


def get_auth_service(db: DbSession, settings: AppSettings) -> AuthService:
    return AuthService(db, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_client_info(request: Request) -> ClientInfo:
    """What we record against a refresh token for the user's session list."""
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )
    return ClientInfo(user_agent=request.headers.get("user-agent"), ip_address=ip)


ClientInfoDep = Annotated[ClientInfo, Depends(get_client_info)]

# auto_error=False so a missing header produces our {detail, code} body,
# not FastAPI's default 403.
_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    auth: AuthServiceDep,
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Authentication is required.", code="NOT_AUTHENTICATED")
    return await auth.resolve_access_token(credentials.credentials)


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    auth: AuthServiceDep,
) -> User | None:
    """Like `get_current_user` but tolerates a missing or invalid token."""
    if credentials is None:
        return None
    try:
        return await auth.resolve_access_token(credentials.credentials)
    except UnauthorizedError:
        return None


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


# --- AI services -------------------------------------------------------------------
# Controllers depend on these interfaces only. The concrete provider is
# chosen by AI_PROVIDER and can be swapped without touching any route.

AIProviderDep = Annotated[AIProvider, Depends(get_ai_provider)]


def get_chat_service(provider: AIProviderDep) -> ChatService:
    return provider.require_chat()


def get_vision_service(provider: AIProviderDep) -> VisionService:
    return provider.require_vision()


def get_sentiment_service(provider: AIProviderDep) -> SentimentService:
    return provider.require_sentiment()


def get_summarization_service(provider: AIProviderDep) -> SummarizationService:
    return provider.require_summarization()


def get_embedding_service(provider: AIProviderDep) -> EmbeddingService:
    return provider.require_embeddings()


def get_ocr_service(provider: AIProviderDep) -> OCRService:
    return provider.require_ocr()


def get_extraction_service(provider: AIProviderDep) -> ExtractionService:
    return provider.require_extraction()


ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
VisionServiceDep = Annotated[VisionService, Depends(get_vision_service)]
SentimentServiceDep = Annotated[SentimentService, Depends(get_sentiment_service)]
SummarizationServiceDep = Annotated[SummarizationService, Depends(get_summarization_service)]
EmbeddingServiceDep = Annotated[EmbeddingService, Depends(get_embedding_service)]
OCRServiceDep = Annotated[OCRService, Depends(get_ocr_service)]
ExtractionServiceDep = Annotated[ExtractionService, Depends(get_extraction_service)]


# --- Documents & RAG -------------------------------------------------------------------


def get_document_service(
    db: DbSession,
    settings: AppSettings,
    storage: Annotated[FileStorage, Depends(get_file_storage)],
) -> DocumentService:
    return DocumentService(db, storage, settings)


DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]


def get_rag_service(
    db: DbSession,
    documents: DocumentServiceDep,
    embeddings: EmbeddingServiceDep,
    chat: ChatServiceDep,
    settings: AppSettings,
) -> RAGService:
    return RAGService(
        db,
        documents,
        embeddings,
        chat,
        timeout_seconds=settings.ai_timeout_seconds,
        top_k=settings.rag_top_k,
        min_similarity=settings.rag_min_similarity,
    )


RAGDep = Annotated[RAGService, Depends(get_rag_service)]
