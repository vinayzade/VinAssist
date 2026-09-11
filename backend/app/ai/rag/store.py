"""
Vector store over `document_chunks` (pgvector).

Retrieval is scoped by user and document, ranked by cosine distance with
the HNSW index, and returns similarity in [0, 1] (1 = identical direction).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.rag.chunking import Chunk
from app.models.rag import EMBEDDING_DIMENSIONS, DocumentChunk


@dataclass(frozen=True)
class RetrievedChunk:
    id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: int
    text: str
    start_offset: int
    end_offset: int
    similarity: float


class VectorStore:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def replace_document_chunks(
        self,
        *,
        document_id: uuid.UUID,
        user_id: uuid.UUID,
        chunks: Sequence[Chunk],
        embeddings: Sequence[Sequence[float]],
        embedding_model: str,
    ) -> int:
        if len(chunks) != len(embeddings):
            raise ValueError("chunks and embeddings differ in length")
        for vector in embeddings:
            if len(vector) != EMBEDDING_DIMENSIONS:
                raise ValueError(
                    f"embedding has {len(vector)} dimensions; the store expects {EMBEDDING_DIMENSIONS}"
                )
        await self.session.execute(
            delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
        )
        rows = [
            DocumentChunk(
                document_id=document_id,
                user_id=user_id,
                chunk_index=chunk.index,
                text=chunk.text,
                token_count=chunk.token_count,
                start_offset=chunk.start,
                end_offset=chunk.end,
                embedding=list(vector),
                embedding_model=embedding_model,
            )
            for chunk, vector in zip(chunks, embeddings)
        ]
        self.session.add_all(rows)
        await self.session.flush()
        return len(rows)

    async def count_for_document(self, document_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
        )
        return int(await self.session.scalar(stmt) or 0)

    async def search(
        self,
        *,
        user_id: uuid.UUID,
        document_id: uuid.UUID,
        query_embedding: Sequence[float],
        top_k: int = 5,
        min_similarity: float = 0.0,
    ) -> list[RetrievedChunk]:
        """Top-k chunks of one document by cosine similarity to the query."""
        distance = DocumentChunk.embedding.cosine_distance(list(query_embedding))
        stmt = (
            select(DocumentChunk, distance.label("distance"))
            .where(DocumentChunk.user_id == user_id, DocumentChunk.document_id == document_id)
            .order_by(distance)
            .limit(top_k)
        )
        result = await self.session.execute(stmt)
        out: list[RetrievedChunk] = []
        for row, dist in result.all():
            similarity = 1.0 - float(dist)
            if similarity < min_similarity:
                continue
            out.append(
                RetrievedChunk(
                    id=row.id,
                    document_id=row.document_id,
                    chunk_index=row.chunk_index,
                    text=row.text,
                    start_offset=row.start_offset,
                    end_offset=row.end_offset,
                    similarity=round(similarity, 4),
                )
            )
        return out
