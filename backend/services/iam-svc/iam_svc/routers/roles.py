"""
IAM Service — Roles Router.

Handles:
  - GET    /                        : List all defined roles
  - POST   /                        : Create a new role definition
  - PATCH  /{role_id}               : Update role metadata
  - DELETE /{role_id}               : Delete role
  - GET    /{role_id}/deletion-check: Check if role can be deleted
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

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
    privileges: list[str] = []
    requires_jit: bool


class CreateRoleRequest(BaseModel):
    role_name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1)
    privileges: list[str] = []
    requires_jit: bool = False


class UpdateRoleRequest(BaseModel):
    description: str | None = None
    requires_jit: bool | None = None


class RoleDeletionCheckResponse(BaseModel):
    can_delete: bool
    blockers: list[str]


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
    
    role_name = payload.role_name.strip().upper().replace(" ", "_").replace("-", "_")
    new_role = Role(
        role_name=role_name,
        description=payload.description.strip(),
        requires_jit=payload.requires_jit,
    )
    created_role = await repo.create(new_role)
    
    logger.info("role_create_requested", role_name=payload.role_name, by=current_user.role_name)
    
    return _to_response(created_role)


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RoleResponse:
    role = await RoleRepository(db).get_by_id_or_error(role_id)
    return _to_response(role)


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    payload: UpdateRoleRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RoleResponse:
    repo = RoleRepository(db)
    role = await repo.get_by_id_or_error(role_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(role, key, value)
    updated = await repo.update(role)
    return _to_response(updated)


@router.get("/{role_id}/deletion-check", response_model=RoleDeletionCheckResponse)
async def check_role_deletion(
    role_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RoleDeletionCheckResponse:
    blockers = await RoleRepository(db).get_deletion_blockers(role_id)
    return RoleDeletionCheckResponse(can_delete=len(blockers) == 0, blockers=blockers)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    current_user: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    repo = RoleRepository(db)
    role = await repo.get_by_id_or_error(role_id)
    await repo.delete(role_id)
    logger.info("role_deleted", role_name=role.role_name, by=current_user.role_name)


def _to_response(role: Role) -> RoleResponse:
    return RoleResponse(
        role_id=str(role.id),
        role_name=role.role_name,
        description=role.description,
        privileges=[],
        requires_jit=role.requires_jit,
    )
