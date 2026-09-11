"""
Rule-based classification and extraction for the mock provider.

Deterministic keyword scoring for the type, regexes for the fields. Good
enough to drive the app offline and to serve as a sanity baseline; a real
model should beat it, never do worse.
"""

from __future__ import annotations

import re
from typing import Any

from app.ai.base import AIInvalidInputError, ModelInfo
from app.ai.extraction.base import (
    ClassificationRequest,
    ClassificationResponse,
    ExtractionRequest,
    ExtractionResponse,
    ExtractionService,
)
from app.ai.extraction.schemas import DocumentType

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?:\+?\d[\d\s().-]{6,}\d)")
_URL = re.compile(r"(?:https?://|www\.)[^\s,;]+|[A-Za-z0-9-]+\.(?:com|in|org|net|io|co)(?:/[^\s]*)?", re.IGNORECASE)
_AMOUNT = re.compile(r"(?:[$€£₹]|Rs\.?|USD|INR|EUR|GBP)?\s*\d[\d,]*\.\d{2}\b|\b\d[\d,]*\.\d{2}\b")
_DATE = re.compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|"
    r"\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{2,4}|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4})\b",
    re.IGNORECASE,
)
_INVOICE_NO = re.compile(r"\b(?:invoice|inv)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-/]{2,})", re.IGNORECASE)
_TOTAL = re.compile(r"\b(?:total(?:\s+due)?|amount\s+due|grand\s+total|balance\s+due)\b[^\d$€£₹]*([$€£₹]?\s*\d[\d,]*(?:\.\d{2})?)", re.IGNORECASE)
_TAX = re.compile(r"\b(?:tax|gst|vat)\b[^\d]*(\d[\d,]*(?:\.\d{2})?)", re.IGNORECASE)
_SUBTOTAL = re.compile(r"\bsub\s*total\b[^\d]*(\d[\d,]*(?:\.\d{2})?)", re.IGNORECASE)
_CURRENCY = re.compile(r"[$€£₹]|\b(?:USD|INR|EUR|GBP|JPY|Rs\.?)\b")

_TITLES = (
    "ceo", "cto", "cfo", "coo", "founder", "co-founder", "director", "manager", "engineer",
    "developer", "designer", "consultant", "analyst", "head of", "vp", "president",
    "partner", "architect", "lead", "specialist", "executive", "officer", "associate",
)
_COMPANY_HINTS = ("inc", "ltd", "llc", "pvt", "limited", "corp", "co.", "gmbh", "technologies", "solutions", "labs", "studio")

_KEYWORDS: dict[DocumentType, tuple[str, ...]] = {
    DocumentType.INVOICE: ("invoice", "bill to", "due date", "amount due", "invoice no", "payment terms", "net 30"),
    DocumentType.RECEIPT: ("receipt", "cashier", "change", "thank you for shopping", "subtotal", "cash", "card ending", "visa", "mastercard", "qty"),
    DocumentType.RESUME: ("experience", "education", "skills", "curriculum", "resume", "objective", "summary", "bachelor", "master", "university", "linkedin", "projects", "certifications"),
    DocumentType.BUSINESS_CARD: _TITLES + _COMPANY_HINTS,
}

MODEL = ModelInfo(provider="mock", model="mock-extraction")


def classify_text(text: str) -> tuple[DocumentType, float, dict[str, float]]:
    lowered = text.lower()
    words = len(lowered.split())
    scores: dict[DocumentType, float] = {t: 0.0 for t in DocumentType}

    for doc_type, keywords in _KEYWORDS.items():
        for kw in keywords:
            if kw in lowered:
                scores[doc_type] += 1.0

    has_email = bool(_EMAIL.search(text))
    has_phone = bool(_PHONE.search(text))
    if has_email:
        scores[DocumentType.BUSINESS_CARD] += 1.5
        scores[DocumentType.RESUME] += 0.5
    if has_phone:
        scores[DocumentType.BUSINESS_CARD] += 1.0
    if _AMOUNT.search(text):
        scores[DocumentType.INVOICE] += 1.0
        scores[DocumentType.RECEIPT] += 1.0
    if _INVOICE_NO.search(text):
        scores[DocumentType.INVOICE] += 2.0
    # Section headings are the strongest resume signal, whatever the length.
    sections = sum(1 for h in ("experience", "education", "skills") if h in lowered)
    if sections >= 2:
        scores[DocumentType.RESUME] += 4.0
        scores[DocumentType.BUSINESS_CARD] -= 2.0
    # Business cards are short; resumes are long.
    if words <= 40 and scores[DocumentType.BUSINESS_CARD] > 0:
        scores[DocumentType.BUSINESS_CARD] += 1.0
        scores[DocumentType.RESUME] -= 2.0
    elif words >= 150:
        scores[DocumentType.RESUME] += 1.5
        scores[DocumentType.BUSINESS_CARD] -= 2.0
    scores[DocumentType.GENERIC] = 0.5

    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    positive = {k: max(v, 0.0) for k, v in scores.items()}
    total = sum(positive.values()) or 1.0
    normalised = {k.value: round(v / total, 3) for k, v in positive.items()}
    confidence = normalised[best.value]
    if scores[best] <= 0.5:
        best, confidence = DocumentType.GENERIC, 0.5
    return best, confidence, normalised


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def _first(pattern: re.Pattern[str], text: str, group: int = 0) -> str | None:
    m = pattern.search(text)
    return m.group(group).strip() if m else None


_YEAR_RANGE = re.compile(r"^\s*(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|present)\s*$", re.I)


def find_phones(text: str) -> list[str]:
    """Phone-looking runs with at least 8 digits that are not year ranges."""
    out: list[str] = []
    for candidate in _PHONE.findall(text):
        digits = re.sub(r"\D", "", candidate)
        if len(digits) >= 8 and not _YEAR_RANGE.match(candidate):
            out.append(candidate.strip())
    return out


def find_phone(text: str) -> str | None:
    phones = find_phones(text)
    return phones[0] if phones else None


def extract_business_card(text: str) -> dict[str, Any]:
    lines = _lines(text)
    email = _first(_EMAIL, text)
    phone = find_phone(text)
    # Search with emails blanked out so "acme.com" inside an address is not a website.
    website = next((u for u in _URL.findall(_EMAIL.sub(" ", text))), None)
    designation = next((ln for ln in lines if any(t in ln.lower() for t in _TITLES)), None)
    company = next((ln for ln in lines if any(h in ln.lower() for h in _COMPANY_HINTS) and ln != designation), None)
    if company is None and email and "@" in email:
        domain = email.split("@")[1].split(".")[0]
        company = next((ln for ln in lines if domain.lower() in ln.lower() and "@" not in ln), None)
    name = next(
        (
            ln for ln in lines
            if ln not in (designation, company)
            and not _EMAIL.search(ln) and not _PHONE.search(ln) and not _URL.search(ln)
            and 1 < len(ln.split()) <= 4 and ln[0].isalpha()
        ),
        None,
    )
    address = next((ln for ln in lines if re.search(r"\d+.*\b(st|street|road|rd|ave|avenue|lane|blvd|suite|floor)\b", ln, re.I)), None)
    return {
        "name": name, "company": company, "designation": designation, "email": email,
        "phone": phone, "website": website, "address": address,
    }


def extract_resume(text: str) -> dict[str, Any]:
    lines = _lines(text)
    lowered = text.lower()
    skills: list[str] = []
    m = re.search(r"skills?\s*[:\-]?\s*(.+)", text, re.IGNORECASE)
    if m:
        skills = [s.strip() for s in re.split(r"[,;|•\n]", m.group(1)) if 1 < len(s.strip()) <= 40][:20]
    summary = next((ln for ln in lines if len(ln.split()) >= 12), None)
    education = []
    for ln in lines:
        if re.search(r"\b(university|college|institute|bachelor|master|b\.?tech|m\.?tech|mba|phd|b\.?sc|m\.?sc)\b", ln, re.I):
            year = _first(re.compile(r"\b(19|20)\d{2}\b"), ln)
            education.append({"institution": ln[:80], "degree": None, "year": year})
    experience = []
    for ln in lines:
        if re.search(r"\b(19|20)\d{2}\s*[-–]\s*(?:(19|20)\d{2}|present)\b", ln, re.I):
            experience.append({"company": None, "title": ln[:80], "start": None, "end": None})
    return {
        "name": lines[0] if lines and len(lines[0].split()) <= 4 else None,
        "email": _first(_EMAIL, text),
        "phone": find_phone(text),
        "summary": summary,
        "skills": skills,
        "experience": experience[:10],
        "education": education[:5],
        "_has_resume_cues": "experience" in lowered or "education" in lowered,
    }


def _money_fields(text: str) -> dict[str, Any]:
    return {
        "currency": _first(_CURRENCY, text),
        "subtotal": _first(_SUBTOTAL, text, 1),
        "tax": _first(_TAX, text, 1),
        "total": _first(_TOTAL, text, 1),
    }


def extract_invoice(text: str) -> dict[str, Any]:
    lines = _lines(text)
    customer = _first(re.compile(r"bill(?:ed)?\s*to\s*[:\-]?\s*(.+)", re.I), text, 1)
    vendor = next((ln for ln in lines if any(h in ln.lower() for h in _COMPANY_HINTS)), None)
    dates = _DATE.findall(text)
    return {
        "invoice_number": _first(_INVOICE_NO, text, 1),
        "vendor": vendor,
        "customer": customer,
        "date": dates[0] if dates else None,
        "due_date": _first(re.compile(r"\bdue\s+(?:date|by|on)\s*[:\-]?\s*([^\n]+)", re.I), text, 1),
        **_money_fields(text),
        "line_items": [],
    }


def extract_receipt(text: str) -> dict[str, Any]:
    lines = _lines(text)
    dates = _DATE.findall(text)
    return {
        "merchant": lines[0] if lines else None,
        "date": dates[0] if dates else None,
        "time": _first(re.compile(r"\b\d{1,2}:\d{2}(?:\s*[ap]m)?\b", re.I), text),
        "payment_method": _first(re.compile(r"\b(cash|visa|mastercard|amex|upi|card|debit|credit)\b", re.I), text),
        **_money_fields(text),
        "items": [],
    }


def extract_generic(text: str) -> dict[str, Any]:
    lines = _lines(text)
    key_values = []
    for ln in lines:
        m = re.match(r"^([A-Za-z][A-Za-z /]{1,40}?)\s*[:\-]\s*(.+)$", ln)
        if m:
            key_values.append({"key": m.group(1).strip(), "value": m.group(2).strip()})
    return {
        "title": lines[0][:120] if lines else None,
        "summary": " ".join(lines[:2])[:300] if lines else None,
        "key_values": key_values[:30],
        "dates": _DATE.findall(text)[:20],
        "amounts": [a.strip() for a in _AMOUNT.findall(text)][:20],
        "emails": _EMAIL.findall(text)[:10],
        "phones": find_phones(text)[:10],
    }


_EXTRACTORS = {
    DocumentType.BUSINESS_CARD: extract_business_card,
    DocumentType.RESUME: extract_resume,
    DocumentType.INVOICE: extract_invoice,
    DocumentType.RECEIPT: extract_receipt,
    DocumentType.GENERIC: extract_generic,
}


class MockExtractionService(ExtractionService):
    async def classify(self, request: ClassificationRequest) -> ClassificationResponse:
        if not request.text.strip():
            raise AIInvalidInputError("The text is empty.")
        doc_type, confidence, scores = classify_text(request.text)
        return ClassificationResponse(
            document_type=doc_type, confidence=confidence, scores=scores, model=MODEL
        )

    async def extract(self, request: ExtractionRequest) -> ExtractionResponse:
        if not request.text.strip():
            raise AIInvalidInputError("The text is empty.")
        data = _EXTRACTORS[request.document_type](request.text)
        data.pop("_has_resume_cues", None)
        return ExtractionResponse(document_type=request.document_type, data=data, model=MODEL)
