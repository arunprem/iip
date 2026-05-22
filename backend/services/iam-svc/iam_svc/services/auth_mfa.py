"""Bridge Keycloak tokens with MFA challenge / enrollment."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.keycloak import keycloak_token_response
from iip_core.settings import BaseServiceSettings
from iam_svc.models.user import User
from iam_svc.repositories.system_settings_repository import SystemSettingsRepository
from iam_svc.services.mfa_pending_store import MfaPendingSession, create_pending_session
from iam_svc.services.mfa_service import user_is_mfa_enrolled, user_must_use_mfa


class AuthResultResponse(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
    mfa_required: bool = False
    mfa_token: str | None = None
    enrollment_required: bool = False


async def build_auth_result(
    *,
    user: User,
    keycloak_payload: dict,
    db: AsyncSession,
    redis: Redis | None,
    settings: BaseServiceSettings,
    purpose: Literal["login", "unlock"],
) -> AuthResultResponse:
    tokens = keycloak_token_response(keycloak_payload)
    security = await SystemSettingsRepository(db).get_security()
    force_mfa = bool(security["force_mfa"])

    if not user_must_use_mfa(user, force_mfa):
        return AuthResultResponse(
            access_token=str(tokens["access_token"]),
            refresh_token=str(tokens["refresh_token"]),
            expires_in=int(tokens["expires_in"]),
        )

    enrolled = user_is_mfa_enrolled(user)
    pending = MfaPendingSession(
        user_id=str(user.id),
        username=user.username,
        access_token=str(tokens["access_token"]),
        refresh_token=str(tokens["refresh_token"]),
        expires_in=int(tokens["expires_in"]),
        purpose=purpose,
        enrollment_required=not enrolled,
    )
    mfa_token = await create_pending_session(redis, pending)

    return AuthResultResponse(
        mfa_required=True,
        mfa_token=mfa_token,
        enrollment_required=not enrolled,
    )
