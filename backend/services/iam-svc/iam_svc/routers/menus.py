"""Dynamic menu CRUD — super admin."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iam_svc.dependencies import require_system_admin_role
from iam_svc.models.menu import Menu
from iam_svc.models.role import Role
from iam_svc.repositories.menu_repository import MenuRepository
from iam_svc.repositories.privilege_repository import PrivilegeRepository

router = APIRouter()


class MenuResponse(BaseModel):
    id: str
    menu_key: str
    label: str
    path: str | None
    icon: str
    section: str
    sort_order: int
    parent_id: str | None
    privilege_id: str | None
    privilege_code: str | None
    is_group: bool
    is_active: bool


class CreateMenuRequest(BaseModel):
    menu_key: str = Field(min_length=1, max_length=100)
    label: str
    path: str | None = None
    icon: str = "Circle"
    section: str = "Menu"
    sort_order: int = 0
    parent_id: str | None = None
    privilege_id: str | None = None
    privilege_code: str | None = None
    is_group: bool = False
    is_active: bool = True


class UpdateMenuRequest(BaseModel):
    label: str | None = None
    path: str | None = None
    icon: str | None = None
    section: str | None = None
    sort_order: int | None = None
    parent_id: str | None = None
    privilege_id: str | None = None
    is_group: bool | None = None
    is_active: bool | None = None


@router.get("/", response_model=list[MenuResponse])
async def list_menus(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = True,
    flat: bool = Query(False, description="Return all menus including children"),
) -> list[MenuResponse]:
    repo = MenuRepository(db)
    menus = await repo.list_all(include_inactive=include_inactive)
    if flat:
        flat_list: list[Menu] = []
        roots = [m for m in menus if m.parent_id is None]

        def walk(items: list[Menu]) -> None:
            for m in items:
                flat_list.append(m)
                walk(list(m.children))

        walk(roots)
        return [_to_response(m) for m in flat_list]
    return [_to_response(m) for m in menus if m.parent_id is None]


@router.post("/", response_model=MenuResponse, status_code=status.HTTP_201_CREATED)
async def create_menu(
    payload: CreateMenuRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MenuResponse:
    priv_repo = PrivilegeRepository(db)
    privilege_id = await _resolve_privilege_id(
        priv_repo,
        payload.privilege_id,
        payload.privilege_code,
        is_group=payload.is_group,
    )

    menu = Menu(
        menu_key=payload.menu_key,
        label=payload.label,
        path=payload.path,
        icon=payload.icon,
        section=payload.section,
        sort_order=payload.sort_order,
        parent_id=uuid.UUID(payload.parent_id) if payload.parent_id else None,
        privilege_id=privilege_id,
        is_group=payload.is_group,
        is_active=payload.is_active,
    )
    created = await MenuRepository(db).create(menu)
    return _to_response(created)


@router.patch("/{menu_id}", response_model=MenuResponse)
async def update_menu(
    menu_id: str,
    payload: UpdateMenuRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MenuResponse:
    repo = MenuRepository(db)
    menu = await repo.get_by_id_or_error(menu_id)
    data = payload.model_dump(exclude_unset=True)

    if "is_group" in data:
        menu.is_group = data["is_group"]
        if menu.is_group:
            menu.privilege_id = None
        del data["is_group"]

    if "parent_id" in data:
        menu.parent_id = uuid.UUID(data["parent_id"]) if data["parent_id"] else None
        del data["parent_id"]

    if "privilege_id" in data and not menu.is_group:
        raw_priv = data["privilege_id"]
        if raw_priv:
            priv_repo = PrivilegeRepository(db)
            menu.privilege_id = await _resolve_privilege_id(
                priv_repo, raw_priv, None, is_group=False
            )
        else:
            menu.privilege_id = None
        del data["privilege_id"]

    for key, value in data.items():
        setattr(menu, key, value)

    if not menu.is_group and menu.privilege_id is None:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Select a MENU privilege for this menu item (group headers may omit a privilege).",
        )
    updated = await repo.update(menu)
    return _to_response(updated)


@router.delete("/{menu_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu(
    menu_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await MenuRepository(db).delete(menu_id)


async def _resolve_privilege_id(
    priv_repo: PrivilegeRepository,
    privilege_id: str | None,
    privilege_code: str | None,
    *,
    is_group: bool,
) -> uuid.UUID | None:
    """Link menu to an existing MENU privilege (created in Privilege Management)."""
    if is_group and not privilege_id and not privilege_code:
        return None

    if privilege_id:
        priv = await priv_repo.get_by_id_or_error(privilege_id)
        if priv.privilege_type != "MENU":
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="Only MENU privileges can be linked to navigation menus.",
            )
        return priv.id

    if privilege_code:
        priv = await priv_repo.get_by_code(privilege_code)
        if not priv:
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"MENU privilege '{privilege_code}' was not found. Create it under Privilege Management first.",
            )
        if priv.privilege_type != "MENU":
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="Only MENU privileges can be linked to navigation menus.",
            )
        return priv.id

    raise IIPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code=ErrorCode.VALIDATION_ERROR,
        detail="Select a MENU privilege for this menu item (group headers may omit a privilege).",
    )


def _to_response(menu: Menu) -> MenuResponse:
    return MenuResponse(
        id=str(menu.id),
        menu_key=menu.menu_key,
        label=menu.label,
        path=menu.path,
        icon=menu.icon,
        section=menu.section,
        sort_order=menu.sort_order,
        parent_id=str(menu.parent_id) if menu.parent_id else None,
        privilege_id=str(menu.privilege_id) if menu.privilege_id else None,
        privilege_code=menu.privilege.privilege_code if menu.privilege else None,
        is_group=menu.is_group,
        is_active=menu.is_active,
    )
