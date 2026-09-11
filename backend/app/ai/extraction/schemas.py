"""
Structured data schemas per document type.

These are the *only* shapes the API returns for `data`. Whatever a model
produces is parsed into one of these with unknown keys dropped and values
coerced; anything that does not fit becomes `null` plus a warning.
"""

from __future__ import annotations

import enum
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DocumentType(str, enum.Enum):
    BUSINESS_CARD = "BUSINESS_CARD"
    RESUME = "RESUME"
    INVOICE = "INVOICE"
    RECEIPT = "RECEIPT"
    GENERIC = "GENERIC"


_EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_PHONE_CHARS = re.compile(r"[^\d+]")


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class _Lenient(BaseModel):
    """Base for extracted shapes: ignore extras, blank strings become null."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    @field_validator("*", mode="before")
    @classmethod
    def _blank_to_none(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str) and value.strip().lower() in {"null", "none", "n/a", "unknown"}:
            return None
        return value


class BusinessCardData(_Lenient):
    name: str | None = None
    company: str | None = None
    designation: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    address: str | None = None

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        value = _clean_str(value)
        return value.lower() if value and _EMAIL.match(value) else None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalise_phone(value)


class ExperienceEntry(_Lenient):
    company: str | None = None
    title: str | None = None
    start: str | None = None
    end: str | None = None


class EducationEntry(_Lenient):
    institution: str | None = None
    degree: str | None = None
    year: str | None = None


class ResumeData(_Lenient):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    summary: str | None = None
    skills: list[str] = Field(default_factory=list, max_length=40)
    experience: list[ExperienceEntry] = Field(default_factory=list, max_length=20)
    education: list[EducationEntry] = Field(default_factory=list, max_length=10)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        value = _clean_str(value)
        return value.lower() if value and _EMAIL.match(value) else None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalise_phone(value)

    @field_validator("skills", mode="before")
    @classmethod
    def _skills(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            value = [s for s in re.split(r"[,;\n]", value)]
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for item in value:
            text = _clean_str(item)
            if text and text.lower() not in {s.lower() for s in out}:
                out.append(text[:60])
        return out


class LineItem(_Lenient):
    description: str | None = None
    quantity: float | None = None
    unit_price: float | None = None
    amount: float | None = None

    @field_validator("quantity", "unit_price", "amount", mode="before")
    @classmethod
    def _num(cls, value: Any) -> float | None:
        return parse_amount(value)


class InvoiceData(_Lenient):
    invoice_number: str | None = None
    vendor: str | None = None
    customer: str | None = None
    date: str | None = None
    due_date: str | None = None
    currency: str | None = None
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    line_items: list[LineItem] = Field(default_factory=list, max_length=50)

    @field_validator("subtotal", "tax", "total", mode="before")
    @classmethod
    def _num(cls, value: Any) -> float | None:
        return parse_amount(value)

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return normalise_currency(value)


class ReceiptData(_Lenient):
    merchant: str | None = None
    date: str | None = None
    time: str | None = None
    currency: str | None = None
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    payment_method: str | None = None
    items: list[LineItem] = Field(default_factory=list, max_length=50)

    @field_validator("subtotal", "tax", "total", mode="before")
    @classmethod
    def _num(cls, value: Any) -> float | None:
        return parse_amount(value)

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return normalise_currency(value)


class KeyValue(_Lenient):
    key: str
    value: str


class GenericData(_Lenient):
    title: str | None = None
    summary: str | None = None
    key_values: list[KeyValue] = Field(default_factory=list, max_length=30)
    dates: list[str] = Field(default_factory=list, max_length=20)
    amounts: list[str] = Field(default_factory=list, max_length=20)
    emails: list[str] = Field(default_factory=list, max_length=10)
    phones: list[str] = Field(default_factory=list, max_length=10)


SCHEMA_FOR: dict[DocumentType, type[BaseModel]] = {
    DocumentType.BUSINESS_CARD: BusinessCardData,
    DocumentType.RESUME: ResumeData,
    DocumentType.INVOICE: InvoiceData,
    DocumentType.RECEIPT: ReceiptData,
    DocumentType.GENERIC: GenericData,
}


# --- normalisers ---------------------------------------------------------------------


def normalise_phone(value: Any) -> str | None:
    text = _clean_str(value)
    if not text:
        return None
    digits = _PHONE_CHARS.sub("", text)
    if digits.startswith("+"):
        core = digits[1:]
    else:
        core = digits
    if not core.isdigit() or not 7 <= len(core) <= 15:
        return None
    return ("+" if digits.startswith("+") else "") + core


_CURRENCY_ALIASES = {
    "$": "USD", "us$": "USD", "usd": "USD",
    "€": "EUR", "eur": "EUR",
    "£": "GBP", "gbp": "GBP",
    "₹": "INR", "rs": "INR", "rs.": "INR", "inr": "INR",
    "¥": "JPY", "jpy": "JPY",
}


def normalise_currency(value: Any) -> str | None:
    text = _clean_str(value)
    if not text:
        return None
    lowered = text.lower()
    if lowered in _CURRENCY_ALIASES:
        return _CURRENCY_ALIASES[lowered]
    if re.fullmatch(r"[A-Za-z]{3}", text):
        return text.upper()
    return None


_AMOUNT = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


def parse_amount(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = _AMOUNT.search(str(value))
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None
