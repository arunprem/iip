"""IAM-specific FastAPI dependencies."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.auth import CurrentUser, bearer_scheme, get_current_user
from iip_core.db import get_db
from iip_core.settings import BaseServiceSettings, ClassificationLevel, get_settings
from iam_svc.models.role import Role
from iam_svc.repositories.office_repository import OfficeRepository
from iam_svc.repositories.user_repository import UserRepository
from iam_svc.services.permission_service import PermissionService


async def get_current_user_db(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CurrentUser:
    user = await get_current_user(credentials, settings)
    repo = UserRepository(db)
    if settings.keycloak_enabled:
        db_user = await repo.get_by_username(user.username)
    else:
        db_user = await repo.get_by_id(user.user_id)
    if not db_user or not db_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is invalid. Please sign in again.",
        )
    office_repo_role_names: list[str] = []
    assignments = await OfficeRepository(db).get_user_offices(db_user.id)
    if assignments:
        office_repo_role_names = [a.role.role_name for a in assignments]
    roles = office_repo_role_names if office_repo_role_names else [r.role_name for r in db_user.roles]
    return user.model_copy(
        update={
            "user_id": str(db_user.id),
            "roles": roles,
            "groups": [db_user.department],
            "clearance_level": ClassificationLevel(db_user.clearance_level),
        }
    )


async def get_office_id(
    x_office_id: Annotated[str | None, Header(alias="X-Office-Id")] = None,
) -> uuid.UUID:
    if not x_office_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Office-Id header is required.",
        )
    try:
        return uuid.UUID(x_office_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid X-Office-Id format.",
        ) from exc


async def get_office_role(
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Role:
    role = await PermissionService(db).get_user_office_role(current_user.user_id, office_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this office.",
        )
    return role


def require_system_admin_role(
    role: Annotated[Role, Depends(get_office_role)],
) -> Role:
    if role.role_name not in ("SYSTEM_ADMIN", "IT_ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action.",
        )
    return role


def require_system_admin_user(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
) -> CurrentUser:
    """System admin check without requiring X-Office-Id (global reference data)."""
    if not any(r in ("SYSTEM_ADMIN", "IT_ADMIN") for r in current_user.roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action.",
        )
    return current_user
