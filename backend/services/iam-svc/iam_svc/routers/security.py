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
    logger.info(
        "mfa_policy_updated",
        force_mfa=payload.force_mfa,
        by=current_user.username,
    )
    return MfaPolicyResponse(force_mfa=bool(updated["force_mfa"]))
