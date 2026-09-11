"""Secure document upload: validation, storage and metadata."""

from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.core.config import get_settings

pytestmark = pytest.mark.asyncio

PDF = b"%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF" + b"\x10\x00\x00\x00" + b"WEBP" + b"VP8 " + b"\x00" * 32
HEIC = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 32


async def _auth(client: AsyncClient) -> dict[str, str]:
    payload = {
        "name": "Doc Tester",
        "email": f"{uuid.uuid4().hex[:10]}@example.com",
        "password": "Str0ngPassw0rd",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


async def _upload(client: AsyncClient, headers: dict[str, str], name: str, mime: str, data: bytes):
    return await client.post(
        "/api/v1/documents/upload", headers=headers, files={"file": (name, data, mime)}
    )


def _storage_root() -> Path:
    return Path(get_settings().storage_dir)


# --- happy path -----------------------------------------------------------------------


async def test_upload_pdf_stores_file_and_metadata(client: AsyncClient) -> None:
    headers = await _auth(client)

    response = await _upload(client, headers, "Invoice March.pdf", "application/pdf", PDF)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Invoice March.pdf"
    assert body["mimeType"] == "application/pdf"
    assert body["kind"] == "pdf"
    assert body["status"] == "uploaded"
    assert body["sizeBytes"] == len(PDF)
    assert body["sha256"] == hashlib.sha256(PDF).hexdigest()
    assert set(body) == {"id", "name", "mimeType", "sizeBytes", "kind", "status", "sha256", "createdAt"}

    # Bytes live on disk under an opaque key, not in the database.
    stored = list(_storage_root().rglob("*.pdf"))
    assert any(p.read_bytes() == PDF for p in stored)
    assert not any("Invoice" in p.name for p in stored)

    detail = await client.get(f"/api/v1/documents/{body['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["text"] is None and detail.json()["analysis"] is None

    content = await client.get(f"/api/v1/documents/{body['id']}/content", headers=headers)
    assert content.status_code == 200
    assert content.content == PDF
    assert content.headers["content-type"].startswith("application/pdf")


@pytest.mark.parametrize(
    ("name", "mime", "data", "kind"),
    [
        ("photo.jpg", "image/jpeg", JPEG, "image"),
        ("photo.jpeg", "image/jpg", JPEG, "image"),  # alias normalised
        ("shot.png", "image/png", PNG, "image"),
        ("pic.webp", "image/webp", WEBP, "image"),
        ("iphone.heic", "image/heic", HEIC, "image"),
    ],
)
async def test_upload_accepts_every_supported_image(
    client: AsyncClient, name: str, mime: str, data: bytes, kind: str
) -> None:
    headers = await _auth(client)
    response = await _upload(client, headers, name, mime, data)
    assert response.status_code == 201, response.text
    assert response.json()["kind"] == kind


async def test_upload_infers_type_from_extension_when_mime_is_generic(client: AsyncClient) -> None:
    headers = await _auth(client)
    response = await _upload(client, headers, "scan.pdf", "application/octet-stream", PDF)
    # Generic MIME is not supported; extension alone is not trusted.
    assert response.status_code == 415


# --- validation -------------------------------------------------------------------------


async def test_upload_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/documents/upload", files={"file": ("a.pdf", PDF, "application/pdf")}
    )
    assert response.status_code == 401


async def test_upload_rejects_unsupported_mime_and_extension(client: AsyncClient) -> None:
    headers = await _auth(client)

    exe = await _upload(client, headers, "tool.exe", "application/x-msdownload", b"MZ" * 40)
    assert exe.status_code == 415
    assert exe.json()["code"] == "UNSUPPORTED_MEDIA_TYPE"

    svg = await _upload(client, headers, "logo.svg", "image/svg+xml", b"<svg/>")
    assert svg.status_code == 415


async def test_upload_rejects_extension_that_disagrees_with_mime(client: AsyncClient) -> None:
    headers = await _auth(client)
    response = await _upload(client, headers, "report.pdf", "image/png", PNG)
    assert response.status_code == 400
    assert response.json()["code"] == "TYPE_MISMATCH"


async def test_upload_rejects_renamed_file_by_content(client: AsyncClient) -> None:
    """A PNG renamed to .pdf with a PDF MIME type must not get through."""
    headers = await _auth(client)
    response = await _upload(client, headers, "sneaky.pdf", "application/pdf", PNG)
    assert response.status_code == 400
    assert response.json()["code"] == "CONTENT_MISMATCH"
    assert not list(_storage_root().rglob("*.part"))


async def test_upload_rejects_garbage_content(client: AsyncClient) -> None:
    headers = await _auth(client)
    response = await _upload(client, headers, "x.jpg", "image/jpeg", b"hello world " * 8)
    assert response.status_code == 400
    assert response.json()["code"] == "CONTENT_MISMATCH"


async def test_upload_rejects_missing_extension_and_empty_file(client: AsyncClient) -> None:
    headers = await _auth(client)

    no_ext = await _upload(client, headers, "noextension", "application/pdf", PDF)
    assert no_ext.status_code == 400
    assert no_ext.json()["code"] == "MISSING_EXTENSION"

    empty = await _upload(client, headers, "empty.pdf", "application/pdf", b"")
    assert empty.status_code == 400
    assert empty.json()["code"] == "EMPTY_FILE"

    missing = await client.post("/api/v1/documents/upload", headers=headers)
    assert missing.status_code == 422


async def test_upload_enforces_size_limit_per_kind(client: AsyncClient) -> None:
    headers = await _auth(client)
    settings = get_settings()

    too_big_pdf = PDF + b"0" * settings.max_pdf_bytes
    response = await _upload(client, headers, "big.pdf", "application/pdf", too_big_pdf)
    assert response.status_code == 413
    assert response.json()["code"] == "FILE_TOO_LARGE"
    assert "limit" in response.json()["detail"]

    # Images have a lower limit than PDFs.
    just_under_pdf_limit = JPEG + b"\x00" * (settings.max_image_bytes + 10)
    image = await _upload(client, headers, "big.jpg", "image/jpeg", just_under_pdf_limit)
    assert image.status_code == 413

    # Nothing oversized was left behind on disk.
    files = [p for p in _storage_root().rglob("*") if p.is_file()]
    assert all(p.stat().st_size <= settings.max_pdf_bytes for p in files)
    assert not any(p.suffix == ".part" for p in files)


async def test_display_name_is_sanitised(client: AsyncClient) -> None:
    headers = await _auth(client)
    response = await _upload(
        client, headers, "../../etc/passwd<script>.pdf", "application/pdf", PDF
    )
    assert response.status_code == 201
    assert response.json()["name"] == "passwdscript.pdf"


# --- ownership & lifecycle -------------------------------------------------------------


async def test_documents_are_private_and_delete_removes_file(client: AsyncClient) -> None:
    owner = await _auth(client)
    other = await _auth(client)
    uploaded = (await _upload(client, owner, "mine.pdf", "application/pdf", PDF)).json()
    doc_id = uploaded["id"]

    assert (await client.get(f"/api/v1/documents/{doc_id}", headers=other)).status_code == 404
    assert (await client.get(f"/api/v1/documents/{doc_id}/content", headers=other)).status_code == 404
    assert (await client.delete(f"/api/v1/documents/{doc_id}", headers=other)).status_code == 404
    assert (await client.get("/api/v1/documents", headers=other)).json()["total"] == 0

    listed = await client.get("/api/v1/documents", headers=owner)
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == doc_id

    before = {p for p in _storage_root().rglob("*.pdf")}
    deleted = await client.delete(f"/api/v1/documents/{doc_id}", headers=owner)
    assert deleted.status_code == 204
    after = {p for p in _storage_root().rglob("*.pdf")}
    assert len(before - after) == 1  # exactly this document's file is gone

    assert (await client.get(f"/api/v1/documents/{doc_id}", headers=owner)).status_code == 404
