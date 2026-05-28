"""Store suspect dossier photos in MinIO."""

from __future__ import annotations

from fastapi import UploadFile

from iip_core.object_storage import (
    SUSPECT_PHOTOS_PREFIX,
    get_object_storage,
    suspect_photo_draft_prefix,
    suspect_photo_object_key,
)

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def validate_suspect_photo_storage_key(
    dossier_draft_id: str,
    photo_id: str,
    storage_key: str,
) -> None:
    prefix = f"{SUSPECT_PHOTOS_PREFIX}/{dossier_draft_id}/{photo_id}"
    if not storage_key.startswith(prefix):
        raise ValueError("invalid_storage_key")


async def save_suspect_photo(
    dossier_draft_id: str,
    photo_id: str,
    upload: UploadFile,
    *,
    max_bytes: int,
) -> str:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    extension = ALLOWED_CONTENT_TYPES.get(content_type)
    if not extension:
        raise ValueError("unsupported_type")

    data = await upload.read()
    if not data:
        raise ValueError("empty_file")
    if len(data) > max_bytes:
        raise ValueError("too_large")

    storage = get_object_storage()
    if not storage.enabled:
        raise RuntimeError("object_storage_unavailable")

    object_key = suspect_photo_object_key(dossier_draft_id, photo_id, extension)
    await storage.put(object_key, data, content_type)
    return object_key


async def delete_suspect_photo_blob(
    dossier_draft_id: str,
    photo_id: str,
    storage_key: str,
) -> None:
    validate_suspect_photo_storage_key(dossier_draft_id, photo_id, storage_key)
    storage = get_object_storage()
    if not storage.enabled:
        raise RuntimeError("object_storage_unavailable")
    await storage.delete(storage_key)


async def discard_draft_photos(dossier_draft_id: str) -> None:
    """Remove all MinIO objects for an abandoned dossier draft."""
    storage = get_object_storage()
    if not storage.enabled:
        raise RuntimeError("object_storage_unavailable")
    await storage.delete_prefix(suspect_photo_draft_prefix(dossier_draft_id))
