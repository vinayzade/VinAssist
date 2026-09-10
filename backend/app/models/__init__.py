"""
ORM models.

Every model module is imported here so `Base.metadata` is fully populated
when Alembic's `env.py` imports this package for autogeneration.
"""

from app.database.base import Base
from app.models.ai import AIConversation, AIMessage
from app.models.base import AIResultMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.document import Document
from app.models.enums import (
    BlurLevel,
    ChatRole,
    DocumentKind,
    DocumentStatus,
    ExposureLevel,
    SentimentLabel,
)
from app.models.results import ImageQualityResult, OcrResult, SentimentResult
from app.models.user import RefreshToken, User

__all__ = [
    "AIConversation",
    "AIMessage",
    "AIResultMixin",
    "Base",
    "BlurLevel",
    "ChatRole",
    "Document",
    "DocumentKind",
    "DocumentStatus",
    "ExposureLevel",
    "ImageQualityResult",
    "OcrResult",
    "RefreshToken",
    "SentimentLabel",
    "SentimentResult",
    "TimestampMixin",
    "User",
    "UUIDPrimaryKeyMixin",
]
