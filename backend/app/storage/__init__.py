from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.storage.base import FileStorage, StoredFile
from app.storage.local import InvalidStorageKeyError, LocalFileStorage

__all__ = [
    "FileStorage",
    "InvalidStorageKeyError",
    "LocalFileStorage",
    "StoredFile",
    "get_file_storage",
]


@lru_cache
def get_file_storage() -> FileStorage:
    settings = get_settings()
    if settings.storage_backend == "local":
        return LocalFileStorage(settings.storage_dir)
    raise RuntimeError(f"Unsupported STORAGE_BACKEND {settings.storage_backend!r}")
