"""Privilege and role-permission matrix management."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iam_svc.dependencies import require_system_admin_role
from iam_svc.models.privilege import Privilege
from iam_svc.models.privilege_action import PrivilegeAction
from iam_svc.models.role import Role
from iam_svc.repositories.privilege_repository import PrivilegeRepository
from iam_svc.repositories.role_repository import RoleRepository

router = APIRouter()


class ActionResponse(BaseModel):
    id: str
    action_code: str
    action_label: str
    sort_order: int
    is_active: bool


class PrivilegeResponse(BaseModel):
    id: str
    privilege_code: str
    name: str
    description: str
    module: str
    privilege_type: str
    is_active: bool
    actions: list[ActionResponse] = []


class CreatePrivilegeRequest(BaseModel):
    privilege_code: str
    name: str
    description: str
    module: str
    privilege_type: str = Field(pattern="^(MENU|DATA)$")
    """When true and privilege_type is DATA, creates READ/CREATE/UPDATE/DELETE/EXPORT actions."""
    seed_default_actions: bool = True


class UpdatePrivilegeRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    module: str | None = None
    is_active: bool | None = None


class PrivilegeDeletionCheckResponse(BaseModel):
    can_delete: bool
    blockers: list[str]


class CreateActionRequest(BaseModel):
    action_code: str
    action_label: str
    sort_order: int = 0


class RoleMenuMatrixRow(BaseModel):
    role_id: str
    role_name: str
    privilege_ids: list[str]


class RoleDataMatrixCell(BaseModel):
    action_id: str
    granted: bool


class RoleDataMatrixRow(BaseModel):
    role_id: str
    role_name: str
    privilege_id: str
    privilege_code: str
    actions: list[RoleDataMatrixCell]


class SaveRoleMenuMatrixRequest(BaseModel):
    role_id: str
    privilege_ids: list[str]


class SaveRoleDataMatrixRequest(BaseModel):
    role_id: str
    action_ids: list[str]


@router.get("/", response_model=list[PrivilegeResponse])
async def list_privileges(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    privilege_type: str | None = None,
) -> list[PrivilegeResponse]:
    repo = PrivilegeRepository(db)
    privs = await repo.list_all(privilege_type=privilege_type, include_inactive=True)
    return [_priv_to_response(p) for p in privs]


@router.post("/", response_model=PrivilegeResponse, status_code=status.HTTP_201_CREATED)
async def create_privilege(
    payload: CreatePrivilegeRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PrivilegeResponse:
    repo = PrivilegeRepository(db)
    existing = await repo.get_by_code(payload.privilege_code.strip())
    if existing:
        raise IIPException(
            ErrorCode.CONFLICT,
            f"Privilege code '{payload.privilege_code}' already exists.",
        )

    priv = Privilege(
        privilege_code=payload.privilege_code.strip(),
        name=payload.name.strip(),
        description=(payload.description or payload.name).strip(),
        module=payload.module.strip(),
        privilege_type=payload.privilege_type,
    )
    created = await repo.create(priv)
    if payload.privilege_type == "DATA" and payload.seed_default_actions:
        await repo.seed_default_data_actions(created.id)
        created = await repo.get_by_id_or_error(created.id)
    return _priv_to_response(created)


@router.get("/{privilege_id}/deletion-check", response_model=PrivilegeDeletionCheckResponse)
async def check_privilege_deletion(
    privilege_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PrivilegeDeletionCheckResponse:
    blockers = await PrivilegeRepository(db).get_deletion_blockers(privilege_id)
    return PrivilegeDeletionCheckResponse(
        can_delete=len(blockers) == 0,
        blockers=blockers,
    )


@router.delete("/{privilege_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_privilege(
    privilege_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await PrivilegeRepository(db).delete(privilege_id)


@router.patch("/{privilege_id}", response_model=PrivilegeResponse)
async def update_privilege(
    privilege_id: str,
    payload: UpdatePrivilegeRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PrivilegeResponse:
    repo = PrivilegeRepository(db)
    priv = await repo.get_by_id_or_error(privilege_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(priv, key, value)
    updated = await repo.update(priv)
    return _priv_to_response(updated)


@router.post("/{privilege_id}/actions", response_model=ActionResponse, status_code=status.HTTP_201_CREATED)
async def add_action(
    privilege_id: str,
    payload: CreateActionRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActionResponse:
    repo = PrivilegeRepository(db)
    await repo.get_by_id_or_error(privilege_id)
    action = PrivilegeAction(
        privilege_id=uuid.UUID(privilege_id),
        action_code=payload.action_code,
        action_label=payload.action_label,
        sort_order=payload.sort_order,
    )
    created = await repo.create_action(action)
    return ActionResponse(
        id=str(created.id),
        action_code=created.action_code,
        action_label=created.action_label,
        sort_order=created.sort_order,
        is_active=created.is_active,
    )


@router.delete("/actions/{action_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_action(
    action_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await PrivilegeRepository(db).delete_action(uuid.UUID(action_id))


@router.get("/matrix/menu", response_model=list[RoleMenuMatrixRow])
async def get_menu_matrix(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[RoleMenuMatrixRow]:
    role_repo = RoleRepository(db)
    priv_repo = PrivilegeRepository(db)
    roles = await role_repo.list_roles()
    menu_privs = await priv_repo.list_all(privilege_type="MENU", include_inactive=True)
    _ = menu_privs  # available for UI

    rows = []
    for role in roles:
        pids = await priv_repo.get_role_menu_privilege_ids(role.id)
        rows.append(
            RoleMenuMatrixRow(
                role_id=str(role.id),
                role_name=role.role_name,
                privilege_ids=[str(p) for p in pids],
            )
        )
    return rows


@router.put("/matrix/menu", status_code=status.HTTP_204_NO_CONTENT)
async def save_menu_matrix(
    payload: SaveRoleMenuMatrixRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    priv_repo = PrivilegeRepository(db)
    await priv_repo.set_role_menu_privileges(
        uuid.UUID(payload.role_id),
        [uuid.UUID(p) for p in payload.privilege_ids],
    )


@router.get("/matrix/data", response_model=list[RoleDataMatrixRow])
async def get_data_matrix(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[RoleDataMatrixRow]:
    role_repo = RoleRepository(db)
    priv_repo = PrivilegeRepository(db)
    roles = await role_repo.list_roles()
    data_privs = await priv_repo.list_all(privilege_type="DATA", include_inactive=True)

    rows: list[RoleDataMatrixRow] = []
    for role in roles:
        granted_ids = set(await priv_repo.get_role_action_ids(role.id))
        for priv in data_privs:
            cells = [
                RoleDataMatrixCell(
                    action_id=str(a.id),
                    granted=a.id in granted_ids,
                )
                for a in sorted(priv.actions, key=lambda x: x.sort_order)
            ]
            if cells:
                rows.append(
                    RoleDataMatrixRow(
                        role_id=str(role.id),
                        role_name=role.role_name,
                        privilege_id=str(priv.id),
                        privilege_code=priv.privilege_code,
                        actions=cells,
                    )
                )
    return rows


@router.put("/matrix/data", status_code=status.HTTP_204_NO_CONTENT)
async def save_data_matrix(
    payload: SaveRoleDataMatrixRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    priv_repo = PrivilegeRepository(db)
    await priv_repo.set_role_actions(
        uuid.UUID(payload.role_id),
        [uuid.UUID(a) for a in payload.action_ids],
    )


def _priv_to_response(p: Privilege) -> PrivilegeResponse:
    return PrivilegeResponse(
        id=str(p.id),
        privilege_code=p.privilege_code,
        name=p.name,
        description=p.description,
        module=p.module,
        privilege_type=p.privilege_type,
        is_active=p.is_active,
        actions=[
            ActionResponse(
                id=str(a.id),
                action_code=a.action_code,
                action_label=a.action_label,
                sort_order=a.sort_order,
                is_active=a.is_active,
            )
            for a in sorted(p.actions, key=lambda x: x.sort_order)
        ],
    )
