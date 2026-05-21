"""
IAM Service — Authentication Router.

Handles:
  - POST /login          : Username/password → JWT access + refresh tokens
  - POST /refresh        : Rotate refresh token
  - POST /logout         : Revoke session (blacklist in Redis)
  - GET  /me             : Return current user's identity and clearance
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.auth import (
    CurrentUser,
    create_access_token,
    create_refresh_token,
    get_current_user,
    verify_password,
)
from redis.asyncio import Redis
from iam_svc.cache import get_redis
from iam_svc.services.captcha_store import consume_captcha
from iam_svc.repositories.office_repository import OfficeRepository
from iam_svc.repositories.user_repository import UserRepository
from iip_core.db import get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings, get_settings

router = APIRouter()
logger = get_logger(__name__)


# ─── Request / Response Models ────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str
    password: str
    captcha_id: str
    captcha_code: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class OfficeAssignment(BaseModel):
    office_id: str
    office_code: str
    office_name: str
    role_id: str
    role_name: str


class MeResponse(BaseModel):
    user_id: str
    username: str
    email: str = ""
    full_name: str = ""
    badge_number: str = ""
    department: str = ""
    roles: list[str]
    groups: list[str]
    clearance_level: str
    jit_elevated: bool
    offices: list[OfficeAssignment] = []
    default_office_id: str | None = None
    profile_photo_url: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class UnlockRequest(BaseModel):
    username: str
    password: str
    captcha_id: str
    captcha_code: str


def _pick_default_office_id(offices: list[OfficeAssignment]) -> str | None:
    """Prefer PHQ, then any office where the user is a system admin."""
    if not offices:
        return None
    for preferred_code in ("PHQ",):
        for office in offices:
            if office.office_code == preferred_code:
                return office.office_id
    for office in offices:
        if office.role_name in ("SYSTEM_ADMIN", "IT_ADMIN"):
            return office.office_id
    return offices[0].office_id


async def _validate_captcha(
    redis: Redis,
    captcha_id: str,
    captcha_code: str,
) -> None:
    stored_captcha = await consume_captcha(redis, captcha_id)

    if not stored_captcha:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Security code expired. Please refresh and try again.",
            meta={"field": "captcha_code"},
        )

    if stored_captcha.upper() != captcha_code.upper():
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Wrong security code.",
            meta={"field": "captcha_code"},
        )


async def _issue_tokens_for_user(
    user,
    db: AsyncSession,
    settings: BaseServiceSettings,
) -> TokenResponse:
    jti = str(uuid.uuid4())
    office_repo = OfficeRepository(db)
    office_assignments = await office_repo.get_user_offices(user.id)
    roles = (
        [a.role.role_name for a in office_assignments]
        if office_assignments
        else [role.role_name for role in user.roles]
    )
    token_payload = {
        "sub": str(user.id),
        "jti": jti,
        "username": user.username,
        "roles": roles,
        "groups": [user.department],
        "clearance_level": user.clearance_level,
        "jit_elevated": False,
    }
    access_token = create_access_token(token_payload, settings)
    refresh_token = create_refresh_token(str(user.id), jti, settings)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> TokenResponse:
    """Authenticate a user and return access + refresh tokens.

    In a full implementation, credentials are validated against the users table.
    JIT sessions and MFA challenges are triggered here based on user clearance.
    """
    repo = UserRepository(db)
    user = await repo.get_by_username(payload.username)

    await _validate_captcha(redis, payload.captcha_id, payload.captcha_code)

    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        logger.warning("login_failed", username=payload.username)
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    logger.info("login_success", username=payload.username, user_id=str(user.id))

    return await _issue_tokens_for_user(user, db, settings)


@router.post("/unlock", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def unlock_session(
    payload: UnlockRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> TokenResponse:
    """Re-authenticate the current user after idle lock or token expiry (password + captcha only)."""
    await _validate_captcha(redis, payload.captcha_id, payload.captcha_code)

    repo = UserRepository(db)
    user = await repo.get_by_username(payload.username)

    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        logger.warning("unlock_failed", username=payload.username)
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    logger.info("unlock_success", username=payload.username, user_id=str(user.id))
    return await _issue_tokens_for_user(user, db, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> None:
    """Invalidate the current user's session.

    In production, adds the JTI to a Redis blacklist until token expiry.
    """
    # TODO: Blacklist token JTI in Redis
    logger.info("logout", user_id=current_user.user_id, jti=current_user.token_jti)


@router.get("/me", response_model=MeResponse)
async def get_me(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeResponse:
    """Return the authenticated user's identity, roles, and clearance level."""
    from iam_svc.services.profile_photo import profile_photo_url

    repo = UserRepository(db)
    db_user = await repo.get_by_id_or_error(current_user.user_id)
    office_repo = OfficeRepository(db)
    assignments = await office_repo.get_user_offices(current_user.user_id)
    offices = [
        OfficeAssignment(
            office_id=str(a.office_id),
            office_code=a.office.office_code,
            office_name=a.office.office_name,
            role_id=str(a.role_id),
            role_name=a.role.role_name,
        )
        for a in assignments
    ]
    roles = [o.role_name for o in offices] if offices else current_user.roles
    default_office_id = _pick_default_office_id(offices)

    return MeResponse(
        user_id=current_user.user_id,
        username=current_user.username,
        email=db_user.email,
        full_name=db_user.full_name,
        badge_number=db_user.badge_number,
        department=db_user.department,
        roles=roles,
        groups=current_user.groups,
        clearance_level=current_user.clearance_level.value,
        jit_elevated=current_user.jit_elevated,
        offices=offices,
        default_office_id=default_office_id,
        profile_photo_url=profile_photo_url(db_user.id, bool(db_user.profile_photo_path)),
    )
