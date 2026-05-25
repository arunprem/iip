"""Resolve mobile widgets visible to the current office role."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from iam_svc.models.mobile_widget import MobileWidget
from iam_svc.models.privilege import Privilege
from iam_svc.models.role import Role
from iam_svc.repositories.mobile_widget_repository import MobileWidgetRepository
from iam_svc.services.permission_service import PermissionService


async def widgets_for_role(session: AsyncSession, role: Role) -> list[MobileWidget]:
    """Active widgets the user may see: global widgets + privilege-gated modules."""
    repo = MobileWidgetRepository(session)
    active = await repo.list_active()
    if not active:
        return []

    perm = PermissionService(session)
    if await perm.is_system_admin(role):
        return active

    allowed_privilege_ids = await perm.get_allowed_menu_privilege_ids(role)
    allowed_codes: set[str] = set()
    if allowed_privilege_ids:
        stmt = select(Privilege.privilege_code).where(Privilege.id.in_(allowed_privilege_ids))
        result = await session.execute(stmt)
        allowed_codes = set(result.scalars().all())

    visible: list[MobileWidget] = []
    for widget in active:
        if not widget.privilege_code:
            visible.append(widget)
            continue
        if widget.privilege_code in allowed_codes:
            visible.append(widget)
    return visible
