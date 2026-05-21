"""
IAM Service — Roles Router.

Handles:
  - GET  /           : List all defined roles
  - POST /           : Create a new role definition
  - GET  /{role_id}  : Get role details and associated privileges
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from iip_core.db import AsyncSession, get_db
from iip_core.logging import get_logger
from iam_svc.dependencies import require_system_admin_role
from iam_svc.repositories.role_repository import RoleRepository
from iam_svc.models.role import Role

router = APIRouter()
logger = get_logger(__name__)


class RoleResponse(BaseModel):
    role_id: str
    role_name: str
    description: str
    privileges: list[str]
    requires_jit: bool


class CreateRoleRequest(BaseModel):
    role_name: str
    description: str
    privileges: list[str]
    requires_jit: bool = False


@router.get("/", response_model=list[RoleResponse])
async def list_roles(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[RoleResponse]:
    """List all IIP roles — admin only."""
    repo = RoleRepository(db)
    roles = await repo.list_roles()
    return [
        RoleResponse(
            role_id=str(r.id),
            role_name=r.role_name,
            description=r.description,
            privileges=[],  # Privileges implementation TBD based on OPA
            requires_jit=r.requires_jit,
        ) for r in roles
    ]


@router.post("/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: CreateRoleRequest,
    current_user: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RoleResponse:
    """Define a new IIP role — admin only. Dual approval required for JIT roles."""
    repo = RoleRepository(db)
    
    new_role = Role(
        role_name=payload.role_name,
        description=payload.description,
        requires_jit=payload.requires_jit,
    )
    created_role = await repo.create(new_role)
    
    logger.info("role_create_requested", role_name=payload.role_name, by=current_user.role_name)
    
    return RoleResponse(
        role_id=str(created_role.id),
        role_name=created_role.role_name,
        description=created_role.description,
        privileges=[],
        requires_jit=created_role.requires_jit,
    )
