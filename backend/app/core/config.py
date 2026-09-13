"""
Application settings.

Every value is read from the environment (or `backend/.env`) exactly once and
cached. Import `get_settings()` rather than instantiating `Settings` so tests
can override values and call `get_settings.cache_clear()`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

Environment = Literal["development", "staging", "production", "test"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application -----------------------------------------------------
    app_name: str = "AI SmartAssist"
    app_version: str = "0.1.0"
    app_env: Environment = "development"
    debug: bool = False
    log_level: str = "INFO"

    # Matches `API_PREFIX` in the mobile app (src/services/api/config.ts).
    api_prefix: str = "/api/v1"

    # --- Database ----------------------------------------------------------
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/smartassist",
    )
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_echo: bool = False

    # --- Auth --------------------------------------------------------------
    # HS256 signing key for access and password-reset tokens. The default is
    # only acceptable in development; production must set JWT_SECRET.
    jwt_secret: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    password_reset_ttl_minutes: int = 30
    password_min_length: int = 8

    # --- AI provider -------------------------------------------------------------
    # Which vendor backs app/ai. "mock" needs no key and runs offline.
    ai_provider: str = "mock"
    ai_timeout_seconds: float = 60.0
    huggingface_api_key: str | None = None
    huggingface_base_url: str = "https://router.huggingface.co/hf-inference"
    huggingface_chat_url: str = "https://router.huggingface.co/v1/chat/completions"
    hf_chat_model: str = "meta-llama/Llama-3.1-8B-Instruct"
    hf_sentiment_model: str = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    hf_summarization_model: str = "facebook/bart-large-cnn"
    hf_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    hf_embedding_dimensions: int = 384
    # A vision-capable chat model (image + text via chat completions).
    hf_vision_model: str = "google/gemma-3-12b-it"
    # RAG retrieval: how many chunks reach the LLM and the similarity floor.
    rag_top_k: int = 5
    rag_min_similarity: float = 0.15

    # --- File storage --------------------------------------------------------
    # Uploaded files live on disk (or object storage later), never in Postgres.
    storage_backend: Literal["local"] = "local"
    storage_dir: Path = BACKEND_DIR / "storage"
    max_pdf_bytes: int = 20 * 1024 * 1024
    max_image_bytes: int = 10 * 1024 * 1024

    # --- CORS --------------------------------------------------------------
    # NoDecode: read as a raw comma-separated string, split in the validator.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url")
    @classmethod
    def _require_async_postgres(cls, value: str) -> str:
        """PostgreSQL only, via the async driver. Fails at startup, not on first query."""
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must be a postgresql+asyncpg:// URL")
        return value

    @model_validator(mode="after")
    def _no_default_secret_in_production(self) -> "Settings":
        if self.app_env == "production" and self.jwt_secret.startswith("dev-only"):
            raise ValueError("JWT_SECRET must be set to a strong random value in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_test(self) -> bool:
        return self.app_env == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()
