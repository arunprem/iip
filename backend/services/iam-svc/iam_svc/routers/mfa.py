"""MFA verification and enrollment during login / unlock."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.db import get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings, get_settings
from iam_svc.cache import get_redis
from iam_svc.repositories.user_repository import UserRepository
from iam_svc.routers.auth import TokenResponse
from iam_svc.services.mfa_pending_store import consume_pending_session, get_pending_session, update_pending_session
from iam_svc.services.mfa_service import (
    build_provisioning_uri,
    encrypt_secret,
    generate_totp_secret,
    qr_code_data_url,
    verify_raw_secret,
    verify_totp_code,
)

router = APIRouter()
logger = get_logger(__name__)


class MfaVerifyRequest(BaseModel):
    mfa_token: str = Field(min_length=16, max_length=256)
    code: str = Field(min_length=6, max_length=8)


class MfaEnrollmentSetupRequest(BaseModel):
    mfa_token: str = Field(min_length=16, max_length=256)


class MfaEnrollmentSetupResponse(BaseModel):
    otpauth_uri: str
    qr_code_data_url: str
    manual_entry_key: str


class MfaEnrollmentCompleteRequest(BaseModel):
    mfa_token: str = Field(min_length=16, max_length=256)
    code: str = Field(min_length=6, max_length=8)


@router.post("/verify", response_model=TokenResponse)
async def verify_mfa(
    payload: MfaVerifyRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Optional[Redis], Depends(get_redis)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> TokenResponse:
    session = await consume_pending_session(redis, payload.mfa_token)
    if not session:
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="MFA session expired. Please sign in again.",
        )
    if session.enrollment_required:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Two-factor enrollment is required before you can sign in.",
        )

    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(session.user_id)
    if not verify_totp_code(settings, user, payload.code):
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="Invalid authentication code. Try again.",
            meta={"field": "code"},
        )

    logger.info("mfa_verify_success", username=user.username, purpose=session.purpose)
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
    )


@router.post("/enrollment/setup", response_model=MfaEnrollmentSetupResponse)
async def enrollment_setup(
    payload: MfaEnrollmentSetupRequest,
    redis: Annotated[Optional[Redis], Depends(get_redis)],
) -> MfaEnrollmentSetupResponse:
    session = await get_pending_session(redis, payload.mfa_token)
    if not session or not session.enrollment_required:
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="MFA enrollment session expired. Please sign in again.",
        )

    secret = generate_totp_secret()
    session.setup_secret = secret
    await update_pending_session(redis, payload.mfa_token, session)

    uri = build_provisioning_uri(session.username, secret)
    return MfaEnrollmentSetupResponse(
        otpauth_uri=uri,
        qr_code_data_url=qr_code_data_url(uri),
        manual_entry_key=secret,
    )


@router.post("/enrollment/complete", response_model=TokenResponse)
async def enrollment_complete(
    payload: MfaEnrollmentCompleteRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Optional[Redis], Depends(get_redis)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> TokenResponse:
    session = await consume_pending_session(redis, payload.mfa_token)
    if not session or not session.enrollment_required or not session.setup_secret:
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="MFA enrollment session expired. Please sign in again.",
        )

    if not verify_raw_secret(session.setup_secret, payload.code):
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Invalid authentication code. Scan the QR code again and enter the latest code.",
            meta={"field": "code"},
        )

    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(session.user_id)
    user.mfa_secret = encrypt_secret(settings, session.setup_secret)
    user.mfa_enabled = True
    await repo.update(user)

    logger.info("mfa_enrollment_complete", username=user.username)
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
    )
