"""
Upload validation. Mirrors the rules the mobile app applies before sending
(`src/services/files/fileConstraints.ts`) and adds the one check only the
server can do reliably: the file's actual bytes must match its claimed type.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath

from fastapi import status

from app.core.exceptions import AppError
from app.models.enums import DocumentKind


@dataclass(frozen=True)
class SupportedType:
    mime: str
    kind: DocumentKind
    extensions: tuple[str, ...]


SUPPORTED_TYPES: dict[str, SupportedType] = {
    t.mime: t
    for t in (
        SupportedType("application/pdf", DocumentKind.PDF, ("pdf",)),
        SupportedType("image/jpeg", DocumentKind.IMAGE, ("jpg", "jpeg")),
        SupportedType("image/png", DocumentKind.IMAGE, ("png",)),
        SupportedType("image/webp", DocumentKind.IMAGE, ("webp",)),
        SupportedType("image/heic", DocumentKind.IMAGE, ("heic",)),
        SupportedType("image/heif", DocumentKind.IMAGE, ("heif",)),
    )
}

MIME_BY_EXTENSION: dict[str, str] = {
    ext: t.mime for t in SUPPORTED_TYPES.values() for ext in t.extensions
}

_MIME_ALIASES = {"image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg"}

# Bytes needed to identify every supported type.
SNIFF_BYTES = 32


class UploadValidationError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "INVALID_UPLOAD"


class UnsupportedMediaTypeError(AppError):
    status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    code = "UNSUPPORTED_MEDIA_TYPE"
    message = "That file type is not supported. Upload a PDF, JPG, PNG, WEBP or HEIC."


class FileTooLargeError(AppError):
    status_code = status.HTTP_413_CONTENT_TOO_LARGE
    code = "FILE_TOO_LARGE"


def normalise_mime(value: str | None) -> str:
    if not value:
        return ""
    bare = value.split(";")[0].strip().lower()
    return _MIME_ALIASES.get(bare, bare)


def extension_of(filename: str | None) -> str:
    if not filename:
        return ""
    suffix = PurePosixPath(filename.replace("\\", "/")).suffix
    return suffix[1:].lower() if suffix else ""


def safe_display_name(filename: str | None, extension: str) -> str:
    """Strips any path and control characters; falls back to a generic name."""
    base = PurePosixPath((filename or "").replace("\\", "/")).name
    cleaned = "".join(ch for ch in base if ch.isprintable() and ch not in '<>:"/\\|?*').strip()
    return cleaned[:255] if cleaned else f"upload.{extension}"


def sniff_mime(head: bytes) -> str | None:
    """Identifies the real type from magic bytes; None when unrecognised."""
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"hevx"):
            return "image/heic"
        if brand in (b"mif1", b"msf1", b"heif"):
            return "image/heif"
    return None


def resolve_type(declared_mime: str | None, filename: str | None) -> SupportedType:
    """Checks the declared MIME and extension agree and are supported."""
    extension = extension_of(filename)
    mime = normalise_mime(declared_mime) or MIME_BY_EXTENSION.get(extension, "")

    supported = SUPPORTED_TYPES.get(mime)
    if supported is None:
        raise UnsupportedMediaTypeError()
    if not extension:
        raise UploadValidationError(
            "The file name has no extension.", code="MISSING_EXTENSION"
        )
    if extension not in supported.extensions:
        if extension in MIME_BY_EXTENSION:
            raise UploadValidationError(
                f"The file's type ({mime}) does not match its .{extension} extension.",
                code="TYPE_MISMATCH",
            )
        raise UnsupportedMediaTypeError(f".{extension} files are not supported.")
    return supported


def check_content(head: bytes, expected: SupportedType) -> None:
    """The bytes must actually be what the client claims (no renamed files)."""
    actual = sniff_mime(head)
    # HEIC and HEIF share a container; either is acceptable for either.
    heif_family = {"image/heic", "image/heif"}
    if actual == expected.mime or (actual in heif_family and expected.mime in heif_family):
        return
    raise UploadValidationError(
        "The file's contents do not match its type."
        if actual
        else "The file does not look like a valid document or image.",
        code="CONTENT_MISMATCH",
    )


def max_bytes_for(kind: DocumentKind, *, pdf_limit: int, image_limit: int) -> int:
    return pdf_limit if kind is DocumentKind.PDF else image_limit


def format_size(num: int) -> str:
    if num < 1024:
        return f"{num} B"
    if num < 1024 * 1024:
        return f"{num / 1024:.0f} KB"
    return f"{num / (1024 * 1024):.1f} MB"
