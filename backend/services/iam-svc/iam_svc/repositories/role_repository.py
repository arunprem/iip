import uuid
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from iip_core.errors import NotFoundError
from iam_svc.models.role import Role

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

    async def create(self, role: Role) -> Role:
        self.session.add(role)
        await self.session.flush()
        return role
