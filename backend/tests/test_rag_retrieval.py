"""
RAG retrieval: the vector store's ranking, thresholds and isolation against
real pgvector, plus the retrieval guarantees the document-chat endpoint
gives the app (only retrieved passages reach the model; sources are cited).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers.mock.provider import MockEmbeddingService
from app.ai.rag.chunking import Chunk, chunk_text, clean_text
from app.ai.rag.store import VectorStore
from app.ai.embeddings import EmbeddingRequest
from app.core.security import hash_password
from app.models.document import Document
from app.models.enums import DocumentKind, DocumentStatus
from app.models.user import User
from tests.test_rag import CONTRACT, _auth, _index, _upload

embedder = MockEmbeddingService()


async def _embed(texts: list[str]) -> list[list[float]]:
    response = await embedder.embed(EmbeddingRequest(texts=tuple(texts), purpose="document"))
    return [list(v) for v in response.vectors]


async def _user(db: AsyncSession) -> User:
    user = User(name="Retrieval Tester", email=f"{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Str0ngPassw0rd"))
    db.add(user)
    await db.flush()
    return user


async def _document(db: AsyncSession, user: User, name: str) -> Document:
    doc = Document(
        user_id=user.id, name=name, mime_type="application/pdf", extension="pdf", size_bytes=1,
        kind=DocumentKind.PDF, status=DocumentStatus.UPLOADED, storage_key=f"test/{uuid.uuid4().hex}",
    )
    db.add(doc)
    await db.flush()
    return doc


async def _fill(db: AsyncSession, user: User, doc: Document, passages: list[str]) -> None:
    chunks = [Chunk(index=i, text=t, start=0, end=len(t)) for i, t in enumerate(passages)]
    await VectorStore(db).replace_document_chunks(
        document_id=doc.id, user_id=user.id, chunks=chunks, embeddings=await _embed(passages), embedding_model="mock"
    )


PASSAGES = [
    "Fees. The client pays 1,250 per month, invoices due within 30 days.",
    "Termination. Either party may terminate with 60 days written notice.",
    "Support hours are Monday to Friday, nine to six, by email or phone.",
    "Confidentiality lasts five years after the agreement ends.",
]


@pytest.mark.asyncio
async def test_search_ranks_by_similarity_and_respects_top_k(db: AsyncSession) -> None:
    user = await _user(db)
    doc = await _document(db, user, "contract.pdf")
    await _fill(db, user, doc, PASSAGES)
    store = VectorStore(db)

    [query] = await _embed(["How many days written notice to terminate the agreement?"])
    hits = await store.search(user_id=user.id, document_id=doc.id, query_embedding=query, top_k=2)

    assert len(hits) == 2
    assert hits[0].chunk_index == 1  # the termination clause
    assert hits[0].similarity >= hits[1].similarity
    assert all(0 <= h.similarity <= 1 for h in hits)
    assert hits[0].document_id == doc.id


@pytest.mark.asyncio
async def test_min_similarity_filters_out_unrelated_passages(db: AsyncSession) -> None:
    user = await _user(db)
    doc = await _document(db, user, "contract.pdf")
    await _fill(db, user, doc, PASSAGES)
    store = VectorStore(db)

    [query] = await _embed(["Who won the football world cup in 1998?"])
    strict = await store.search(user_id=user.id, document_id=doc.id, query_embedding=query, top_k=4, min_similarity=0.5)
    loose = await store.search(user_id=user.id, document_id=doc.id, query_embedding=query, top_k=4, min_similarity=0.0)
    assert strict == []
    assert len(loose) == 4  # threshold, not top_k, is what removed them


@pytest.mark.asyncio
async def test_search_is_scoped_to_the_user_and_can_span_documents(db: AsyncSession) -> None:
    alice = await _user(db)
    bob = await _user(db)
    a1 = await _document(db, alice, "a1.pdf")
    a2 = await _document(db, alice, "a2.pdf")
    b1 = await _document(db, bob, "b1.pdf")
    await _fill(db, alice, a1, PASSAGES[:2])
    await _fill(db, alice, a2, PASSAGES[2:])
    await _fill(db, bob, b1, PASSAGES)
    store = VectorStore(db)
    [query] = await _embed(["What are the support hours by phone?"])

    # Bob's identical passages never surface for Alice, even by document id.
    assert await store.search(user_id=alice.id, document_id=b1.id, query_embedding=query, top_k=4, min_similarity=0.0) == []
    # Across Alice's documents the best passage comes from a2.
    hits = await store.search_documents(user_id=alice.id, document_ids=[a1.id, a2.id], query_embedding=query, top_k=3, min_similarity=0.0)
    assert hits[0].document_id == a2.id and "Support hours" in hits[0].text
    assert {h.document_id for h in hits} <= {a1.id, a2.id}
    assert await store.search_documents(user_id=alice.id, document_ids=[], query_embedding=query) == []


@pytest.mark.asyncio
async def test_reindexing_replaces_chunks_instead_of_duplicating(db: AsyncSession) -> None:
    user = await _user(db)
    doc = await _document(db, user, "contract.pdf")
    store = VectorStore(db)
    await _fill(db, user, doc, PASSAGES)
    assert await store.count_for_document(doc.id) == 4
    await _fill(db, user, doc, PASSAGES[:1])
    assert await store.count_for_document(doc.id) == 1


def test_chunks_are_bounded_sentence_aligned_and_overlap() -> None:
    cleaned = clean_text(CONTRACT)
    chunks = chunk_text(cleaned)
    assert len(chunks) > 3
    for chunk in chunks:
        assert chunk.token_count <= 400
        assert cleaned[chunk.start:chunk.end] == chunk.text
    # Consecutive chunks share their boundary sentence so nothing is cut mid-thought.
    for previous, current in zip(chunks, chunks[1:]):
        assert current.start < previous.end
    assert [c.index for c in chunks] == list(range(len(chunks)))


@pytest.mark.asyncio
async def test_document_chat_only_sends_retrieved_passages_and_cites_them(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)
    indexed = await _index(client, headers, doc_id)
    assert indexed["chunkCount"] > 5

    response = await client.post(
        "/api/v1/ai/document-chat",
        json={"documentId": doc_id, "question": "How many days of written notice are needed to terminate?"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    # A bounded set of passages, not the whole document.
    assert 1 <= len(body["sources"]) <= 5
    assert len(body["sources"]) < indexed["chunkCount"]
    assert body["grounded"] is True
    cited = [s for s in body["sources"] if s["cited"]]
    assert cited and "60 days" in cited[0]["text"]
    assert all(s["startOffset"] <= s["endOffset"] for s in body["sources"])
    # Sources are ordered most similar first.
    sims = [s["similarity"] for s in body["sources"]]
    assert sims == sorted(sims, reverse=True)

    # The document row records the index state the app shows.
    row = await db.scalar(select(Document).where(Document.id == uuid.UUID(doc_id)))
    assert row is not None and row.chunk_count == indexed["chunkCount"] and row.indexed_at is not None
