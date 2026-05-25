"""Document uploads to MinIO — use for case files, evidence, attachments, etc."""

from __future__ import annotations

import uuid

from fastapi import UploadFile

from iip_core.object_storage import document_object_key, get_object_storage

DOCUMENT_MAX_BYTES = 50 * 1024 * 1024  # 50 MB default cap


async def save_document(
    *,
    domain: str,
    entity_id: str,
    upload: UploadFile,
    file_id: str | None = None,
    max_bytes: int = DOCUMENT_MAX_BYTES,
) -> str:
    """
    Store a document under documents/{domain}/{entity_id}/{file_id}-{filename}.
    Returns the object key to persist in the database.
    """
    storage = get_object_storage()
    if not storage.enabled:
        raise RuntimeError("object_storage_unavailable")

    data = await upload.read()
    if not data:
        raise ValueError("empty_file")
    if len(data) > max_bytes:
        raise ValueError("too_large")

    filename = (upload.filename or "document").strip() or "document"
    content_type = (upload.content_type or "application/octet-stream").split(";")[0].strip()
    key = document_object_key(domain, entity_id, file_id or str(uuid.uuid4()), filename)
    await storage.put(key, data, content_type)
    return key


async def save_document_bytes(
    *,
    domain: str,
    entity_id: str,
    filename: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    file_id: str | None = None,
    max_bytes: int = DOCUMENT_MAX_BYTES,
) -> str:
    storage = get_object_storage()
    if not storage.enabled:
        raise RuntimeError("object_storage_unavailable")
    if not data:
        raise ValueError("empty_file")
    if len(data) > max_bytes:
        raise ValueError("too_large")

    key = document_object_key(domain, entity_id, file_id or str(uuid.uuid4()), filename)
    await storage.put(key, data, content_type)
    return key


async def load_document(object_key: str) -> tuple[bytes, str] | None:
    return await get_object_storage().get(object_key)


async def delete_document(object_key: str) -> None:
    await get_object_storage().delete(object_key)
