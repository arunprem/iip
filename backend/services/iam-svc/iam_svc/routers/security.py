"""System-wide security policy (SYSTEM_ADMIN)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.auth import CurrentUser
from iip_core.db import get_db
from iip_core.logging import get_logger
from iam_svc.dependencies import require_system_admin_user
from iam_svc.repositories.system_settings_repository import SystemSettingsRepository
from iam_svc.services.notification_dispatch import publish_to_active_users
from iam_svc.services.notification_events import mfa_policy_changed_event

router = APIRouter()
logger = get_logger(__name__)


class MfaPolicyResponse(BaseModel):
    force_mfa: bool


class MfaPolicyUpdateRequest(BaseModel):
    force_mfa: bool


@router.get("/mfa-policy", response_model=MfaPolicyResponse)
async def get_mfa_policy(
    _: Annotated[CurrentUser, Depends(require_system_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MfaPolicyResponse:
    security = await SystemSettingsRepository(db).get_security()
    return MfaPolicyResponse(force_mfa=bool(security["force_mfa"]))


@router.patch("/mfa-policy", response_model=MfaPolicyResponse)
async def update_mfa_policy(
    payload: MfaPolicyUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(require_system_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MfaPolicyResponse:
    import uuid

    repo = SystemSettingsRepository(db)
    updated = await repo.set_force_mfa(
        payload.force_mfa,
        uuid.UUID(current_user.user_id),
    )
    force_mfa = bool(updated["force_mfa"])
    logger.info(
        "mfa_policy_updated",
        force_mfa=force_mfa,
        by=current_user.username,
    )

    event = mfa_policy_changed_event(force_mfa=force_mfa, changed_by=current_user.username)
    await publish_to_active_users(
        db,
        event,
        exclude_user_ids={current_user.user_id},
    )

    return MfaPolicyResponse(force_mfa=force_mfa)
