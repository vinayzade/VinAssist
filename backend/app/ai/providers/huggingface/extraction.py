"""
Classification and structured extraction with the Hugging Face chat model.

Two calls: a tiny classification prompt, then a type-specific extraction
prompt that asks for JSON only. Whatever comes back is handed to
`app.ai.extraction.validation` by the application layer; this module only
gets it into a dict.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.ai.base import AIError, AIInvalidInputError, ModelInfo, Usage
from app.ai.extraction.base import (
    ClassificationRequest,
    ClassificationResponse,
    ExtractionRequest,
    ExtractionResponse,
    ExtractionService,
)
from app.ai.extraction.schemas import SCHEMA_FOR, DocumentType
from app.ai.extraction.validation import ExtractionValidationError, parse_model_json
from app.ai.providers.huggingface.client import HuggingFaceClient

logger = logging.getLogger(__name__)

PROVIDER = "huggingface"

_CLASSIFY_SYSTEM = (
    "You classify documents from OCR text. Reply with JSON only, no prose: "
    '{"documentType": "<TYPE>", "confidence": <0-1>} where TYPE is one of '
    "BUSINESS_CARD, RESUME, INVOICE, RECEIPT, GENERIC. "
    "BUSINESS_CARD: a person's name with company/role/contact details, very short. "
    "RESUME: career history, skills, education. INVOICE: a bill requesting payment "
    "with invoice number/due date. RECEIPT: proof of a completed purchase with items "
    "and totals. GENERIC: anything else."
)

_EXTRACT_SYSTEM = (
    "You extract structured fields from OCR text, which may contain recognition "
    "errors. Reply with a single JSON object only, no prose, no code fences. Use "
    "exactly the keys given. Use null for anything not present in the text. Never "
    "invent values; copy them from the text. Amounts are plain numbers."
)

_FIELD_HINTS: dict[DocumentType, str] = {
    DocumentType.BUSINESS_CARD: "designation is the job title; website without http.",
    DocumentType.RESUME: "skills is a list of short strings; experience entries have company, title, start, end; education entries have institution, degree, year.",
    DocumentType.INVOICE: "vendor is the party ISSUING the invoice; customer is the party billed ('Bill to'). date and due_date must be calendar dates, never amounts. total is the amount due. line_items entries have description, quantity, unit_price, amount; currency as ISO code like USD or INR.",
    DocumentType.RECEIPT: "items entries have description, quantity, unit_price, amount; payment_method e.g. cash, visa, upi.",
    DocumentType.GENERIC: "key_values is a list of {key, value} for any 'Label: value' pairs; dates, amounts, emails, phones are lists of strings copied verbatim.",
}


def _skeleton(document_type: DocumentType) -> str:
    """A JSON template of the target schema with nulls/empty lists."""
    schema = SCHEMA_FOR[document_type]
    template: dict[str, Any] = {}
    for name, field in schema.model_fields.items():
        annotation = str(field.annotation)
        template[name] = [] if annotation.startswith("list") else None
    return json.dumps(template)


class HFExtractionService(ExtractionService):
    def __init__(self, client: HuggingFaceClient, model: str) -> None:
        self.client = client
        self.model = model

    async def classify(self, request: ClassificationRequest) -> ClassificationResponse:
        if not request.text.strip():
            raise AIInvalidInputError("The text is empty.")
        body, usage = await self._chat(_CLASSIFY_SYSTEM, request.text[:4000], max_tokens=60)
        try:
            payload = parse_model_json(body)
        except ExtractionValidationError:
            logger.warning("Classification reply was not JSON: %r", body[:120])
            return ClassificationResponse(
                document_type=DocumentType.GENERIC, confidence=0.3, model=self._info(), usage=usage
            )
        raw_type = str(payload.get("documentType") or payload.get("document_type") or "").upper()
        try:
            document_type = DocumentType(raw_type)
        except ValueError:
            document_type = DocumentType.GENERIC
        try:
            confidence = float(payload.get("confidence", 0.6))
        except (TypeError, ValueError):
            confidence = 0.6
        return ClassificationResponse(
            document_type=document_type,
            confidence=max(0.0, min(1.0, confidence)),
            model=self._info(),
            usage=usage,
        )

    async def extract(self, request: ExtractionRequest) -> ExtractionResponse:
        if not request.text.strip():
            raise AIInvalidInputError("The text is empty.")
        system = (
            f"{_EXTRACT_SYSTEM} Document type: {request.document_type.value}. "
            f"{_FIELD_HINTS[request.document_type]} Return this shape: {_skeleton(request.document_type)}"
        )
        body, usage = await self._chat(system, request.text[:12000], max_tokens=700)
        try:
            data = parse_model_json(body)
        except ExtractionValidationError as exc:
            raise AIError("The model did not return structured data.") from exc
        return ExtractionResponse(
            document_type=request.document_type, data=data, model=self._info(), usage=usage
        )

    async def _chat(self, system: str, text: str, *, max_tokens: int) -> tuple[str, Usage]:
        body = await self.client.chat_completions(
            {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Text:\n{text}"},
                ],
                "max_tokens": max_tokens,
                "temperature": 0.0,
                "stream": False,
            }
        )
        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("Unexpected extraction response from the provider.") from exc
        usage = body.get("usage") or {}
        return content, Usage(
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
        )

    def _info(self) -> ModelInfo:
        return ModelInfo(provider=PROVIDER, model=self.model)
