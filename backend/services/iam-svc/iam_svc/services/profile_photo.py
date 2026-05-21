"""Profile photo storage on local disk."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import UploadFile

PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024
ALLOWED_PHOTO_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def profile_photos_dir() -> Path:
    configured = os.getenv("IAM_PROFILE_PHOTOS_DIR")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[1] / "data" / "profile-photos"


def profile_photo_api_path() -> str:
    return "/api/v1/auth/me/photo"


def profile_photo_url(user_id: str | uuid.UUID, has_photo: bool) -> str | None:
    if not has_photo:
        return None
    return profile_photo_api_path()


def photo_filename(user_id: str | uuid.UUID, extension: str) -> str:
    return f"{user_id}{extension}"


def resolve_photo_file(stored_path: str | None) -> Path | None:
    if not stored_path:
        return None
    path = profile_photos_dir() / stored_path
    if path.is_file():
        return path
    return None


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

    directory = profile_photos_dir()
    directory.mkdir(parents=True, exist_ok=True)

    filename = photo_filename(user_id, extension)
    target = directory / filename
    target.write_bytes(data)

    # Remove other extensions for this user after a format change
    for ext in ALLOWED_PHOTO_CONTENT_TYPES.values():
        if ext == extension:
            continue
        stale = directory / photo_filename(user_id, ext)
        if stale.is_file():
            stale.unlink()

    return filename


def delete_profile_photo_file(stored_path: str | None) -> None:
    path = resolve_photo_file(stored_path)
    if path and path.is_file():
        path.unlink()
