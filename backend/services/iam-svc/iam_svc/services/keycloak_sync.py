"""Helpers to mirror IAM user lifecycle into Keycloak."""

from __future__ import annotations

from iip_core.errors import ErrorCode, IIPException
from iip_core.keycloak import KeycloakAuthError, keycloak_password_grant
from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings
from iam_svc.models.user import User
from iam_svc.services.keycloak_admin import KeycloakAdminService

logger = get_logger(__name__)


async def sync_user_credentials(
    settings: BaseServiceSettings,
    user: User,
    password: str,
    *,
    enabled: bool | None = None,
) -> None:
    if not settings.keycloak_enabled:
        return
    active = enabled if enabled is not None else user.is_active
    try:
        await KeycloakAdminService(settings).upsert_user(
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            password=password,
            enabled=active,
        )
    except Exception as exc:
        logger.exception("keycloak_sync_failed", username=user.username)
        raise IIPException(
            status_code=500,
            error_code=ErrorCode.INTERNAL_ERROR,
            detail="Failed to synchronize user credentials with Keycloak.",
        ) from exc


async def set_user_enabled(settings: BaseServiceSettings, username: str, enabled: bool) -> None:
    if not settings.keycloak_enabled:
        return
    try:
        await KeycloakAdminService(settings).set_enabled(username, enabled)
    except Exception as exc:
        logger.exception("keycloak_enable_failed", username=username, enabled=enabled)
        raise IIPException(
            status_code=500,
            error_code=ErrorCode.INTERNAL_ERROR,
            detail="Failed to update user status in Keycloak.",
        ) from exc


async def verify_password_with_keycloak(
    settings: BaseServiceSettings,
    username: str,
    password: str,
) -> bool:
    try:
        await keycloak_password_grant(username, password, settings)
        return True
    except KeycloakAuthError:
        return False
