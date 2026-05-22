import uuid
from typing import Optional

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iip_core.errors import ErrorCode, IIPException, NotFoundError
from iam_svc.models.grant_tables import role_menu_privileges, role_privilege_actions
from iam_svc.models.menu import Menu
from iam_svc.models.privilege import Privilege
from iam_svc.models.privilege_action import PrivilegeAction
from iam_svc.models.role import Role


DEFAULT_DATA_ACTIONS: list[tuple[str, str, int]] = [
    ("READ", "Read", 1),
    ("CREATE", "Create", 2),
    ("UPDATE", "Update", 3),
    ("DELETE", "Delete", 4),
    ("EXPORT", "Export", 5),
]


class PrivilegeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(
        self, privilege_type: str | None = None, include_inactive: bool = False
    ) -> list[Privilege]:
        stmt = select(Privilege).options(selectinload(Privilege.actions)).order_by(
            Privilege.module, Privilege.privilege_code
        )
        if privilege_type:
            stmt = stmt.where(Privilege.privilege_type == privilege_type)
        if not include_inactive:
            stmt = stmt.where(Privilege.is_active.is_(True))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, privilege_id: str | uuid.UUID) -> Optional[Privilege]:
        if isinstance(privilege_id, str):
            privilege_id = uuid.UUID(privilege_id)
        stmt = (
            select(Privilege)
            .options(selectinload(Privilege.actions))
            .where(Privilege.id == privilege_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_or_error(self, privilege_id: str | uuid.UUID) -> Privilege:
        priv = await self.get_by_id(privilege_id)
        if not priv:
            raise NotFoundError("Privilege", str(privilege_id))
        return priv

    async def get_by_code(self, code: str) -> Optional[Privilege]:
        stmt = select(Privilege).where(Privilege.privilege_code == code)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, privilege: Privilege) -> Privilege:
        self.session.add(privilege)
        await self.session.flush()
        return await self.get_by_id_or_error(privilege.id)

    async def update(self, privilege: Privilege) -> Privilege:
        await self.session.flush()
        return await self.get_by_id_or_error(privilege.id)

    async def seed_default_data_actions(self, privilege_id: uuid.UUID) -> None:
        """Create standard CRUD (+ export) actions for a new DATA privilege."""
        for code, label, sort_order in DEFAULT_DATA_ACTIONS:
            self.session.add(
                PrivilegeAction(
                    privilege_id=privilege_id,
                    action_code=code,
                    action_label=label,
                    sort_order=sort_order,
                )
            )
        await self.session.flush()

    async def create_action(self, action: PrivilegeAction) -> PrivilegeAction:
        self.session.add(action)
        await self.session.flush()
        return action

    async def delete_action(self, action_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(PrivilegeAction).where(PrivilegeAction.id == action_id)
        )

    async def get_deletion_blockers(self, privilege_id: str | uuid.UUID) -> list[str]:
        if isinstance(privilege_id, str):
            privilege_id = uuid.UUID(privilege_id)
        await self.get_by_id_or_error(privilege_id)
        blockers: list[str] = []

        menu_role_rows = await self.session.execute(
            select(Role.role_name)
            .join(
                role_menu_privileges,
                role_menu_privileges.c.role_id == Role.id,
            )
            .where(role_menu_privileges.c.privilege_id == privilege_id)
            .order_by(Role.role_name)
        )
        menu_roles = list(menu_role_rows.scalars().all())
        if menu_roles:
            blockers.append(
                "Menu access is assigned to role(s): "
                f"{', '.join(menu_roles)}. Remove the grant in Role Management → menu access matrix."
            )

        menu_rows = await self.session.execute(
            select(Menu.menu_key, Menu.label)
            .where(Menu.privilege_id == privilege_id)
            .order_by(Menu.menu_key)
        )
        linked_menus = list(menu_rows.all())
        if linked_menus:
            keys = ", ".join(f"{row.menu_key} ({row.label})" for row in linked_menus)
            blockers.append(
                f"Linked to menu item(s): {keys}. Unlink or delete them in Menu Management first."
            )

        data_role_rows = await self.session.execute(
            select(Role.role_name)
            .join(
                role_privilege_actions,
                role_privilege_actions.c.role_id == Role.id,
            )
            .where(role_privilege_actions.c.privilege_id == privilege_id)
            .distinct()
            .order_by(Role.role_name)
        )
        data_roles = list(data_role_rows.scalars().all())
        if data_roles:
            blockers.append(
                "Data action grants exist for role(s): "
                f"{', '.join(data_roles)}. Uncheck them in the Data privileges matrix below, "
                "then click Save data privileges."
            )

        return blockers

    async def _clear_legacy_role_grants(self, privilege_id: uuid.UUID) -> None:
        """Remove obsolete iam.role_privileges rows (pre-matrix seed grants)."""
        await self.session.execute(
            text("DELETE FROM iam.role_privileges WHERE privilege_id = :privilege_id"),
            {"privilege_id": privilege_id},
        )

    async def delete(self, privilege_id: str | uuid.UUID) -> None:
        if isinstance(privilege_id, str):
            privilege_id = uuid.UUID(privilege_id)
        blockers = await self.get_deletion_blockers(privilege_id)
        if blockers:
            raise IIPException(
                status_code=409,
                error_code=ErrorCode.CONFLICT,
                detail="Cannot delete this privilege while assignments exist. "
                + " ".join(blockers),
                meta={"blockers": blockers},
            )
        await self._clear_legacy_role_grants(privilege_id)
        priv = await self.get_by_id_or_error(privilege_id)
        await self.session.delete(priv)
        await self.session.flush()

    async def set_role_menu_privileges(self, role_id: uuid.UUID, privilege_ids: list[uuid.UUID]) -> None:
        await self.session.execute(
            delete(role_menu_privileges).where(role_menu_privileges.c.role_id == role_id)
        )
        for pid in privilege_ids:
            await self.session.execute(
                role_menu_privileges.insert().values(role_id=role_id, privilege_id=pid)
            )

    async def set_role_actions(self, role_id: uuid.UUID, action_ids: list[uuid.UUID]) -> None:
        await self.session.execute(
            delete(role_privilege_actions).where(role_privilege_actions.c.role_id == role_id)
        )

        for action_id in action_ids:
            action = await self.session.get(PrivilegeAction, action_id)
            if action:
                await self.session.execute(
                    role_privilege_actions.insert().values(
                        role_id=role_id,
                        privilege_id=action.privilege_id,
                        action_id=action_id,
                    )
                )

    async def get_role_menu_privilege_ids(self, role_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.session.execute(
            select(role_menu_privileges.c.privilege_id).where(
                role_menu_privileges.c.role_id == role_id
            )
        )
        return list(result.scalars().all())

    async def get_role_action_ids(self, role_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.session.execute(
            select(role_privilege_actions.c.action_id).where(
                role_privilege_actions.c.role_id == role_id
            )
        )
        return list(result.scalars().all())
