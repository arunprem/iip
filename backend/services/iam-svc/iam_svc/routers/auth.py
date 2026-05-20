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


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class MeResponse(BaseModel):
    user_id: str
    username: str
    roles: list[str]
    groups: list[str]
    clearance_level: str
    jit_elevated: bool


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> TokenResponse:
    """Authenticate a user and return access + refresh tokens.

    In a full implementation, credentials are validated against the users table.
    JIT sessions and MFA challenges are triggered here based on user clearance.
    """
    # TODO: Replace stub with real database lookup via UserRepository
    # For now: stub admin user for local development
    if payload.username != "admin" or payload.password != "admin":
        logger.warning("login_failed", username=payload.username)
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    jti = str(uuid.uuid4())
    token_payload = {
        "sub": "00000000-0000-0000-0000-000000000001",
        "jti": jti,
        "username": payload.username,
        "roles": ["ANALYST", "SYSTEM_ADMIN"],
        "groups": ["intelligence-wing"],
        "clearance_level": "CONFIDENTIAL",
        "jit_elevated": False,
    }

    access_token = create_access_token(token_payload, settings)
    refresh_token = create_refresh_token("00000000-0000-0000-0000-000000000001", jti, settings)

    logger.info("login_success", username=payload.username)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


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
) -> MeResponse:
    """Return the authenticated user's identity, roles, and clearance level."""
    return MeResponse(
        user_id=current_user.user_id,
        username=current_user.username,
        roles=current_user.roles,
        groups=current_user.groups,
        clearance_level=current_user.clearance_level.value,
        jit_elevated=current_user.jit_elevated,
    )
