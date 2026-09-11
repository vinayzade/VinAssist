"""
AI layer. Import interfaces from here; never import a provider directly.

    from app.ai import ChatService, ChatRequest, get_ai_provider
"""

from app.ai.base import (
    AICapability,
    AIError,
    AIInvalidInputError,
    AIProvider,
    AIRateLimitedError,
    AITimeoutError,
    AIUnavailableError,
    ImageInput,
    ModelInfo,
    ProviderHealth,
    Usage,
)
from app.ai.chat import ChatMessage, ChatRequest, ChatResponse, ChatRole, ChatService
from app.ai.embeddings import EmbeddingRequest, EmbeddingResponse, EmbeddingService
from app.ai.extraction import (
    ClassificationRequest,
    ClassificationResponse,
    DocumentType,
    ExtractionRequest,
    ExtractionResponse,
    ExtractionService,
    ValidatedExtraction,
    validate_extraction,
)
from app.ai.ocr import OCRLine, OCRRequest, OCRResponse, OCRService
from app.ai.registry import (
    available_providers,
    create_provider,
    get_ai_provider,
    register_provider,
    set_ai_provider,
    shutdown_ai_provider,
)
from app.ai.sentiment import SentimentLabel, SentimentRequest, SentimentResponse, SentimentService
from app.ai.summarization import (
    MODE_MAX_WORDS,
    SUMMARY_MODES,
    SummarizationRequest,
    SummarizationResponse,
    SummarizationService,
    SummaryMode,
)
from app.ai.vision import VisionLabel, VisionRequest, VisionResponse, VisionService

__all__ = [
    "AICapability", "AIError", "AIInvalidInputError", "AIProvider", "AIRateLimitedError",
    "AITimeoutError", "AIUnavailableError", "ImageInput", "ModelInfo", "ProviderHealth", "Usage",
    "ChatMessage", "ChatRequest", "ChatResponse", "ChatRole", "ChatService",
    "EmbeddingRequest", "EmbeddingResponse", "EmbeddingService",
    "ClassificationRequest", "ClassificationResponse", "DocumentType", "ExtractionRequest",
    "ExtractionResponse", "ExtractionService", "ValidatedExtraction", "validate_extraction",
    "OCRLine", "OCRRequest", "OCRResponse", "OCRService",
    "SentimentLabel", "SentimentRequest", "SentimentResponse", "SentimentService",
    "MODE_MAX_WORDS", "SUMMARY_MODES", "SummarizationRequest", "SummarizationResponse",
    "SummarizationService", "SummaryMode",
    "VisionLabel", "VisionRequest", "VisionResponse", "VisionService",
    "available_providers", "create_provider", "get_ai_provider", "register_provider",
    "set_ai_provider", "shutdown_ai_provider",
]
