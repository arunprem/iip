import uuid
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iip_core.errors import NotFoundError
from iam_svc.models.grant_tables import role_menu_privileges, role_privilege_actions
from iam_svc.models.privilege import Privilege
from iam_svc.models.privilege_action import PrivilegeAction


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

    async def create_action(self, action: PrivilegeAction) -> PrivilegeAction:
        self.session.add(action)
        await self.session.flush()
        return action

    async def delete_action(self, action_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(PrivilegeAction).where(PrivilegeAction.id == action_id)
        )

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
