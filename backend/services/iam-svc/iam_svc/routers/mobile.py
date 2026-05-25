"""Mobile app session, theme, and admin widget management."""

from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iam_svc.dependencies import get_office_role, require_system_admin_role
from iam_svc.models.role import Role
from iam_svc.repositories.mobile_widget_repository import MobileWidgetRepository
from iam_svc.routers.access import ActionGrantResponse, MenuTreeResponse, _menu_to_response
from iam_svc.services.mobile_theme import mobile_theme_bundle
from iam_svc.services.mobile_widget_access import widgets_for_role
from iam_svc.services.permission_service import PermissionService

router = APIRouter()


class MobileWidgetResponse(BaseModel):
    id: str
    widget_key: str
    label: str
    description: str
    icon: str
    menu_key: str | None
    privilege_code: str | None
    mobile_route: str
    sort_order: int
    is_active: bool


class MobileWidgetCreateRequest(BaseModel):
    widget_key: str = Field(min_length=2, max_length=100)
    label: str = Field(min_length=1, max_length=255)
    description: str = ""
    icon: str = "LayoutGrid"
    menu_key: str | None = None
    privilege_code: str | None = None
    mobile_route: str = Field(min_length=1, max_length=255)
    sort_order: int = 0
    is_active: bool = True


class MobileWidgetUpdateRequest(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    icon: str | None = None
    menu_key: str | None = None
    privilege_code: str | None = None
    mobile_route: str | None = Field(None, min_length=1, max_length=255)
    sort_order: int | None = None
    is_active: bool | None = None


class MobileWidgetToggleRequest(BaseModel):
    is_active: bool


class MobileThemeColors(BaseModel):
    mode: str
    colors: dict[str, str]


class MobileSessionResponse(BaseModel):
    office_role: str
    theme: dict
    widgets: list[MobileWidgetResponse]
    menus: list[MenuTreeResponse]
    actions: list[ActionGrantResponse]
    min_app_version: str = "1.0.0"


def _to_widget_response(row) -> MobileWidgetResponse:
    return MobileWidgetResponse(
        id=str(row.id),
        widget_key=row.widget_key,
        label=row.label,
        description=row.description or "",
        icon=row.icon,
        menu_key=row.menu_key,
        privilege_code=row.privilege_code,
        mobile_route=row.mobile_route,
        sort_order=row.sort_order,
        is_active=row.is_active,
    )


@router.get("/theme")
async def get_mobile_theme() -> dict:
    """Public theme tokens for mobile bootstrap (no auth)."""
    return mobile_theme_bundle()


@router.get("/session", response_model=MobileSessionResponse)
async def get_mobile_session(
    role: Annotated[Role, Depends(get_office_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MobileSessionResponse:
    """Authenticated mobile bootstrap: theme, permitted widgets, menus, and actions."""
    perm = PermissionService(db)
    menus = await perm.get_menus_for_role(role)
    actions = await perm.get_action_grants_for_role(role)
    widgets = await widgets_for_role(db, role)

    return MobileSessionResponse(
        office_role=role.role_name,
        theme=mobile_theme_bundle(),
        widgets=[_to_widget_response(w) for w in widgets],
        menus=[_menu_to_response(m) for m in menus],
        actions=[ActionGrantResponse(**asdict(a)) for a in actions],
    )


@router.get("/widgets", response_model=list[MobileWidgetResponse])
async def list_mobile_widgets_admin(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MobileWidgetResponse]:
    rows = await MobileWidgetRepository(db).list_all()
    return [_to_widget_response(r) for r in rows]


@router.post("/widgets", response_model=MobileWidgetResponse, status_code=status.HTTP_201_CREATED)
async def create_mobile_widget(
    payload: MobileWidgetCreateRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MobileWidgetResponse:
    repo = MobileWidgetRepository(db)
    existing = await repo.get_by_key(payload.widget_key.strip())
    if existing:
        raise IIPException(
            status_code=status.HTTP_409_CONFLICT,
            error_code=ErrorCode.CONFLICT,
            detail="A widget with this key already exists.",
        )
    row = await repo.create(
        widget_key=payload.widget_key.strip(),
        label=payload.label.strip(),
        description=(payload.description or "").strip(),
        icon=payload.icon.strip() or "LayoutGrid",
        menu_key=payload.menu_key.strip() if payload.menu_key else None,
        privilege_code=payload.privilege_code.strip() if payload.privilege_code else None,
        mobile_route=payload.mobile_route.strip(),
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    return _to_widget_response(row)


@router.patch("/widgets/{widget_id}", response_model=MobileWidgetResponse)
async def update_mobile_widget(
    widget_id: uuid.UUID,
    payload: MobileWidgetUpdateRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MobileWidgetResponse:
    repo = MobileWidgetRepository(db)
    row = await repo.get_by_id(widget_id)
    if not row:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Mobile widget not found.",
        )
    updates = payload.model_dump(exclude_unset=True)
    if "label" in updates and updates["label"]:
        updates["label"] = updates["label"].strip()
    if "mobile_route" in updates and updates["mobile_route"]:
        updates["mobile_route"] = updates["mobile_route"].strip()
    updated = await repo.update(row, **updates)
    return _to_widget_response(updated)


@router.patch("/widgets/{widget_id}/toggle", response_model=MobileWidgetResponse)
async def toggle_mobile_widget(
    widget_id: uuid.UUID,
    payload: MobileWidgetToggleRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MobileWidgetResponse:
    repo = MobileWidgetRepository(db)
    row = await repo.get_by_id(widget_id)
    if not row:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Mobile widget not found.",
        )
    await repo.set_active(widget_id, payload.is_active)
    row = await repo.get_by_id(widget_id)
    if not row:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Mobile widget not found.",
        )
    return _to_widget_response(row)
