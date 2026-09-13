"""
The in-app assistant: multimodal, conversation-aware, and scoped to the
user's own material.

    turn:  new attachments -> resolve (index documents, caption images)
           conversation context = attachments from every earlier turn + these
           question -> retrieve passages across attached documents (pgvector)
                    -> cards for images / OCR text / analyses
                    -> LLM answers from that material only -> answer + sources
           user + assistant messages persisted in ai_conversations/ai_messages

Without any material the model is not called at all: the assistant explains
what it can do inside the app instead. That is what keeps it from being a
general chat bot.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai import (
    AIError,
    AITimeoutError,
    ChatMessage,
    ChatRequest,
    ChatService,
    EmbeddingRequest,
    EmbeddingService,
    ImageInput,
    VisionRequest,
    VisionService,
)
from app.ai.assistant import (
    NOT_FOUND,
    SYSTEM_PROMPT,
    MaterialCard,
    build_messages,
    context_metadata,
    render_analysis,
)
from app.ai.rag.prompt import cited_indexes
from app.ai.rag.store import RetrievedChunk, VectorStore
from app.core.exceptions import AppError, NotFoundError
from app.models.ai import AIConversation, AIMessage
from app.models.document import Document
from app.models.enums import ChatRole, DocumentKind
from app.models.user import User
from app.schemas.ai import AssistantAttachmentIn, AssistantChatRequestIn
from app.services.document_service import DocumentService
from app.services.rag_service import DocumentNotIndexableError, RAGService
from app.utils.time import utcnow

logger = logging.getLogger(__name__)

MAX_CONTEXT_ITEMS = 8
_CITATION = re.compile(r"\s*\[\d+\]")
HISTORY_TURNS = 6
OCR_CARD_MAX = 8_000
DEFAULT_QUESTION = "Describe what I attached and point out anything important."

NO_MATERIAL_ANSWER = (
    "I can help with your own material inside the app: documents you upload, images, "
    "text recognised by OCR, and results from Image Quality, Sentiment, Summaries and "
    "field extraction. Attach something with the + button, take a photo, or open a "
    "result screen and choose \"Ask the assistant\"."
)


class ConversationNotFoundError(NotFoundError):
    code = "CONVERSATION_NOT_FOUND"
    message = "Conversation not found."


@dataclass(frozen=True)
class AssistantSource:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_name: str | None
    chunk_index: int
    text: str
    start_offset: int
    end_offset: int
    similarity: float
    cited: bool


@dataclass(frozen=True)
class AssistantAnswer:
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    answer: str
    sources: tuple[AssistantSource, ...]
    grounded: bool
    scope: str
    suggestions: tuple[str, ...]
    context: tuple[dict[str, Any], ...]
    model: str
    provider: str
    retrieval_ms: int
    generation_ms: int
    processing_ms: int
    created_at: Any = field(default_factory=utcnow)


class AssistantService:
    def __init__(
        self,
        session: AsyncSession,
        documents: DocumentService,
        rag: RAGService,
        chat: ChatService,
        embeddings: EmbeddingService,
        vision: VisionService | None,
        *,
        timeout_seconds: float,
        top_k: int = 5,
        min_similarity: float = 0.15,
    ) -> None:
        self.session = session
        self.documents = documents
        self.rag = rag
        self.chat = chat
        self.embeddings = embeddings
        self.vision = vision
        self.store = VectorStore(session)
        self.timeout_seconds = timeout_seconds
        self.top_k = top_k
        self.min_similarity = min_similarity

    # --- conversations -------------------------------------------------------------------

    async def get_conversation(self, user: User, conversation_id: uuid.UUID) -> AIConversation:
        stmt = (
            select(AIConversation)
            .options(selectinload(AIConversation.messages))
            .where(AIConversation.id == conversation_id, AIConversation.user_id == user.id)
        )
        conversation = await self.session.scalar(stmt)
        if conversation is None:
            raise ConversationNotFoundError()
        return conversation

    async def list_conversations(self, user: User, *, limit: int = 20) -> Sequence[AIConversation]:
        stmt = (
            select(AIConversation)
            .where(AIConversation.user_id == user.id, AIConversation.archived_at.is_(None))
            .order_by(AIConversation.last_message_at.desc().nullslast(), AIConversation.created_at.desc())
            .limit(limit)
        )
        return (await self.session.scalars(stmt)).all()

    async def delete_conversation(self, user: User, conversation_id: uuid.UUID) -> None:
        conversation = await self.get_conversation(user, conversation_id)
        await self.session.delete(conversation)
        await self.session.flush()

    @staticmethod
    def context_of(conversation: AIConversation) -> list[dict[str, Any]]:
        """Material accumulated over the conversation: newest first, de-duplicated."""
        items: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for message in reversed(conversation.messages):
            if message.role != ChatRole.USER or not message.metadata_:
                continue
            for item in reversed(message.metadata_.get("attachments") or []):
                key = (item.get("type", ""), str(item.get("documentId") or item.get("title") or ""))
                if key in seen:
                    continue
                seen.add(key)
                items.append(item)
        return items[:MAX_CONTEXT_ITEMS]

    # --- one turn -----------------------------------------------------------------------------

    async def chat_turn(self, user: User, request: AssistantChatRequestIn) -> AssistantAnswer:
        started = time.perf_counter()
        conversation = await self._conversation_for(user, request)
        history = self._history(conversation)

        new_items = [await self._resolve(user, a) for a in request.attachments]
        question = request.message or DEFAULT_QUESTION

        user_message = AIMessage(
            conversation_id=conversation.id,
            role=ChatRole.USER,
            content=question,
            metadata_={"attachments": new_items, "inputMode": request.input_mode},
            # Explicit: PostgreSQL's now() is frozen per transaction, and the
            # reply is inserted in the same one; message order must survive.
            created_at=utcnow(),
        )
        conversation.messages.append(user_message)
        context = self.context_of(conversation)

        if not context:
            # Nothing to talk about: guide the user instead of calling the model.
            answer_text = NO_MATERIAL_ANSWER
            reply = self._persist_reply(
                conversation, answer_text, sources=(), grounded=False, scope="no_material",
                model="none", provider="app",
            )
            await self.session.flush()
            return AssistantAnswer(
                conversation_id=conversation.id, message_id=reply.id, answer=answer_text,
                sources=(), grounded=False, scope="no_material",
                suggestions=self._suggestions(context), context=tuple(context),
                model="none", provider="app", retrieval_ms=0, generation_ms=0,
                processing_ms=int((time.perf_counter() - started) * 1000),
            )

        # Retrieval across every indexed document in the conversation.
        retrieval_started = time.perf_counter()
        doc_ids = [
            uuid.UUID(item["documentId"])
            for item in context
            if item["type"] in ("document", "image") and item.get("indexed")
        ]
        passages: list[RetrievedChunk] = []
        provider = model_name = ""
        if doc_ids:
            query = await self._with_timeout(
                self.embeddings.embed(EmbeddingRequest(texts=(question,), purpose="query"))
            )
            provider, model_name = query.model.provider, query.model.model
            passages = await self.store.search_documents(
                user_id=user.id, document_ids=doc_ids, query_embedding=query.vectors[0],
                top_k=self.top_k, min_similarity=self.min_similarity,
            )
        retrieval_ms = int((time.perf_counter() - retrieval_started) * 1000)
        names = await self._document_names({c.document_id for c in passages} | set(doc_ids))
        cards = self._cards(context)

        # Generation: only the retrieved passages and cards reach the model.
        generation_started = time.perf_counter()
        response = await self._with_timeout(
            self.chat.complete(
                ChatRequest(
                    messages=build_messages(question, passages, cards, history, names),
                    system=SYSTEM_PROMPT,
                    max_tokens=500,
                    temperature=0.2,
                    metadata=context_metadata(passages, cards),
                )
            )
        )
        generation_ms = int((time.perf_counter() - generation_started) * 1000)
        answer_text = response.message.content.strip()
        if not passages:
            # Nothing to cite: drop stray "[n]" markers the model may still add.
            answer_text = _CITATION.sub("", answer_text).strip()
        grounded = not answer_text.strip('"').startswith(NOT_FOUND)
        cited = set(cited_indexes(answer_text, len(passages)))
        sources = tuple(
            AssistantSource(
                chunk_id=c.id, document_id=c.document_id, document_name=names.get(c.document_id),
                chunk_index=c.chunk_index, text=c.text, start_offset=c.start_offset,
                end_offset=c.end_offset, similarity=c.similarity, cited=i in cited,
            )
            for i, c in enumerate(passages)
        )

        reply = self._persist_reply(
            conversation, answer_text, sources=sources, grounded=grounded, scope="material",
            model=response.model.model, provider=response.model.provider,
        )
        conversation.model = response.model.model
        await self.session.flush()
        return AssistantAnswer(
            conversation_id=conversation.id, message_id=reply.id, answer=answer_text,
            sources=sources, grounded=grounded, scope="material",
            suggestions=self._suggestions(context), context=tuple(context),
            model=response.model.model, provider=response.model.provider,
            retrieval_ms=retrieval_ms, generation_ms=generation_ms,
            processing_ms=int((time.perf_counter() - started) * 1000),
        )

    # --- helpers ------------------------------------------------------------------------------

    async def _conversation_for(self, user: User, request: AssistantChatRequestIn) -> AIConversation:
        if request.conversation_id is not None:
            return await self.get_conversation(user, request.conversation_id)
        title = (request.message or next(
            (a.title for a in request.attachments if a.title), "New conversation"
        ))[:200]
        conversation = AIConversation(user_id=user.id, title=title, messages=[])
        self.session.add(conversation)
        await self.session.flush()
        return conversation

    @staticmethod
    def _history(conversation: AIConversation) -> tuple[ChatMessage, ...]:
        turns = [
            ChatMessage(role=m.role.value, content=m.content)  # type: ignore[arg-type]
            for m in conversation.messages
            if m.role in (ChatRole.USER, ChatRole.ASSISTANT)
        ]
        return tuple(turns[-HISTORY_TURNS:])

    def _persist_reply(
        self,
        conversation: AIConversation,
        content: str,
        *,
        sources: Sequence[AssistantSource],
        grounded: bool,
        scope: str,
        model: str,
        provider: str,
    ) -> AIMessage:
        reply = AIMessage(
            conversation_id=conversation.id,
            role=ChatRole.ASSISTANT,
            content=content,
            model=model,
            created_at=utcnow(),
            metadata_={
                "provider": provider,
                "grounded": grounded,
                "scope": scope,
                "sources": [
                    {
                        "chunkId": str(s.chunk_id),
                        "documentId": str(s.document_id),
                        "documentName": s.document_name,
                        "chunkIndex": s.chunk_index,
                        "text": s.text,
                        "startOffset": s.start_offset,
                        "endOffset": s.end_offset,
                        "similarity": s.similarity,
                        "cited": s.cited,
                    }
                    for s in sources
                ],
            },
        )
        conversation.messages.append(reply)
        conversation.last_message_at = utcnow()
        return reply

    async def _resolve(self, user: User, attachment: AssistantAttachmentIn) -> dict[str, Any]:
        """Turns an incoming attachment into a JSON context item, doing any indexing."""
        if attachment.type == "ocr":
            text = (attachment.text or "").strip()
            return {
                "type": "ocr",
                "title": attachment.title or "Recognised text",
                "text": text[:OCR_CARD_MAX],
            }
        if attachment.type == "analysis":
            return {
                "type": "analysis",
                "kind": attachment.kind,
                "title": attachment.title or _analysis_title(attachment.kind or "other"),
                "data": attachment.data or {},
            }

        assert attachment.document_id is not None
        document = await self.documents.get(user, attachment.document_id)
        item: dict[str, Any] = {
            "type": "image" if document.kind == DocumentKind.IMAGE else "document",
            "documentId": str(document.id),
            "title": document.name,
            "indexed": False,
        }
        # Passages: PDFs use their text layer; images use OCR text the device sent.
        text = (attachment.text or "").strip() or None
        try:
            result = await self.rag.index_document(user, document.id, text=text)
            item["indexed"] = result.chunk_count > 0
        except DocumentNotIndexableError:
            item["note"] = (
                "No text found in this image; run Smart OCR on it to ask about its text."
                if item["type"] == "image"
                else "This PDF has no text layer, so its content cannot be searched."
            )
        # Images additionally get a caption so questions about the picture itself work.
        if item["type"] == "image":
            fresh = not (document.analysis or {}).get("caption")
            caption = await self._caption(user, document)
            if caption:
                item["caption"] = caption
                # Only the turn that produced the caption counts as an image analysis.
                item["captioned"] = fresh
        return item

    async def _caption(self, user: User, document: Document) -> str | None:
        cached = (document.analysis or {}).get("caption")
        if cached:
            return str(cached)
        if self.vision is None:
            return None
        try:
            _, stream = await self.documents.open_content(user, document.id)
            data = b"".join([chunk async for chunk in stream])
            response = await self._with_timeout(
                self.vision.describe(
                    VisionRequest(ImageInput(data=data, mime_type=document.mime_type))
                )
            )
        except AppError as exc:
            # A missing caption should not block the answer; the OCR text still works.
            logger.warning("Image caption unavailable for %s: %s", document.id, exc)
            return None
        caption = response.description.strip()
        if caption:
            document.analysis = {
                **(document.analysis or {}),
                "caption": caption,
                "captionModel": response.model.model,
            }
        return caption or None

    async def _document_names(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        rows = await self.session.execute(
            select(Document.id, Document.name).where(Document.id.in_(list(ids)))
        )
        return {row.id: row.name for row in rows}

    @staticmethod
    def _cards(context: Sequence[dict[str, Any]]) -> list[MaterialCard]:
        cards: list[MaterialCard] = []
        for item in context:
            kind = item["type"]
            if kind == "ocr":
                cards.append(MaterialCard("ocr", item["title"], item.get("text", "")))
            elif kind == "analysis":
                body = render_analysis(item.get("kind") or "other", item.get("data") or {})
                cards.append(MaterialCard("analysis", item["title"], body))
            elif kind == "image":
                lines = []
                if item.get("caption"):
                    lines.append(f"What the picture shows: {item['caption']}")
                lines.append(
                    "Text in the image: see the numbered passages."
                    if item.get("indexed")
                    else (item.get("note") or "No text was recognised in this image.")
                )
                cards.append(MaterialCard("image", item["title"], "\n".join(lines)))
            elif kind == "document" and not item.get("indexed"):
                cards.append(MaterialCard("document", item["title"], item.get("note") or ""))
        return cards

    @staticmethod
    def _suggestions(context: Sequence[dict[str, Any]]) -> tuple[str, ...]:
        kinds = {item["type"] for item in context}
        out: list[str] = []
        if "document" in kinds:
            out += ["Summarise this document", "What are the key dates and amounts?"]
        if "image" in kinds:
            out += ["What text is in the image?", "What does the picture show?"]
        if "ocr" in kinds:
            out += ["Summarise this text", "Which fields can you extract?"]
        if "analysis" in kinds:
            out += ["Explain this result in plain words", "How can I improve it?"]
        return tuple(dict.fromkeys(out))[:4]

    async def _with_timeout(self, coro):  # type: ignore[no-untyped-def]
        try:
            return await asyncio.wait_for(coro, timeout=self.timeout_seconds)
        except asyncio.TimeoutError as exc:
            raise AITimeoutError() from exc
        except AIError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("Assistant provider call failed")
            raise AIError() from exc


def _analysis_title(kind: str) -> str:
    return {
        "image_quality": "Image quality report",
        "sentiment": "Sentiment result",
        "extraction": "Extracted fields",
        "summary": "Summary",
    }.get(kind, "Analysis result")


__all__ = ["AssistantAnswer", "AssistantService", "AssistantSource", "ConversationNotFoundError"]
