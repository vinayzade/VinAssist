"""
File storage abstraction.

Uploaded bytes never go into PostgreSQL; the database keeps metadata and an
opaque `storage_key`. Swapping local disk for S3/GCS means implementing
this interface and changing `STORAGE_BACKEND`, nothing else.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class StoredFile:
    key: str
    size_bytes: int
    sha256: str


class FileStorage(Protocol):
    async def save(self, key: str, chunks: AsyncIterator[bytes]) -> StoredFile:
        """Persists the stream under `key`, returning size and digest."""

    async def open(self, key: str) -> AsyncIterator[bytes]:
        """Streams the stored bytes; raises FileNotFoundError when absent."""

    async def delete(self, key: str) -> None:
        """Removes the object; missing keys are ignored."""

    async def exists(self, key: str) -> bool: ...
