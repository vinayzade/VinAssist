"""
Document chat (RAG).

    index:  document text -> clean -> chunk -> embed -> pgvector
    ask:    question -> embed -> similarity search -> top-k chunks -> LLM -> answer + sources

Only the retrieved chunks reach the model, never the whole document.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import (
    AIError,
    AIInvalidInputError,
    AITimeoutError,
    ChatMessage,
    ChatRequest,
    ChatService,
    EmbeddingRequest,
    EmbeddingService,
)
from app.ai.rag.chunking import Chunk, chunk_text, clean_text
from app.ai.rag.prompt import (
    NOT_FOUND,
    SYSTEM_PROMPT,
    build_messages,
    cited_indexes,
    context_metadata,
)
from app.ai.rag.store import RetrievedChunk, VectorStore
from app.core.exceptions import AppError
from app.models.document import Document
from app.models.rag import EMBEDDING_DIMENSIONS
from app.models.user import User
from app.services.document_service import DocumentService
from app.services.text_extraction import extract_document_text
from app.utils.time import utcnow

logger = logging.getLogger(__name__)

EMBED_BATCH = 32


class DocumentNotIndexableError(AppError):
    status_code = 422
    code = "DOCUMENT_NOT_INDEXABLE"
    message = "This document has no text to index. Run OCR and send the text, or upload a text PDF."


class DocumentNotIndexedError(AppError):
    status_code = 409
    code = "DOCUMENT_NOT_INDEXED"
    message = "This document has not been indexed yet."


@dataclass(frozen=True)
class IndexResult:
    document_id: uuid.UUID
    chunk_count: int
    characters: int
    embedding_model: str
    processing_ms: int


@dataclass(frozen=True)
class Source:
    chunk_id: uuid.UUID
    chunk_index: int
    text: str
    start_offset: int
    end_offset: int
    similarity: float
    cited: bool


@dataclass(frozen=True)
class Answer:
    document_id: uuid.UUID
    question: str
    answer: str
    sources: tuple[Source, ...]
    grounded: bool
    model: str
    provider: str
    retrieval_ms: int
    generation_ms: int
    processing_ms: int


class RAGService:
    def __init__(
        self,
        session: AsyncSession,
        documents: DocumentService,
        embeddings: EmbeddingService,
        chat: ChatService,
        *,
        timeout_seconds: float,
        top_k: int = 5,
        min_similarity: float = 0.15,
    ) -> None:
        self.session = session
        self.documents = documents
        self.embeddings = embeddings
        self.chat = chat
        self.store = VectorStore(session)
        self.timeout_seconds = timeout_seconds
        self.top_k = top_k
        self.min_similarity = min_similarity

    # --- indexing ---------------------------------------------------------------------------

    async def index_document(
        self, user: User, document_id: uuid.UUID, *, text: str | None = None, force: bool = False
    ) -> IndexResult:
        started = time.perf_counter()
        document = await self.documents.get(user, document_id)

        source = (text or "").strip() or (document.extracted_text or "").strip()
        if not source:
            source = await self._extract_text(user, document)
        if not source:
            raise DocumentNotIndexableError()

        if self.embeddings.dimensions != EMBEDDING_DIMENSIONS:
            raise AIError(
                f"Embedding model produces {self.embeddings.dimensions} dimensions; "
                f"the index stores {EMBEDDING_DIMENSIONS}.",
                code="AI_MISCONFIGURED",
            )

        cleaned = clean_text(source)
        chunks = chunk_text(cleaned)
        if not chunks:
            raise DocumentNotIndexableError()

        if (
            not force
            and document.indexed_at is not None
            and document.chunk_count == len(chunks)
            and document.extracted_text == cleaned
        ):
            return IndexResult(
                document.id, document.chunk_count, len(cleaned), document.embedding_model or "",
                int((time.perf_counter() - started) * 1000),
            )

        vectors, model_name = await self._embed([c.text for c in chunks])
        count = await self.store.replace_document_chunks(
            document_id=document.id,
            user_id=user.id,
            chunks=chunks,
            embeddings=vectors,
            embedding_model=model_name,
        )
        document.extracted_text = cleaned
        document.indexed_at = utcnow()
        document.chunk_count = count
        document.embedding_model = model_name
        await self.session.flush()
        logger.info("Indexed document %s: %d chunks (%s)", document.id, count, model_name)
        return IndexResult(
            document.id, count, len(cleaned), model_name, int((time.perf_counter() - started) * 1000)
        )

    async def _extract_text(self, user: User, document: Document) -> str:
        if document.kind.value != "pdf":
            return ""
        _, stream = await self.documents.open_content(user, document.id)
        data = b"".join([chunk async for chunk in stream])
        return await asyncio.to_thread(extract_document_text, data, document.mime_type)

    async def _embed(self, texts: list[str]) -> tuple[list[list[float]], str]:
        vectors: list[list[float]] = []
        model_name = ""
        for i in range(0, len(texts), EMBED_BATCH):
            batch = tuple(texts[i : i + EMBED_BATCH])
            response = await self._with_timeout(
                self.embeddings.embed(EmbeddingRequest(texts=batch, purpose="document"))
            )
            vectors.extend([list(v) for v in response.vectors])
            model_name = response.model.model
        return vectors, model_name

    # --- asking ---------------------------------------------------------------------------------

    async def ask(
        self,
        user: User,
        document_id: uuid.UUID,
        question: str,
        history: tuple[ChatMessage, ...] = (),
        *,
        auto_index: bool = True,
    ) -> Answer:
        started = time.perf_counter()
        question = question.strip()
        if not question:
            raise AIInvalidInputError("Ask a question about the document.")

        document = await self.documents.get(user, document_id)
        if document.indexed_at is None or document.chunk_count == 0:
            if not auto_index:
                raise DocumentNotIndexedError()
            await self.index_document(user, document_id)

        # Retrieval: embed the question and pull the closest passages only.
        retrieval_started = time.perf_counter()
        query = await self._with_timeout(
            self.embeddings.embed(EmbeddingRequest(texts=(question,), purpose="query"))
        )
        chunks = await self.store.search(
            user_id=user.id,
            document_id=document.id,
            query_embedding=query.vectors[0],
            top_k=self.top_k,
            min_similarity=self.min_similarity,
        )
        retrieval_ms = int((time.perf_counter() - retrieval_started) * 1000)

        if not chunks:
            return Answer(
                document_id=document.id, question=question, answer=NOT_FOUND, sources=(),
                grounded=False, model=query.model.model, provider=query.model.provider,
                retrieval_ms=retrieval_ms, generation_ms=0,
                processing_ms=int((time.perf_counter() - started) * 1000),
            )

        # Generation: only the retrieved chunks go to the model.
        generation_started = time.perf_counter()
        response = await self._with_timeout(
            self.chat.complete(
                ChatRequest(
                    messages=build_messages(question, chunks, history, document.name),
                    system=SYSTEM_PROMPT,
                    max_tokens=400,
                    temperature=0.1,
                    metadata=context_metadata(chunks),
                )
            )
        )
        generation_ms = int((time.perf_counter() - generation_started) * 1000)

        answer_text = response.message.content.strip()
        cited = set(cited_indexes(answer_text, len(chunks)))
        grounded = answer_text.strip('"') != NOT_FOUND and (bool(cited) or len(chunks) > 0)
        sources = tuple(
            Source(
                chunk_id=c.id, chunk_index=c.chunk_index, text=c.text,
                start_offset=c.start_offset, end_offset=c.end_offset,
                similarity=c.similarity, cited=i in cited,
            )
            for i, c in enumerate(chunks)
        )
        return Answer(
            document_id=document.id, question=question, answer=answer_text, sources=sources,
            grounded=grounded and answer_text.strip('"') != NOT_FOUND,
            model=response.model.model, provider=response.model.provider,
            retrieval_ms=retrieval_ms, generation_ms=generation_ms,
            processing_ms=int((time.perf_counter() - started) * 1000),
        )

    async def _with_timeout(self, coro):  # type: ignore[no-untyped-def]
        try:
            return await asyncio.wait_for(coro, timeout=self.timeout_seconds)
        except asyncio.TimeoutError as exc:
            raise AITimeoutError() from exc
        except AIError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("RAG provider call failed")
            raise AIError() from exc


__all__ = ["Answer", "IndexResult", "RAGService", "RetrievedChunk", "Source"]
