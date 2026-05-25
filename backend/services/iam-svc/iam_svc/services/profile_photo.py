"""Profile photo storage in MinIO (S3-compatible object storage)."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import UploadFile

from iip_core.object_storage import (
    get_object_storage,
    is_object_storage_key,
    profile_photo_object_key,
    profile_photo_prefix,
)

PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024
ALLOWED_PHOTO_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

EXTENSION_TO_MEDIA = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def profile_photo_api_path() -> str:
    return "/api/v1/auth/me/photo"


def profile_photo_url(user_id: str | uuid.UUID, has_photo: bool) -> str | None:
    if not has_photo:
        return None
    return profile_photo_api_path()


def _content_type_for_key(key: str) -> str:
    suffix = Path(key).suffix.lower()
    return EXTENSION_TO_MEDIA.get(suffix, "application/octet-stream")


def _object_key_for_stored_path(stored_path: str) -> str | None:
    if is_object_storage_key(stored_path):
        return stored_path

    suffix = Path(stored_path).suffix.lower()
    if suffix not in EXTENSION_TO_MEDIA:
        return None
    user_part = stored_path[: -len(suffix)]
    try:
        uid = uuid.UUID(user_part)
    except ValueError:
        return None
    return profile_photo_object_key(uid, suffix)


async def save_profile_photo(user_id: uuid.UUID, upload: UploadFile) -> str:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    extension = ALLOWED_PHOTO_CONTENT_TYPES.get(content_type)
    if not extension:
        raise ValueError("unsupported_type")

    data = await upload.read()
    if not data:
        raise ValueError("empty_file")
    if len(data) > PROFILE_PHOTO_MAX_BYTES:
        raise ValueError("too_large")

    storage = get_object_storage()
    if not storage.enabled:
        raise RuntimeError("object_storage_unavailable")

    object_key = profile_photo_object_key(user_id, extension)
    await storage.put(object_key, data, content_type)
    await storage.delete_prefix(profile_photo_prefix(user_id), keep_key=object_key)
    return object_key


async def load_profile_photo(stored_path: str | None) -> tuple[bytes, str] | None:
    if not stored_path:
        return None

    storage = get_object_storage()
    if not storage.enabled:
        return None

    object_key = _object_key_for_stored_path(stored_path)
    if not object_key:
        return None

    result = await storage.get(object_key)
    if not result:
        return None

    data, content_type = result
    if content_type == "application/octet-stream":
        content_type = _content_type_for_key(object_key)
    return data, content_type


async def delete_profile_photo(stored_path: str | None) -> None:
    if not stored_path:
        return
    object_key = _object_key_for_stored_path(stored_path)
    if object_key:
        await get_object_storage().delete(object_key)
