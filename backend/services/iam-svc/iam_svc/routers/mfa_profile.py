"""Self-service MFA management for authenticated users."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.auth import CurrentUser
from iip_core.db import get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings, get_settings
from iam_svc.cache import get_redis
from iam_svc.dependencies import get_current_user_db
from iam_svc.repositories.system_settings_repository import SystemSettingsRepository
from iam_svc.repositories.user_repository import UserRepository
from iam_svc.services.mfa_service import (
    build_provisioning_uri,
    encrypt_secret,
    generate_totp_secret,
    qr_code_data_url,
    user_can_disable_mfa,
    user_is_mfa_enrolled,
    verify_raw_secret,
    verify_totp_code,
)

router = APIRouter()
logger = get_logger(__name__)

MFA_SETUP_TTL = 600


class MfaStatusResponse(BaseModel):
    mfa_enabled: bool
    mfa_enrolled: bool
    force_mfa: bool
    can_disable: bool


class MfaSetupResponse(BaseModel):
    otpauth_uri: str
    qr_code_data_url: str
    manual_entry_key: str
    setup_token: str


class MfaEnableRequest(BaseModel):
    setup_token: str = Field(min_length=16, max_length=64)
    code: str = Field(min_length=6, max_length=8)


class MfaDisableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


async def _save_setup_secret(redis: Redis | None, setup_token: str, user_id: str, secret: str) -> None:
    import json

    payload = json.dumps({"user_id": user_id, "secret": secret})
    key = f"mfa_setup:{setup_token}"
    if redis is not None:
        try:
            await redis.setex(key, MFA_SETUP_TTL, payload)
            return
        except Exception:
            pass


async def _get_setup_secret(redis: Redis | None, setup_token: str, user_id: str) -> str | None:
    import json

    key = f"mfa_setup:{setup_token}"
    if redis is not None:
        try:
            raw = await redis.get(key)
            if raw:
                data = json.loads(raw.decode("utf-8"))
                if data.get("user_id") == user_id:
                    return data.get("secret")
        except Exception:
            pass
    return None


async def _delete_setup_secret(redis: Redis | None, setup_token: str) -> None:
    if redis is None:
        return
    try:
        await redis.delete(f"mfa_setup:{setup_token}")
    except Exception:
        pass


@router.get("/status", response_model=MfaStatusResponse)
async def mfa_status(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MfaStatusResponse:
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(current_user.user_id)
    security = await SystemSettingsRepository(db).get_security()
    force_mfa = bool(security["force_mfa"])
    enrolled = user_is_mfa_enrolled(user)
    return MfaStatusResponse(
        mfa_enabled=bool(user.mfa_enabled),
        mfa_enrolled=enrolled,
        force_mfa=force_mfa,
        can_disable=user_can_disable_mfa(user, force_mfa),
    )


@router.post("/setup", response_model=MfaSetupResponse)
async def mfa_setup(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> MfaSetupResponse:
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(current_user.user_id)
    if user_is_mfa_enrolled(user):
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Two-factor authentication is already enabled.",
        )

    secret = generate_totp_secret()
    setup_token = secrets.token_urlsafe(24)
    await _save_setup_secret(redis, setup_token, current_user.user_id, secret)

    uri = build_provisioning_uri(user.username, secret)
    return MfaSetupResponse(
        otpauth_uri=uri,
        qr_code_data_url=qr_code_data_url(uri),
        manual_entry_key=secret,
        setup_token=setup_token,
    )


@router.post("/enable", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_enable(
    payload: MfaEnableRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> None:
    secret = await _get_setup_secret(redis, payload.setup_token, current_user.user_id)
    if not secret:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Setup expired. Start setup again.",
        )

    if not verify_raw_secret(secret, payload.code):
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Invalid authentication code.",
            meta={"field": "code"},
        )

    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(current_user.user_id)
    user.mfa_secret = encrypt_secret(settings, secret)
    user.mfa_enabled = True
    await repo.update(user)
    await _delete_setup_secret(redis, payload.setup_token)
    logger.info("mfa_enabled", username=user.username)


@router.post("/disable", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_disable(
    payload: MfaDisableRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> None:
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(current_user.user_id)
    security = await SystemSettingsRepository(db).get_security()
    force_mfa = bool(security["force_mfa"])

    if not user_can_disable_mfa(user, force_mfa):
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="Your organization requires two-factor authentication. You cannot disable it.",
        )

    if not verify_totp_code(settings, user, payload.code):
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Invalid authentication code.",
            meta={"field": "code"},
        )

    user.mfa_enabled = False
    user.mfa_secret = None
    await repo.update(user)
    logger.info("mfa_disabled", username=user.username)
