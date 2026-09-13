"""The in-app assistant: multimodal turns, conversation memory, scoped answers."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from app.ai.assistant import NOT_FOUND, MaterialCard, build_messages, render_analysis
from tests.test_rag import CONTRACT, PDF, _auth, _index, _upload

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
OCR_TEXT = "INVOICE 2026-001\nBill to: Vinay Zade\nTotal due: 1,250.00\nDue date: 30 September 2026"


async def _upload_image(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("receipt.png", PNG, "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _chat(client: AsyncClient, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    response = await client.post("/api/v1/ai/chat", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# --- prompt helpers -------------------------------------------------------------------------


def test_render_image_quality_analysis_is_readable() -> None:
    text = render_analysis(
        "image_quality",
        {"overallScore": 42, "blurScore": 30, "warnings": [{"code": "blur", "message": "The image is blurry"}]},
    )
    assert "Overall score: 42/100" in text
    assert "Blur score: 30/100" in text
    assert "Warnings: The image is blurry" in text


def test_render_extraction_skips_empty_fields() -> None:
    text = render_analysis(
        "extraction",
        {"documentType": "INVOICE", "confidence": 0.95, "data": {"total": 1250, "vendor": None, "lineItems": []}},
    )
    assert "Document type: INVOICE" in text
    assert "Total: 1250" in text
    assert "Vendor" not in text


def test_build_messages_numbers_passages_and_keeps_recent_history() -> None:
    from app.ai import ChatMessage
    from app.ai.rag.store import RetrievedChunk

    doc = uuid.uuid4()
    chunk = RetrievedChunk(uuid.uuid4(), doc, 0, "Fees are 1,250 per month.", 0, 10, 0.9)
    history = tuple(ChatMessage(role="user", content=f"q{i}") for i in range(10))
    messages = build_messages(
        "How much?", [chunk], [MaterialCard("ocr", "Scan", "Total due 1,250")], history, {doc: "contract.pdf"}
    )
    assert len(messages) == 7  # six history turns + the question
    prompt = messages[-1].content
    assert '[1] (from "contract.pdf") Fees are 1,250 per month.' in prompt
    assert "### Scan (ocr)" in prompt
    assert prompt.endswith("Question: How much?")


# --- behaviour ------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_without_material_the_assistant_explains_itself_and_skips_the_model(client: AsyncClient) -> None:
    headers = await _auth(client)
    body = await _chat(client, headers, {"message": "Write me a poem about the sea"})

    assert body["scope"] == "no_material"
    assert body["provider"] == "app"  # no model call
    assert body["grounded"] is False
    assert "Attach" in body["answer"]
    assert body["conversationId"]
    assert body["context"] == []


@pytest.mark.asyncio
async def test_validation_requires_a_message_or_an_attachment(client: AsyncClient) -> None:
    headers = await _auth(client)
    response = await client.post("/api/v1/ai/chat", json={"message": "   "}, headers=headers)
    assert response.status_code == 422
    response = await client.post(
        "/api/v1/ai/chat", json={"message": "hi", "attachments": [{"type": "document"}]}, headers=headers
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_document_attachment_answers_with_cited_sources_and_remembers_context(
    client: AsyncClient,
) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)
    await _index(client, headers, doc_id)

    first = await _chat(
        client,
        headers,
        {"message": "How many days of written notice are needed to terminate?", "attachments": [{"type": "document", "documentId": doc_id}]},
    )
    assert first["scope"] == "material"
    assert first["grounded"] is True
    assert "60 days" in first["answer"]
    assert first["context"] == [
        {"type": "document", "documentId": doc_id, "title": "contract.pdf", "kind": None, "indexed": True, "note": None}
    ]
    cited = [s for s in first["sources"] if s["cited"]]
    assert cited and cited[0]["documentName"] == "contract.pdf"
    assert "60 days" in cited[0]["text"]
    assert first["suggestions"]

    # Follow-up without re-attaching: the document is still in context.
    second = await _chat(
        client, headers, {"conversationId": first["conversationId"], "message": "And what will the Client pay per month?"}
    )
    assert second["conversationId"] == first["conversationId"]
    assert "1,250" in second["answer"]
    assert second["context"][0]["documentId"] == doc_id

    # The conversation is persisted with both turns and the accumulated context.
    response = await client.get(f"/api/v1/ai/conversations/{first['conversationId']}", headers=headers)
    assert response.status_code == 200, response.text
    conversation = response.json()
    roles = [m["role"] for m in conversation["messages"]]
    assert roles == ["user", "assistant", "user", "assistant"]
    assert conversation["messages"][0]["attachments"][0]["documentId"] == doc_id
    assert conversation["messages"][1]["sources"]
    assert conversation["context"][0]["documentId"] == doc_id
    assert conversation["title"].startswith("How many days")

    listed = await client.get("/api/v1/ai/conversations", headers=headers)
    assert [c["id"] for c in listed.json()] == [first["conversationId"]]


@pytest.mark.asyncio
async def test_off_topic_question_with_material_is_not_grounded(client: AsyncClient) -> None:
    headers = await _auth(client)
    doc_id = await _upload(client, headers)
    await _index(client, headers, doc_id)
    body = await _chat(
        client,
        headers,
        {"message": "Who won the football world cup?", "attachments": [{"type": "document", "documentId": doc_id}]},
    )
    assert body["grounded"] is False
    assert body["answer"].startswith(NOT_FOUND)


@pytest.mark.asyncio
async def test_image_attachment_gets_a_caption_and_its_ocr_text_is_searchable(client: AsyncClient) -> None:
    headers = await _auth(client)
    image_id = await _upload_image(client, headers)

    body = await _chat(
        client,
        headers,
        {
            "message": "What does the picture show?",
            "attachments": [{"type": "image", "documentId": image_id, "text": OCR_TEXT}],
        },
    )
    assert body["context"][0]["type"] == "image"
    assert body["context"][0]["indexed"] is True
    assert "[mock] A PNG image" in body["answer"]  # caption from the vision service

    follow_up = await _chat(
        client, headers, {"conversationId": body["conversationId"], "message": "What is the total due?"}
    )
    assert "1,250.00" in follow_up["answer"]
    assert any(s["cited"] and s["documentId"] == image_id for s in follow_up["sources"])

    # The caption is cached on the document so later turns do not re-run vision.
    detail = await client.get(f"/api/v1/documents/{image_id}", headers=headers)
    assert detail.json()["analysis"]["caption"].startswith("[mock] A PNG image")


@pytest.mark.asyncio
async def test_image_without_text_still_answers_from_its_caption(client: AsyncClient) -> None:
    headers = await _auth(client)
    image_id = await _upload_image(client, headers)
    body = await _chat(
        client,
        headers,
        {"attachments": [{"type": "image", "documentId": image_id}]},  # no message: default question
    )
    assert body["context"][0]["indexed"] is False
    assert "run Smart OCR" in body["context"][0]["note"]
    assert body["scope"] == "material"


@pytest.mark.asyncio
async def test_ocr_text_and_analysis_results_are_answerable(client: AsyncClient) -> None:
    headers = await _auth(client)
    body = await _chat(
        client,
        headers,
        {
            "message": "What is the due date on this invoice?",
            "attachments": [{"type": "ocr", "title": "Scanned invoice", "text": OCR_TEXT}],
            "inputMode": "voice",
        },
    )
    assert "30 September 2026" in body["answer"]
    assert body["sources"] == []  # inline text is a card, not a retrieved passage

    quality = await _chat(
        client,
        headers,
        {
            "conversationId": body["conversationId"],
            "message": "Why is the overall score low?",
            "attachments": [
                {
                    "type": "analysis",
                    "kind": "image_quality",
                    "data": {"overallScore": 42, "warnings": [{"code": "blur", "message": "The image is blurry"}]},
                }
            ],
        },
    )
    assert "42/100" in quality["answer"]
    kinds = [(c["type"], c["title"]) for c in quality["context"]]
    assert kinds == [("analysis", "Image quality report"), ("ocr", "Scanned invoice")]


@pytest.mark.asyncio
async def test_other_users_documents_and_conversations_are_invisible(client: AsyncClient) -> None:
    owner = await _auth(client)
    doc_id = await _upload(client, owner)
    mine = await _chat(client, owner, {"message": "hello"})

    intruder = await _auth(client)
    response = await client.post(
        "/api/v1/ai/chat",
        json={"message": "Summarise", "attachments": [{"type": "document", "documentId": doc_id}]},
        headers=intruder,
    )
    assert response.status_code == 404
    response = await client.post(
        "/api/v1/ai/chat", json={"conversationId": mine["conversationId"], "message": "hi"}, headers=intruder
    )
    assert response.status_code == 404
    assert response.json()["code"] == "CONVERSATION_NOT_FOUND"
    response = await client.get(f"/api/v1/ai/conversations/{mine['conversationId']}", headers=intruder)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_conversation(client: AsyncClient) -> None:
    headers = await _auth(client)
    body = await _chat(client, headers, {"message": "hello"})
    response = await client.delete(f"/api/v1/ai/conversations/{body['conversationId']}", headers=headers)
    assert response.status_code == 204
    response = await client.get(f"/api/v1/ai/conversations/{body['conversationId']}", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_is_rejected(client: AsyncClient) -> None:
    response = await client.post("/api/v1/ai/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_contract_fixture_is_long_enough_to_chunk() -> None:
    assert len(CONTRACT) > 2000 and PDF.startswith(b"%PDF")
