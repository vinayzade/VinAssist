"""Document classification, structured extraction, and validation of model JSON."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from httpx import AsyncClient

from app.ai import (
    AICapability,
    AIProvider,
    ClassificationRequest,
    ClassificationResponse,
    DocumentType,
    ExtractionRequest,
    ExtractionResponse,
    ExtractionService,
    ModelInfo,
    set_ai_provider,
    validate_extraction,
)
from app.ai.extraction.validation import ExtractionValidationError, parse_model_json
from app.ai.providers.huggingface import HuggingFaceProvider
from app.ai.providers.mock.extraction import classify_text

CARD = "Vinay Zade\nSenior Software Engineer\nAcme Technologies Pvt Ltd\nvinay@acme.com\n+91 98765 43210\nwww.acme.com"
INVOICE = "INVOICE 2026-001\nBill to: Vinay Zade\nSubtotal: 1,000.00\nTax: 250.00\nTotal due: 1,250.00\nDue date: 18 Sep 2026"
RECEIPT = "FRESH MART\n12/09/2026 14:32\nMilk 2.50\nBread 3.00\nSubtotal 5.50\nTax 0.50\nTotal 6.00\nVISA ****1234\nThank you for shopping"
RESUME = (
    "Vinay Zade\nSummary: Software engineer with 6 years of experience building mobile and backend systems.\n"
    "Skills: Python, TypeScript, React Native\nExperience\n2020 - Present Senior Engineer at Acme\n"
    "Education\nB.Tech Computer Science, Pune University, 2017"
)
GENERIC = "Meeting notes\nDate: 10 Sep 2026\nAttendees: A, B\nDecision: ship v1 next week."


async def _auth(client: AsyncClient) -> dict[str, str]:
    payload = {"name": "X Tester", "email": f"{uuid.uuid4().hex[:10]}@example.com", "password": "Str0ngPassw0rd"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


@pytest.fixture
def use_provider() -> Iterator[Any]:
    yield set_ai_provider
    set_ai_provider(None)


# --- validator: never trust the model ---------------------------------------------------------


def test_parse_tolerates_fences_prose_and_wrappers() -> None:
    assert parse_model_json('```json\n{"name": "A"}\n```') == {"name": "A"}
    assert parse_model_json('Sure! Here it is:\n{"name": "A"} Hope that helps.') == {"name": "A"}
    assert parse_model_json('{"data": {"name": "A"}}') == {"name": "A"}
    assert parse_model_json("{'name': 'A'}") == {"name": "A"}
    assert parse_model_json('{"nested": {"a": "}"}, "name": "A"}') == {"nested": {"a": "}"}, "name": "A"}
    for bad in ("no json here", "[1, 2]", "", None):
        with pytest.raises(ExtractionValidationError):
            parse_model_json(bad)  # type: ignore[arg-type]


def test_shape_drops_unknown_keys_normalises_and_survives_bad_values() -> None:
    raw = {
        "Name": "Vinay Zade",
        "EMAIL": "VINAY@ACME.COM",
        "phone": "+91 98765-43210",
        "designation": "  ",
        "website": "www.acme.com",
        "hallucinated_field": "x",
        "company": None,
        "address": "n/a",
    }
    result = validate_extraction(DocumentType.BUSINESS_CARD, raw, CARD)
    data = result.data.model_dump()

    assert data == {
        "name": "Vinay Zade",
        "company": None,
        "designation": None,
        "email": "vinay@acme.com",
        "phone": "+919876543210",
        "website": "www.acme.com",
        "address": None,
    }
    assert "hallucinated_field" not in data
    assert result.filled_fields == 4 and result.total_fields == 7


def test_ground_nulls_values_not_present_in_the_text() -> None:
    raw = {
        "name": "Vinay Zade",
        "email": "ceo@othercorp.com",  # invented
        "phone": "+1 555 000 1234",  # invented
        "website": "www.acme.com",  # present
    }
    result = validate_extraction(DocumentType.BUSINESS_CARD, raw, CARD)

    assert result.data.email is None and result.data.phone is None  # type: ignore[attr-defined]
    assert result.data.website == "www.acme.com"  # type: ignore[attr-defined]
    assert any("email" in w for w in result.warnings)
    assert any("phone" in w for w in result.warnings)


def test_ground_checks_amounts_and_coerces_numbers() -> None:
    raw = {"invoice_number": "2026-001", "subtotal": "1,000.00", "tax": 250, "total": "9,999.00", "currency": "$"}
    result = validate_extraction(DocumentType.INVOICE, raw, INVOICE)
    data = result.data.model_dump()

    assert data["subtotal"] == 1000.0 and data["tax"] == 250.0
    # 9,999.00 is not in the text: dropped, then the real total is backfilled.
    assert data["total"] == 1250.0
    assert data["currency"] is None  # "$" was guessed; the text has no currency marker
    assert any("Dropped 'total'" in w for w in result.warnings)
    assert any("Filled 'total'" in w for w in result.warnings)


def test_amount_in_date_field_is_dropped_and_total_backfilled() -> None:
    """The exact slip the live model made: total pasted into due_date, total left null."""
    raw = {"invoice_number": "2026-001", "due_date": "1,250.00", "total": None, "subtotal": None}
    result = validate_extraction(DocumentType.INVOICE, raw, INVOICE)
    data = result.data.model_dump()

    assert data["due_date"] == "18 Sep 2026"  # dropped, then backfilled from "Due date:"
    assert data["total"] == 1250.0  # backfilled from "Total due:"
    assert data["subtotal"] == 1000.0
    assert any("not a date" in w for w in result.warnings)
    assert any("Filled 'total'" in w for w in result.warnings)


def test_guessed_currency_is_dropped_without_a_marker_in_text() -> None:
    no_marker = validate_extraction(DocumentType.INVOICE, {"currency": "USD"}, INVOICE)
    assert no_marker.data.model_dump()["currency"] is None
    with_marker = validate_extraction(DocumentType.INVOICE, {"currency": "usd"}, INVOICE + "\nAmount in USD")
    assert with_marker.data.model_dump()["currency"] == "USD"


def test_backfill_never_invents_values() -> None:
    result = validate_extraction(DocumentType.INVOICE, {}, "Just a note with no numbers at all.")
    assert result.data.model_dump()["total"] is None
    assert result.filled_fields == 0


def test_invented_invoice_number_is_replaced_by_the_real_one() -> None:
    result = validate_extraction(DocumentType.INVOICE, {"invoice_number": "INV-FAKE-1"}, INVOICE)
    assert result.data.invoice_number == "2026-001"  # type: ignore[attr-defined]
    assert any("Dropped 'invoice_number'" in w for w in result.warnings)

    no_number = validate_extraction(DocumentType.INVOICE, {"invoice_number": "INV-FAKE-1"}, "Total due: 5.00")
    assert no_number.data.invoice_number is None  # type: ignore[attr-defined]


def test_resume_lists_are_bounded_and_deduplicated() -> None:
    raw = {"skills": "Python, python, TypeScript,, ,React Native", "experience": [{"company": "Acme", "title": "Eng", "bogus": 1}]}
    result = validate_extraction(DocumentType.RESUME, raw, RESUME)
    assert result.data.skills == ["Python", "TypeScript", "React Native"]  # type: ignore[attr-defined]
    assert result.data.experience[0].model_dump() == {"company": "Acme", "title": "Eng", "start": None, "end": None}  # type: ignore[attr-defined]


# --- mock classifier ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (CARD, DocumentType.BUSINESS_CARD),
        (INVOICE, DocumentType.INVOICE),
        (RECEIPT, DocumentType.RECEIPT),
        (RESUME, DocumentType.RESUME),
        (GENERIC, DocumentType.GENERIC),
    ],
)
def test_mock_classifier_recognises_each_type(text: str, expected: DocumentType) -> None:
    document_type, confidence, scores = classify_text(text)
    assert document_type is expected
    assert 0 < confidence <= 1
    assert set(scores) == {t.value for t in DocumentType}


# --- endpoint ------------------------------------------------------------------------------------


async def test_extract_business_card_matches_documented_shape(client: AsyncClient) -> None:
    headers = await _auth(client)

    response = await client.post("/api/v1/ai/extract", json={"text": CARD}, headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["documentType"] == "BUSINESS_CARD"
    assert 0 < body["confidence"] <= 1
    assert body["data"] == {
        "name": "Vinay Zade",
        "company": "Acme Technologies Pvt Ltd",
        "designation": "Senior Software Engineer",
        "email": "vinay@acme.com",
        "phone": "+919876543210",
        "website": "www.acme.com",
        "address": None,
    }
    assert body["warnings"] == []
    assert body["completeness"] == pytest.approx(6 / 7, abs=0.01)
    assert body["provider"] == "mock" and body["modelName"] == "mock-extraction"
    assert isinstance(body["processingMs"], int)


@pytest.mark.parametrize(
    ("text", "expected", "field"),
    [
        (INVOICE, "INVOICE", "invoice_number"),
        (RECEIPT, "RECEIPT", "merchant"),
        (RESUME, "RESUME", "skills"),
        (GENERIC, "GENERIC", "key_values"),
    ],
)
async def test_extract_other_types(client: AsyncClient, text: str, expected: str, field: str) -> None:
    headers = await _auth(client)
    response = await client.post("/api/v1/ai/extract", json={"text": text}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["documentType"] == expected
    assert body["data"][field]


async def test_extract_honours_forced_type_and_validates_input(client: AsyncClient) -> None:
    headers = await _auth(client)

    forced = await client.post(
        "/api/v1/ai/extract", json={"text": CARD, "documentType": "GENERIC"}, headers=headers
    )
    assert forced.status_code == 200
    assert forced.json()["documentType"] == "GENERIC" and forced.json()["confidence"] == 1.0
    assert "emails" in forced.json()["data"]

    bad_type = await client.post(
        "/api/v1/ai/extract", json={"text": CARD, "documentType": "PASSPORT"}, headers=headers
    )
    assert bad_type.status_code == 422

    assert (await client.post("/api/v1/ai/extract", json={"text": CARD})).status_code == 401
    assert (await client.post("/api/v1/ai/extract", json={"text": "x"}, headers=headers)).status_code == 422


async def test_unusable_model_output_degrades_to_empty_object_with_warning(
    client: AsyncClient, use_provider: Any
) -> None:
    class Garbage(ExtractionService):
        async def classify(self, request: ClassificationRequest) -> ClassificationResponse:
            return ClassificationResponse(DocumentType.BUSINESS_CARD, 0.9, ModelInfo("stub", "m"))

        async def extract(self, request: ExtractionRequest) -> ExtractionResponse:
            return ExtractionResponse(request.document_type, {"name": ["not", "a", "string"], "email": 42}, ModelInfo("stub", "m"))

    class P(AIProvider):
        name = "stub"

        @property
        def capabilities(self) -> frozenset[AICapability]:
            return frozenset({AICapability.EXTRACTION})

        @property
        def extraction(self) -> ExtractionService:
            return Garbage()

    use_provider(P())
    headers = await _auth(client)
    response = await client.post("/api/v1/ai/extract", json={"text": CARD}, headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["documentType"] == "BUSINESS_CARD"
    assert body["data"]["name"] is None and body["data"]["email"] is None
    assert any("Ignored invalid value" in w for w in body["warnings"])


async def test_low_confidence_classification_falls_back_to_generic(
    client: AsyncClient, use_provider: Any
) -> None:
    class Unsure(ExtractionService):
        async def classify(self, request: ClassificationRequest) -> ClassificationResponse:
            return ClassificationResponse(DocumentType.INVOICE, 0.2, ModelInfo("stub", "m"))

        async def extract(self, request: ExtractionRequest) -> ExtractionResponse:
            assert request.document_type is DocumentType.GENERIC
            return ExtractionResponse(request.document_type, {"title": "t"}, ModelInfo("stub", "m"))

    class P(AIProvider):
        name = "stub"

        @property
        def capabilities(self) -> frozenset[AICapability]:
            return frozenset({AICapability.EXTRACTION})

        @property
        def extraction(self) -> ExtractionService:
            return Unsure()

    use_provider(P())
    headers = await _auth(client)
    response = await client.post("/api/v1/ai/extract", json={"text": CARD}, headers=headers)
    assert response.json()["documentType"] == "GENERIC"


# --- hugging face provider (fake transport) --------------------------------------------------------


async def test_hf_extraction_two_calls_and_hallucination_is_grounded_out() -> None:
    prompts: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        prompts.append(payload["messages"][0]["content"])
        if len(prompts) == 1:
            content = '{"documentType": "BUSINESS_CARD", "confidence": 0.93}'
        else:
            content = (
                "```json\n"
                '{"name": "Vinay Zade", "company": "Acme Technologies Pvt Ltd", "designation": "Senior Software Engineer", '
                '"email": "vinay@acme.com", "phone": "+91 98765 43210", "website": "www.acme.com", "address": "1 Fake Street"}'
                "\n```"
            )
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}], "usage": {"prompt_tokens": 50, "completion_tokens": 40}})

    provider = HuggingFaceProvider("hf_x", transport=httpx.MockTransport(handler))
    try:
        service = provider.require_extraction()
        classification = await service.classify(ClassificationRequest(CARD))
        extraction = await service.extract(ExtractionRequest(CARD, classification.document_type))
    finally:
        await provider.close()

    assert classification.document_type is DocumentType.BUSINESS_CARD
    assert classification.confidence == 0.93
    assert "BUSINESS_CARD" in prompts[1] and '"designation"' in prompts[1]

    validated = validate_extraction(classification.document_type, extraction.data, CARD)
    data = validated.data.model_dump()
    assert data["email"] == "vinay@acme.com" and data["phone"] == "+919876543210"
    # The address is not grounded (free text), so it is kept; verifiable fields are.
    assert data["address"] == "1 Fake Street"


async def test_hf_non_json_classification_falls_back_to_generic() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "This looks like a business card."}}]})

    provider = HuggingFaceProvider("hf_x", transport=httpx.MockTransport(handler))
    try:
        result = await provider.require_extraction().classify(ClassificationRequest(CARD))
    finally:
        await provider.close()
    assert result.document_type is DocumentType.GENERIC
    assert result.confidence < 0.5
