"""Resolve office-scoped menus and data actions for a role."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iam_svc.models.menu import Menu
from iam_svc.models.privilege import Privilege
from iam_svc.models.privilege_action import PrivilegeAction
from iam_svc.models.role import Role
from iam_svc.models.user import User
from iam_svc.models.user_office_role import UserOfficeRole

SYSTEM_ADMIN_ROLE = "SYSTEM_ADMIN"


@dataclass
class MenuTreeItem:
    id: str
    menu_key: str
    label: str
    path: str | None
    icon: str
    section: str
    sort_order: int
    is_group: bool
    privilege_code: str | None
    children: list["MenuTreeItem"]


@dataclass
class ActionGrant:
    privilege_code: str
    action_code: str
    action_label: str


class PermissionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_user_office_role(
        self, user_id: str | uuid.UUID, office_id: str | uuid.UUID
    ) -> Role | None:
        if isinstance(user_id, str):
            user_id = uuid.UUID(user_id)
        if isinstance(office_id, str):
            office_id = uuid.UUID(office_id)

        stmt = (
            select(UserOfficeRole)
            .options(selectinload(UserOfficeRole.role))
            .where(UserOfficeRole.user_id == user_id, UserOfficeRole.office_id == office_id)
        )
        result = await self.session.execute(stmt)
        assignment = result.scalar_one_or_none()
        return assignment.role if assignment else None

    async def is_system_admin(self, role: Role) -> bool:
        return role.role_name == SYSTEM_ADMIN_ROLE

    async def get_allowed_menu_privilege_ids(self, role: Role) -> set[uuid.UUID]:
        if await self.is_system_admin(role):
            stmt = select(Privilege.id).where(
                Privilege.privilege_type == "MENU", Privilege.is_active.is_(True)
            )
            result = await self.session.execute(stmt)
            return set(result.scalars().all())

        from iam_svc.models.grant_tables import role_menu_privileges

        stmt = select(role_menu_privileges.c.privilege_id).where(
            role_menu_privileges.c.role_id == role.id
        )
        result = await self.session.execute(stmt)
        return set(result.scalars().all())

    async def get_menus_for_role(self, role: Role) -> list[MenuTreeItem]:
        allowed_privilege_ids = await self.get_allowed_menu_privilege_ids(role)

        stmt = (
            select(Menu)
            .options(selectinload(Menu.privilege), selectinload(Menu.children))
            .where(Menu.is_active.is_(True), Menu.parent_id.is_(None))
            .order_by(Menu.section, Menu.sort_order)
        )
        result = await self.session.execute(stmt)
        root_menus = list(result.scalars().unique().all())

        trees: list[MenuTreeItem] = []
        for menu in root_menus:
            item = self._build_menu_tree(menu, allowed_privilege_ids)
            if item:
                trees.append(item)

        return trees

    def _build_menu_tree(self, menu: Menu, allowed_privilege_ids: set[uuid.UUID]) -> MenuTreeItem | None:
        if menu.is_group:
            children = []
            for child in sorted(menu.children, key=lambda m: m.sort_order):
                if not child.is_active:
                    continue
                built = self._build_menu_tree(child, allowed_privilege_ids)
                if built:
                    children.append(built)
            if not children:
                return None
            return MenuTreeItem(
                id=str(menu.id),
                menu_key=menu.menu_key,
                label=menu.label,
                path=menu.path,
                icon=menu.icon,
                section=menu.section,
                sort_order=menu.sort_order,
                is_group=True,
                privilege_code=menu.privilege.privilege_code if menu.privilege else None,
                children=children,
            )

        if menu.privilege_id and menu.privilege_id not in allowed_privilege_ids:
            return None

        return MenuTreeItem(
            id=str(menu.id),
            menu_key=menu.menu_key,
            label=menu.label,
            path=menu.path,
            icon=menu.icon,
            section=menu.section,
            sort_order=menu.sort_order,
            is_group=False,
            privilege_code=menu.privilege.privilege_code if menu.privilege else None,
            children=[],
        )

    async def get_action_grants_for_role(self, role: Role) -> list[ActionGrant]:
        if await self.is_system_admin(role):
            stmt = (
                select(Privilege, PrivilegeAction)
                .join(PrivilegeAction, PrivilegeAction.privilege_id == Privilege.id)
                .where(Privilege.privilege_type == "DATA", Privilege.is_active.is_(True))
            )
            result = await self.session.execute(stmt)
            return [
                ActionGrant(
                    privilege_code=p.privilege_code,
                    action_code=a.action_code,
                    action_label=a.action_label,
                )
                for p, a in result.all()
            ]

        from iam_svc.models.grant_tables import role_privilege_actions

        stmt = (
            select(Privilege.privilege_code, PrivilegeAction.action_code, PrivilegeAction.action_label)
            .join(role_privilege_actions, role_privilege_actions.c.action_id == PrivilegeAction.id)
            .join(Privilege, Privilege.id == PrivilegeAction.privilege_id)
            .where(role_privilege_actions.c.role_id == role.id)
        )
        result = await self.session.execute(stmt)
        return [
            ActionGrant(privilege_code=row[0], action_code=row[1], action_label=row[2])
            for row in result.all()
        ]

    async def role_has_action(self, role: Role, privilege_code: str, action_code: str) -> bool:
        if await self.is_system_admin(role):
            return True
        grants = await self.get_action_grants_for_role(role)
        return any(
            g.privilege_code == privilege_code and g.action_code == action_code for g in grants
        )
