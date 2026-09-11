"""Regexes shared by the validator's grounding/backfill and the mock provider."""

from __future__ import annotations

import re

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?:\+?\d[\d\s().-]{6,}\d)")
URL = re.compile(
    r"(?:https?://|www\.)[^\s,;]+|[A-Za-z0-9-]+\.(?:com|in|org|net|io|co)(?:/[^\s]*)?",
    re.IGNORECASE,
)
AMOUNT = re.compile(r"(?:[$€£₹]|Rs\.?|USD|INR|EUR|GBP)?\s*\d[\d,]*\.\d{2}\b|\b\d[\d,]*\.\d{2}\b")
DATE = re.compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|"
    r"\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+\d{2,4}|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4})\b",
    re.IGNORECASE,
)
INVOICE_NO = re.compile(
    r"\b(?:invoice|inv)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-/]{2,})", re.IGNORECASE
)
TOTAL = re.compile(
    r"\b(?:total(?:\s+due)?|amount\s+due|grand\s+total|balance\s+due)\b[^\d$€£₹]*"
    r"([$€£₹]?\s*\d[\d,]*(?:\.\d{2})?)",
    re.IGNORECASE,
)
TAX = re.compile(r"\b(?:tax|gst|vat)\b[^\d]*(\d[\d,]*(?:\.\d{2})?)", re.IGNORECASE)
SUBTOTAL = re.compile(r"\bsub\s*total\b[^\d]*(\d[\d,]*(?:\.\d{2})?)", re.IGNORECASE)
DUE_DATE = re.compile(r"\bdue\s+(?:date|by|on)\s*[:\-]?\s*([^\n]+)", re.IGNORECASE)
CURRENCY = re.compile(r"[$€£₹]|\b(?:USD|INR|EUR|GBP|JPY|Rs\.?)\b")
YEAR_RANGE = re.compile(r"^\s*(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|present)\s*$", re.I)


def looks_like_date(value: str) -> bool:
    """True for anything with a recognisable date shape (not a bare amount)."""
    if AMOUNT.fullmatch(value.strip()):
        return False
    return bool(DATE.search(value)) or bool(
        re.search(r"\b(?:19|20)\d{2}\b", value) and re.search(r"[A-Za-z]{3,}", value)
    )
