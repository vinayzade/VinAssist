"""
Local-disk storage. Fine for development and single-node deployments; the
same interface can be backed by object storage in production.

Safety properties:
- Keys are validated so a caller can never escape the root directory.
- Writes go to a temp file and are renamed into place, so a crash mid-upload
  never leaves a half-written object under a valid key.
- Blocking file I/O runs in a worker thread so the event loop stays free.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

from app.storage.base import FileStorage, StoredFile

_KEY_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_CHUNK = 1024 * 1024


class InvalidStorageKeyError(ValueError):
    pass


class LocalFileStorage(FileStorage):
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path_for(self, key: str) -> Path:
        parts = key.split("/")
        if not parts or any(not _KEY_SEGMENT.match(p) or p in {".", ".."} for p in parts):
            raise InvalidStorageKeyError(key)
        path = (self.root / Path(*parts)).resolve()
        if self.root not in path.parents:
            raise InvalidStorageKeyError(key)
        return path

    async def save(self, key: str, chunks: AsyncIterator[bytes]) -> StoredFile:
        path = self._path_for(key)
        tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.part")
        digest = hashlib.sha256()
        size = 0

        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
        handle = await asyncio.to_thread(open, tmp, "wb")
        try:
            async for chunk in chunks:
                if not chunk:
                    continue
                digest.update(chunk)
                size += len(chunk)
                await asyncio.to_thread(handle.write, chunk)
            await asyncio.to_thread(handle.flush)
            await asyncio.to_thread(os.fsync, handle.fileno())
        except BaseException:
            handle.close()
            await asyncio.to_thread(_unlink_quietly, tmp)
            raise
        else:
            handle.close()
            await asyncio.to_thread(os.replace, tmp, path)

        return StoredFile(key=key, size_bytes=size, sha256=digest.hexdigest())

    async def open(self, key: str) -> AsyncIterator[bytes]:
        path = self._path_for(key)
        if not await asyncio.to_thread(path.is_file):
            raise FileNotFoundError(key)
        handle = await asyncio.to_thread(open, path, "rb")
        try:
            while True:
                chunk = await asyncio.to_thread(handle.read, _CHUNK)
                if not chunk:
                    break
                yield chunk
        finally:
            handle.close()

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(_unlink_quietly, self._path_for(key))

    async def exists(self, key: str) -> bool:
        return await asyncio.to_thread(self._path_for(key).is_file)


def _unlink_quietly(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass
