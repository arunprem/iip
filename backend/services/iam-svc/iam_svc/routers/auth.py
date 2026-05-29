"""
IAM Service — Authentication Router.

Handles:
  - POST /login          : Captcha + Keycloak password grant → OIDC tokens
  - POST /refresh        : Keycloak refresh token rotation
  - POST /unlock         : Re-auth after session lock (captcha + Keycloak)
  - POST /logout         : Client-side session end (Keycloak revoke optional)
  - GET  /me             : Current user profile from PostgreSQL
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.auth import CurrentUser
from iip_core.errors import ErrorCode, IIPException
from iip_core.keycloak import (
    AuthClientType,
    KeycloakAuthError,
    keycloak_refresh_grant,
    keycloak_token_response,
    normalize_auth_client_type,
)
from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings, get_settings
from redis.asyncio import Redis

from iam_svc.cache import get_redis
from iam_svc.dependencies import get_current_user_db
from iam_svc.repositories.office_repository import OfficeRepository
from iam_svc.repositories.user_repository import UserRepository
from iam_svc.services.auth_mfa import AuthResultResponse, build_auth_result
from iam_svc.services.captcha_store import consume_captcha
from iip_core.db import get_db
from iip_core.keycloak import keycloak_password_grant

router = APIRouter()
logger = get_logger(__name__)


class LoginRequest(BaseModel):
    username: str
    password: str
    captcha_id: str
    captcha_code: str
    client_type: Literal["web", "mobile"] = Field(
        default="web",
        description="web = portal session; mobile = separate Keycloak client (1-day idle)",
    )


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
    client_type: Literal["web", "mobile"] = Field(
        default="web",
        description="Must match the client that issued the refresh token",
    )


class UnlockRequest(BaseModel):
    username: str
    password: str
    captcha_id: str
    captcha_code: str
    client_type: Literal["web", "mobile"] = "web"


def _keycloak_login_detail(exc: KeycloakAuthError, client_type: str) -> str:
    msg = str(exc).strip()
    lower = msg.lower()
    if client_type == "mobile" and "invalid_client" in lower:
        return (
            "Mobile sign-in is not configured in Keycloak. "
            "Run: ./infra/keycloak/ensure-mobile-client.sh"
        )
    if "invalid_grant" in lower or "invalid user" in lower:
        return "Invalid username or password."
    if msg:
        return msg
    return "Invalid username or password."


def _pick_default_office_id(offices: list[OfficeAssignment]) -> str | None:
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
    redis: Redis | None,
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


async def _authenticate_via_keycloak(
    username: str,
    password: str,
    db: AsyncSession,
    redis: Redis,
    settings: BaseServiceSettings,
    *,
    purpose: str,
    client_type: AuthClientType = "web",
) -> AuthResultResponse:
    """Ensure IAM user exists locally, validate password with Keycloak, apply MFA gate."""
    repo = UserRepository(db)
    user = await repo.get_by_username(username.strip())

    if not user or not user.is_active:
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    try:
        kc_payload = await keycloak_password_grant(
            username, password, settings, client_type=client_type
        )
    except KeycloakAuthError as exc:
        logger.warning(
            "keycloak_login_failed",
            username=username,
            client_type=client_type,
            detail=str(exc),
        )
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail=_keycloak_login_detail(exc, client_type),
        ) from exc

    return await build_auth_result(
        user=user,
        keycloak_payload=kc_payload,
        db=db,
        redis=redis,
        settings=settings,
        purpose=purpose,  # type: ignore[arg-type]
    )


@router.post("/login", response_model=AuthResultResponse, status_code=status.HTTP_200_OK)
async def login(
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> AuthResultResponse:
    """Captcha + Keycloak password grant; MFA challenge when required."""
    await _validate_captcha(redis, payload.captcha_id, payload.captcha_code)
    client_type = normalize_auth_client_type(payload.client_type)
    result = await _authenticate_via_keycloak(
        payload.username,
        payload.password,
        db,
        redis,
        settings,
        purpose="login",
        client_type=client_type,
    )
    if not result.mfa_required:
        logger.info("login_success", username=payload.username)
    return result


@router.post("/unlock", response_model=AuthResultResponse, status_code=status.HTTP_200_OK)
async def unlock_session(
    payload: UnlockRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> AuthResultResponse:
    await _validate_captcha(redis, payload.captcha_id, payload.captcha_code)
    client_type = normalize_auth_client_type(payload.client_type)
    result = await _authenticate_via_keycloak(
        payload.username,
        payload.password,
        db,
        redis,
        settings,
        purpose="unlock",
        client_type=client_type,
    )
    if not result.mfa_required:
        logger.info("unlock_success", username=payload.username)
    return result


@router.post("/refresh", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def refresh_tokens(
    payload: RefreshRequest,
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> TokenResponse:
    """Rotate access token using Keycloak refresh token."""
    try:
        client_type = normalize_auth_client_type(payload.client_type)
        token_payload = await keycloak_refresh_grant(
            payload.refresh_token, settings, client_type=client_type
        )
    except KeycloakAuthError as exc:
        raise IIPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
        ) from exc

    tokens = keycloak_token_response(token_payload)
    return TokenResponse(
        access_token=str(tokens["access_token"]),
        refresh_token=str(tokens["refresh_token"]),
        expires_in=int(tokens["expires_in"]),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
) -> None:
    logger.info("logout", user_id=current_user.user_id, jti=current_user.token_jti)


@router.get("/me", response_model=MeResponse)
async def get_me(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeResponse:
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
