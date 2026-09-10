"""
Enumerations stored as native PostgreSQL enum types.

Values mirror the string unions in the mobile app's API contracts
(`src/services/api/*.ts`) so rows serialise without translation.
"""

from __future__ import annotations

import enum


class DocumentKind(str, enum.Enum):
    PDF = "pdf"
    IMAGE = "image"


class DocumentStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class ChatRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class BlurLevel(str, enum.Enum):
    NONE = "none"
    SLIGHT = "slight"
    HEAVY = "heavy"


class ExposureLevel(str, enum.Enum):
    UNDER = "under"
    GOOD = "good"
    OVER = "over"


class SentimentLabel(str, enum.Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"
