"""
Validates AI-generated structured data before it reaches the client.

Three layers, applied in order:

1. **Parse**: tolerate the ways models wrap JSON (code fences, prose before
   or after, single quotes) and reject anything that is not an object.
2. **Shape**: coerce into the Pydantic schema for the document type. Unknown
   keys are dropped, blanks become null, numbers and phones are normalised.
3. **Ground**: verifiable fields (emails, phones, amounts, ids) must actually
   occur in the source text. A value the model invented is nulled and
   reported in `warnings` rather than shown as fact. Date fields must look
   like dates (a total pasted into `due_date` is a common model slip).
4. **Backfill**: a few high-value fields (invoice number, totals, due date)
   that the model left empty are filled from the source text with strict
   patterns, so they are grounded by construction.

The result is always a valid instance of the target schema, possibly with
many nulls, plus a list of human-readable warnings.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ValidationError

from app.ai.extraction import patterns
from app.ai.extraction.schemas import (
    SCHEMA_FOR,
    DocumentType,
    normalise_phone,
    parse_amount,
)

_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)
_NON_DIGIT = re.compile(r"\D")


class ExtractionValidationError(ValueError):
    """The provider output could not be turned into any usable object."""


@dataclass
class ValidatedExtraction:
    document_type: DocumentType
    data: BaseModel
    warnings: list[str] = field(default_factory=list)
    """How many top-level fields ended up populated."""
    filled_fields: int = 0
    total_fields: int = 0

    @property
    def completeness(self) -> float:
        return self.filled_fields / self.total_fields if self.total_fields else 0.0


# --- 1. parse ----------------------------------------------------------------------------


def parse_model_json(raw: str | dict[str, Any] | None) -> dict[str, Any]:
    """Extracts the first JSON object from model output; raises if none."""
    if raw is None:
        raise ExtractionValidationError("Provider returned no data.")
    if isinstance(raw, dict):
        return raw
    text = raw.strip()
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1)
    candidate = _first_object(text)
    if candidate is None:
        raise ExtractionValidationError("Provider output contained no JSON object.")
    try:
        value = json.loads(candidate)
    except json.JSONDecodeError:
        try:
            value = json.loads(candidate.replace("'", '"'))
        except json.JSONDecodeError as exc:
            raise ExtractionValidationError("Provider output was not valid JSON.") from exc
    if not isinstance(value, dict):
        raise ExtractionValidationError("Provider output was not a JSON object.")
    # Some models wrap the payload: {"data": {...}} or {"BUSINESS_CARD": {...}}
    if "data" in value and isinstance(value["data"], dict) and len(value) <= 3:
        return value["data"]
    return value


def _first_object(text: str) -> str | None:
    """Returns the substring of the first balanced {...} block."""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


# --- 2. shape -----------------------------------------------------------------------------


def shape(document_type: DocumentType, payload: dict[str, Any]) -> tuple[BaseModel, list[str]]:
    schema = SCHEMA_FOR[document_type]
    warnings: list[str] = []
    normalised = {_snake(k): v for k, v in payload.items()}
    try:
        return schema.model_validate(normalised), warnings
    except ValidationError as exc:
        # Drop each offending field and retry so one bad value cannot sink the rest.
        for error in exc.errors():
            loc = error["loc"]
            if loc:
                key = str(loc[0])
                if key in normalised:
                    normalised.pop(key, None)
                    warnings.append(f"Ignored invalid value for '{key}'.")
        try:
            return schema.model_validate(normalised), warnings
        except ValidationError as exc2:
            raise ExtractionValidationError("Provider output did not match the schema.") from exc2


def _snake(key: str) -> str:
    key = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(key)).replace("-", "_").replace(" ", "_")
    return key.lower()


# --- 3. ground -----------------------------------------------------------------------------

# Fields whose value must be traceable to the source text.
_EXACT_FIELDS = ("email", "website", "invoice_number")
_PHONE_FIELDS = ("phone",)
_AMOUNT_FIELDS = ("subtotal", "tax", "total")
_DATE_FIELDS = ("date", "due_date")


def ground(data: BaseModel, source: str) -> tuple[BaseModel, list[str]]:
    """Nulls verifiable fields that do not appear in `source`."""
    warnings: list[str] = []
    lowered = source.lower()
    digits_only = _NON_DIGIT.sub("", source)
    updates: dict[str, Any] = {}

    for name in _EXACT_FIELDS:
        value = getattr(data, name, None)
        if isinstance(value, str) and value.lower() not in lowered:
            updates[name] = None
            warnings.append(f"Dropped '{name}': not found in the document text.")

    for name in _PHONE_FIELDS:
        value = getattr(data, name, None)
        if isinstance(value, str):
            digits = _NON_DIGIT.sub("", value)
            if digits and digits not in digits_only:
                updates[name] = None
                warnings.append(f"Dropped '{name}': not found in the document text.")

    for name in _AMOUNT_FIELDS:
        value = getattr(data, name, None)
        if isinstance(value, (int, float)) and not _amount_in_text(value, source):
            updates[name] = None
            warnings.append(f"Dropped '{name}': amount not found in the document text.")

    for name in _DATE_FIELDS:
        value = getattr(data, name, None)
        if isinstance(value, str) and not patterns.looks_like_date(value):
            updates[name] = None
            warnings.append(f"Dropped '{name}': '{value}' is not a date.")

    currency = getattr(data, "currency", None)
    if isinstance(currency, str) and not patterns.CURRENCY.search(source):
        updates["currency"] = None
        warnings.append("Dropped 'currency': no currency symbol or code in the document text.")

    list_emails = getattr(data, "emails", None)
    if isinstance(list_emails, list):
        kept = [e for e in list_emails if isinstance(e, str) and e.lower() in lowered]
        if len(kept) != len(list_emails):
            updates["emails"] = kept
            warnings.append("Dropped emails not found in the document text.")
    list_phones = getattr(data, "phones", None)
    if isinstance(list_phones, list):
        kept = []
        for p in list_phones:
            norm = normalise_phone(p)
            if norm and _NON_DIGIT.sub("", norm) in digits_only:
                kept.append(norm)
        if len(kept) != len(list_phones):
            updates["phones"] = kept
            warnings.append("Dropped phone numbers not found in the document text.")

    if updates:
        data = data.model_copy(update=updates)
    return data, warnings


def _amount_in_text(value: float, source: str) -> bool:
    """True if the number appears in the text in any common formatting."""
    candidates = {
        f"{value:.2f}",
        f"{value:,.2f}",
        f"{value:g}",
        f"{value:,}",
        f"{int(value)}" if float(value).is_integer() else f"{value}",
    }
    compact = source.replace(" ", "")
    return any(c in source or c in compact for c in candidates)


# --- 4. backfill ------------------------------------------------------------------------------


def backfill(data: BaseModel, source: str) -> tuple[BaseModel, list[str]]:
    """Fills empty high-value fields from strict patterns in the source text."""
    warnings: list[str] = []
    updates: dict[str, Any] = {}
    fields = type(data).model_fields

    def fill(name: str, pattern: re.Pattern[str], group: int = 1, convert=None):  # type: ignore[no-untyped-def]
        if name not in fields or getattr(data, name, None) not in (None, ""):
            return
        match = pattern.search(source)
        if not match:
            return
        raw = match.group(group).strip()
        value = convert(raw) if convert else raw
        if value not in (None, ""):
            updates[name] = value
            warnings.append(f"Filled '{name}' from the document text.")

    fill("invoice_number", patterns.INVOICE_NO)
    fill("total", patterns.TOTAL, convert=parse_amount)
    fill("subtotal", patterns.SUBTOTAL, convert=parse_amount)
    fill("tax", patterns.TAX, convert=parse_amount)
    fill("due_date", patterns.DUE_DATE, convert=lambda v: v if patterns.looks_like_date(v) else None)
    if "date" in fields and getattr(data, "date", None) in (None, ""):
        match = patterns.DATE.search(source)
        if match:
            updates["date"] = match.group(0)
            warnings.append("Filled 'date' from the document text.")

    if updates:
        data = data.model_copy(update=updates)
    return data, warnings


# --- entry point ------------------------------------------------------------------------------


def validate_extraction(
    document_type: DocumentType, raw: str | dict[str, Any] | None, source_text: str
) -> ValidatedExtraction:
    payload = parse_model_json(raw)
    data, shape_warnings = shape(document_type, payload)
    data, ground_warnings = ground(data, source_text)
    data, backfill_warnings = backfill(data, source_text)

    fields = list(type(data).model_fields)
    filled = sum(1 for f in fields if _is_filled(getattr(data, f)))

    return ValidatedExtraction(
        document_type=document_type,
        data=data,
        warnings=shape_warnings + ground_warnings + backfill_warnings,
        filled_fields=filled,
        total_fields=len(fields),
    )


def _is_filled(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, (list, dict, str)):
        return len(value) > 0
    return True
