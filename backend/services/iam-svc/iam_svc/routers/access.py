"""Office-scoped menus and permissions for the current user."""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.auth import CurrentUser
from iip_core.db import get_db
from iam_svc.dependencies import get_current_user_db, get_office_role
from iam_svc.models.role import Role
from iam_svc.services.permission_service import PermissionService

router = APIRouter()


class MenuTreeResponse(BaseModel):
    id: str
    menu_key: str
    label: str
    path: str | None
    icon: str
    section: str
    sort_order: int
    is_group: bool
    privilege_code: str | None
    children: list["MenuTreeResponse"] = []


class ActionGrantResponse(BaseModel):
    privilege_code: str
    action_code: str
    action_label: str


class UserPermissionsResponse(BaseModel):
    office_role: str
    menus: list[MenuTreeResponse]
    actions: list[ActionGrantResponse]


@router.get("/menus", response_model=list[MenuTreeResponse])
async def get_my_menus(
    role: Annotated[Role, Depends(get_office_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MenuTreeResponse]:
    svc = PermissionService(db)
    trees = await svc.get_menus_for_role(role)
    return [_menu_to_response(t) for t in trees]


@router.get("/permissions", response_model=UserPermissionsResponse)
async def get_my_permissions(
    role: Annotated[Role, Depends(get_office_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserPermissionsResponse:
    svc = PermissionService(db)
    menus = await svc.get_menus_for_role(role)
    actions = await svc.get_action_grants_for_role(role)
    return UserPermissionsResponse(
        office_role=role.role_name,
        menus=[_menu_to_response(m) for m in menus],
        actions=[ActionGrantResponse(**asdict(a)) for a in actions],
    )


def _menu_to_response(item) -> MenuTreeResponse:
    return MenuTreeResponse(
        id=item.id,
        menu_key=item.menu_key,
        label=item.label,
        path=item.path,
        icon=item.icon,
        section=item.section,
        sort_order=item.sort_order,
        is_group=item.is_group,
        privilege_code=item.privilege_code,
        children=[_menu_to_response(c) for c in item.children],
    )
