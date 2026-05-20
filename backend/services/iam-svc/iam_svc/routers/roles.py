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

from iip_core.auth import CurrentUser, require_role
from iip_core.logging import get_logger

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
    _: Annotated[CurrentUser, Depends(require_role("SYSTEM_ADMIN"))],
) -> list[RoleResponse]:
    """List all IIP roles — admin only."""
    # TODO: Implement RoleRepository.list()
    return []


@router.post("/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: CreateRoleRequest,
    current_user: Annotated[CurrentUser, Depends(require_role("SYSTEM_ADMIN"))],
) -> RoleResponse:
    """Define a new IIP role — admin only. Dual approval required for JIT roles."""
    logger.info("role_create_requested", role_name=payload.role_name, by=current_user.username)
    # TODO: Implement RoleRepository.create() + AuditLogger.log(ROLE_CREATED)
    raise NotImplementedError
