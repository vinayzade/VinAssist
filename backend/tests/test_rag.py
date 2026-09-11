"""Document chat with retrieval: chunking, pgvector indexing, grounded answers."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.ai import set_ai_provider
from app.ai.providers.huggingface import HuggingFaceProvider
from app.ai.rag.chunking import chunk_text, clean_text
from app.database.session import get_session_factory
from app.models.rag import EMBEDDING_DIMENSIONS, DocumentChunk

PDF = b"%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"

CONTRACT = """SERVICE AGREEMENT

This agreement is between Acme Technologies Pvt Ltd ("Provider") and Vinay Zade ("Client").
It commences on 1 January 2026 and runs for twelve months.

Fees. The Client will pay 1,250.00 per month. Invoices are issued on the first business day
of each month and are due within 30 days. Late payments incur a 2% monthly fee.

Termination. Either party may terminate with 60 days written notice. On termination the
Client must return all Provider equipment within 14 days.

Support. The Provider offers support Monday to Friday, 9am to 6pm IST, by email at
support@acme.com and by phone on +91 98765 43210. Critical issues are answered within 4 hours.

Confidentiality. Both parties keep the terms of this agreement confidential for five years
after it ends.
""" + "\n\n".join(
    f"Annex {i}. Clause {i} describes routine obligations of the parties regarding reporting, "
    f"record keeping, insurance, audit rights and notices for schedule item {i}, none of which "
    f"change the fees, the notice period or the support hours stated above."
    for i in range(1, 80)
)


async def _auth(client: AsyncClient) -> dict[str, str]:
    payload = {"name": "RAG Tester", "email": f"{uuid.uuid4().hex[:10]}@example.com", "password": "Str0ngPassw0rd"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


async def _upload(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("contract.pdf", PDF, "application/pdf")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _index(client: AsyncClient, headers: dict[str, str], doc_id: str, text: str = CONTRACT) -> dict[str, Any]:
    response = await client.post(f"/api/v1/documents/{doc_id}/index", json={"text": text}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def use_provider() -> Iterator[Any]:
    yield set_ai_provider
    set_ai_provider(None)


# --- chunking ---------------------------------------------------------------------------------


def test_clean_text_repairs_ocr_and_pdf_artefacts() -> None:
    raw = "Pay-\nments are\ndue in 30 days.\r\n\r\n\r\n\r\nNext   paragraph\there.\x0c"
    assert clean_text(raw) == "Payments are due in 30 days.\n\nNext paragraph here."


def test_chunks_respect_size_overlap_and_offsets() -> None:
    text = clean_text(CONTRACT)
    chunks = chunk_text(text, max_tokens=120, overlap_tokens=20)

    assert len(chunks) > 3
    assert [c.index for c in chunks] == list(range(len(chunks)))
    assert all(c.token_count <= 140 for c in chunks)  # small slack for sentence alignment
    assert all(text[c.start : c.end].strip() == c.text for c in chunks)
    assert all(chunks[i + 1].start < chunks[i].end for i in range(len(chunks) - 1))  # overlap
    # Never cut mid-sentence: every chunk ends at sentence punctuation.
    assert all(c.text.rstrip()[-1] in ".!?" for c in chunks)


def test_chunking_edge_cases() -> None:
    assert chunk_text("") == []
    single = chunk_text("Just one short sentence.")
    assert len(single) == 1 and single[0].text == "Just one short sentence."
    huge = chunk_text("word " * 3000, max_tokens=100)
    assert len(huge) > 5 and all(c.token_count <= 110 for c in huge)


# --- indexing ------------------------------------------------------------------------------------


async def test_index_stores_chunks_with_embeddings_in_pgvector(client: AsyncClient) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)

    result = await _index(client, headers, doc_id)

    assert result["chunkCount"] > 5
    assert result["embeddingModel"] == "mock-embeddings"
    assert result["characters"] == len(clean_text(CONTRACT))

    async with get_session_factory()() as session:
        rows = (
            await session.execute(
                select(DocumentChunk).where(DocumentChunk.document_id == uuid.UUID(doc_id)).order_by(DocumentChunk.chunk_index)
            )
        ).scalars().all()
        dims = await session.scalar(select(func.vector_dims(DocumentChunk.embedding)).limit(1))
    assert len(rows) == result["chunkCount"]
    assert dims == EMBEDDING_DIMENSIONS
    assert rows[0].text.startswith("SERVICE AGREEMENT")

    detail = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert detail.json()["text"].startswith("SERVICE AGREEMENT")


async def test_reindex_replaces_chunks_and_unchanged_text_is_a_noop(client: AsyncClient) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)
    first = await _index(client, headers, doc_id)
    again = await _index(client, headers, doc_id)  # same text: no re-embedding
    assert again["chunkCount"] == first["chunkCount"]

    shorter = await _index(client, headers, doc_id, text="Only one sentence remains in this version.")
    assert shorter["chunkCount"] == 1
    async with get_session_factory()() as session:
        count = await session.scalar(
            select(func.count()).select_from(DocumentChunk).where(DocumentChunk.document_id == uuid.UUID(doc_id))
        )
    assert count == 1


async def test_index_rejects_documents_without_text(client: AsyncClient) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)  # minimal PDF: no text layer
    response = await client.post(f"/api/v1/documents/{doc_id}/index", headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "DOCUMENT_NOT_INDEXABLE"


# --- asking ------------------------------------------------------------------------------------------


async def test_document_chat_answers_from_retrieved_chunks_with_sources(client: AsyncClient) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)
    await _index(client, headers, doc_id)

    response = await client.post(
        "/api/v1/ai/document-chat",
        json={"documentId": doc_id, "question": "How many days of written notice are needed to terminate?"},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert "60 days" in body["answer"]
    assert body["grounded"] is True
    assert 1 <= len(body["sources"]) <= 5
    cited = [s for s in body["sources"] if s["cited"]]
    assert cited and "60 days" in cited[0]["text"]
    assert all(0 <= s["similarity"] <= 1 for s in body["sources"])
    assert body["sources"][0]["similarity"] >= body["sources"][-1]["similarity"]
    assert set(body["sources"][0]) == {"chunkId", "chunkIndex", "text", "startOffset", "endOffset", "similarity", "cited"}
    assert body["provider"] == "mock" and body["retrievalMs"] >= 0 and body["generationMs"] >= 0


async def test_document_chat_auto_indexes_on_first_question(client: AsyncClient) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)
    # Give the document text without indexing (simulates stored extracted text).
    async with get_session_factory()() as session:
        from app.models.document import Document

        doc = await session.get(Document, uuid.UUID(doc_id))
        assert doc is not None
        doc.extracted_text = CONTRACT
        await session.commit()

    response = await client.post(
        "/api/v1/ai/document-chat",
        json={"documentId": doc_id, "question": "What will the Client pay per month?"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert "1,250.00" in response.json()["answer"]
    detail = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert detail.status_code == 200


async def test_document_chat_reports_not_found_for_unrelated_questions(client: AsyncClient) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)
    await _index(client, headers, doc_id)

    response = await client.post(
        "/api/v1/ai/document-chat",
        json={"documentId": doc_id, "question": "Who won the 1998 football world cup?"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "I couldn't find that in the document."
    assert body["grounded"] is False
    assert not any(s["cited"] for s in body["sources"])


async def test_document_chat_is_scoped_to_the_owner(client: AsyncClient) -> None:
    owner = await _auth(client)
    other = await _auth(client)
    doc_id = await _upload(client, owner)
    await _index(client, owner, doc_id)

    response = await client.post(
        "/api/v1/ai/document-chat", json={"documentId": doc_id, "question": "fee?"}, headers=other
    )
    assert response.status_code == 404

    assert (await client.post("/api/v1/ai/document-chat", json={"documentId": doc_id, "question": "x"})).status_code == 401


# --- hugging face: only retrieved chunks reach the model ------------------------------------------


async def test_hf_document_chat_sends_only_top_chunks(client: AsyncClient, use_provider: Any) -> None:
    prompts: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/chat/completions"):
            payload = json.loads(request.content)
            prompts.append(payload)
            return httpx.Response(
                200,
                json={
                    "model": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
                    "choices": [{"message": {"content": "Sixty days of written notice are required [1]."}}],
                    "usage": {"prompt_tokens": 300, "completion_tokens": 12},
                },
            )
        # Embeddings: deterministic pseudo-vectors so retrieval is repeatable.
        inputs = json.loads(request.content)["inputs"]
        vectors = []
        for text in inputs:
            base = [0.0] * EMBEDDING_DIMENSIONS
            for token in text.lower().split():
                base[hash(token) % EMBEDDING_DIMENSIONS] += 1.0
            norm = sum(v * v for v in base) ** 0.5 or 1.0
            vectors.append([v / norm for v in base])
        return httpx.Response(200, json=vectors)

    provider = HuggingFaceProvider("hf_x", transport=httpx.MockTransport(handler))
    use_provider(provider)
    headers = await _auth(client)
    try:
        doc_id = await _upload(client, headers)
        indexed = await _index(client, headers, doc_id)
        response = await client.post(
            "/api/v1/ai/document-chat",
            json={"documentId": doc_id, "question": "How much written notice is needed to terminate the agreement?"},
            headers=headers,
        )
    finally:
        await provider.close()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answer"].startswith("Sixty days")
    assert body["sources"][0]["cited"] is True
    assert body["modelName"] == "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"

    # The prompt carried at most top_k passages, not the whole document.
    user_prompt = prompts[-1]["messages"][-1]["content"]
    assert user_prompt.count("\n[") <= 5
    assert len(user_prompt) < len(CONTRACT) * 0.4
    assert indexed["chunkCount"] > 5
    assert "ONLY the passages" in prompts[-1]["messages"][0]["content"]
