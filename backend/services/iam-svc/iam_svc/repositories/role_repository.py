import uuid
from typing import List, Optional

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.errors import ErrorCode, IIPException, NotFoundError
from iam_svc.models.grant_tables import role_menu_privileges, role_privilege_actions
from iam_svc.models.role import Role
from iam_svc.models.user import user_roles
from iam_svc.models.user_office_role import UserOfficeRole

PROTECTED_ROLE_NAMES = frozenset({"SYSTEM_ADMIN"})


class RoleRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_name(self, role_name: str) -> Optional[Role]:
        stmt = select(Role).where(Role.role_name == role_name)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_by_name_or_error(self, role_name: str) -> Role:
        role = await self.get_by_name(role_name)
        if not role:
            raise NotFoundError("Role", role_name)
        return role

    async def list_roles(self) -> List[Role]:
        stmt = select(Role).order_by(Role.role_name.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, role_id: str | uuid.UUID) -> Optional[Role]:
        if isinstance(role_id, str):
            role_id = uuid.UUID(role_id)
        result = await self.session.execute(select(Role).where(Role.id == role_id))
        return result.scalar_one_or_none()

    async def get_by_id_or_error(self, role_id: str | uuid.UUID) -> Role:
        role = await self.get_by_id(role_id)
        if not role:
            raise NotFoundError("Role", str(role_id))
        return role

    async def create(self, role: Role) -> Role:
        existing = await self.get_by_name(role.role_name)
        if existing:
            raise IIPException(
                status_code=409,
                error_code=ErrorCode.CONFLICT,
                detail=f"Role '{role.role_name}' already exists.",
            )
        self.session.add(role)
        await self.session.flush()
        return await self.get_by_id_or_error(role.id)

    async def update(self, role: Role) -> Role:
        await self.session.flush()
        return await self.get_by_id_or_error(role.id)

    async def get_deletion_blockers(self, role_id: str | uuid.UUID) -> list[str]:
        if isinstance(role_id, str):
            role_id = uuid.UUID(role_id)
        role = await self.get_by_id_or_error(role_id)

        if role.role_name in PROTECTED_ROLE_NAMES:
            return [f"'{role.role_name}' is a protected system role and cannot be deleted."]

        blockers: list[str] = []

        office_rows = await self.session.execute(
            select(UserOfficeRole.user_id).where(UserOfficeRole.role_id == role_id)
        )
        office_count = len(list(office_rows.scalars().all()))
        if office_count:
            blockers.append(
                f"Assigned to {office_count} user–office assignment(s). "
                "Reassign or remove those users from this role before deleting."
            )

        legacy_count = await self.session.execute(
            text("SELECT COUNT(*) FROM iam.user_roles WHERE role_id = :role_id"),
            {"role_id": role_id},
        )
        legacy_n = int(legacy_count.scalar() or 0)
        if legacy_n:
            blockers.append(
                f"Legacy user assignment exists ({legacy_n} user(s)). "
                "Remove the role from those users before deleting."
            )

        return blockers

    async def delete(self, role_id: str | uuid.UUID) -> None:
        if isinstance(role_id, str):
            role_id = uuid.UUID(role_id)
        blockers = await self.get_deletion_blockers(role_id)
        if blockers:
            raise IIPException(
                status_code=409,
                error_code=ErrorCode.CONFLICT,
                detail="Cannot delete this role while assignments exist. "
                + " ".join(blockers),
                meta={"blockers": blockers},
            )
        role = await self.get_by_id_or_error(role_id)
        await self.session.execute(
            delete(role_menu_privileges).where(role_menu_privileges.c.role_id == role_id)
        )
        await self.session.execute(
            delete(role_privilege_actions).where(role_privilege_actions.c.role_id == role_id)
        )
        await self.session.execute(delete(user_roles).where(user_roles.c.role_id == role_id))
        await self.session.delete(role)
        await self.session.flush()
