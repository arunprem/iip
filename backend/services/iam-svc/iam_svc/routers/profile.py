"""Self-service profile, password, and photo for the signed-in user."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field

from iip_core.auth import CurrentUser, hash_password
from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings, get_settings
from iam_svc.dependencies import get_current_user_db
from iam_svc.services.keycloak_sync import sync_user_credentials, verify_password_with_keycloak
from iam_svc.repositories.user_repository import UserRepository
from iam_svc.routers.users import _validate_unique_fields
from iam_svc.services.profile_photo import (
    PROFILE_PHOTO_MAX_BYTES,
    load_profile_photo,
    save_profile_photo,
)

router = APIRouter()
logger = get_logger(__name__)


class ProfileResponse(BaseModel):
    user_id: str
    username: str
    email: str
    full_name: str
    badge_number: str
    department: str
    clearance_level: str
    profile_photo_url: str | None = None


class UpdateProfileRequest(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(None, min_length=1, max_length=255)
    badge_number: str | None = Field(None, min_length=1, max_length=50)
    department: str | None = Field(None, min_length=1, max_length=255)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


def _to_profile_response(user) -> ProfileResponse:
    from iam_svc.services.profile_photo import profile_photo_url

    return ProfileResponse(
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        badge_number=user.badge_number,
        department=user.department,
        clearance_level=user.clearance_level,
        profile_photo_url=profile_photo_url(user.id, bool(user.profile_photo_path)),
    )


@router.get("/profile", response_model=ProfileResponse)
async def get_my_profile(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProfileResponse:
    user = await UserRepository(db).get_by_id_or_error(current_user.user_id)
    return _to_profile_response(user)


@router.patch("/profile", response_model=ProfileResponse)
async def update_my_profile(
    payload: UpdateProfileRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProfileResponse:
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(current_user.user_id)
    user_uuid = user.id

    if not any(
        [
            payload.email is not None,
            payload.full_name is not None,
            payload.badge_number is not None,
            payload.department is not None,
        ]
    ):
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="No profile fields to update.",
        )

    if payload.email is not None:
        await _validate_unique_fields(
            repo, email=str(payload.email), exclude_user_id=user_uuid
        )
        user.email = str(payload.email).strip()
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.badge_number is not None:
        await _validate_unique_fields(
            repo, badge_number=payload.badge_number.strip(), exclude_user_id=user_uuid
        )
        user.badge_number = payload.badge_number.strip()
    if payload.department is not None:
        user.department = payload.department.strip()

    updated = await repo.update(user)
    logger.info("profile_updated", user_id=str(user_uuid), by=current_user.username)
    return _to_profile_response(updated)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_my_password(
    payload: ChangePasswordRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> None:
    if payload.current_password == payload.new_password:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="New password must be different from the current password.",
            meta={"field": "new_password"},
        )

    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(current_user.user_id)

    if not await verify_password_with_keycloak(
        settings, current_user.username, payload.current_password
    ):
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Current password is incorrect.",
            meta={"field": "current_password"},
        )

    user.password_hash = hash_password(payload.new_password)
    await repo.update(user)
    await sync_user_credentials(settings, user, payload.new_password)
    logger.info("password_changed", user_id=str(user.id), by=current_user.username)


@router.post("/photo", response_model=ProfileResponse)
async def upload_my_photo(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> ProfileResponse:
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(current_user.user_id)

    try:
        object_key = await save_profile_photo(user.id, file)
    except RuntimeError as exc:
        if str(exc) == "object_storage_unavailable":
            raise IIPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                error_code=ErrorCode.SERVICE_UNAVAILABLE,
                detail="Photo storage is temporarily unavailable. Please try again later.",
                meta={"field": "file"},
            ) from exc
        raise
    except ValueError as exc:
        reason = str(exc)
        if reason == "unsupported_type":
            detail = "Photo must be JPEG, PNG, or WebP."
            field = "file"
        elif reason == "too_large":
            detail = f"Photo must be {PROFILE_PHOTO_MAX_BYTES // (1024 * 1024)} MB or smaller."
            field = "file"
        else:
            detail = "Photo upload failed."
            field = "file"
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=detail,
            meta={"field": field},
        ) from exc

    user.profile_photo_path = object_key
    updated = await repo.update(user)
    logger.info("profile_photo_uploaded", user_id=str(user.id), by=current_user.username)
    return _to_profile_response(updated)


@router.get("/photo")
async def get_my_photo(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    user = await UserRepository(db).get_by_id_or_error(current_user.user_id)
    loaded = await load_profile_photo(user.profile_photo_path)
    if not loaded:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Profile photo not found.",
        )

    data, content_type = loaded
    return Response(content=data, media_type=content_type)
