import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iam_svc.models.office import Office
from iam_svc.models.user_office_role import UserOfficeRole


class OfficeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_active(self) -> list[Office]:
        stmt = select(Office).where(Office.is_active.is_(True)).order_by(Office.office_name)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_user_offices(self, user_id: str | uuid.UUID) -> list[UserOfficeRole]:
        if isinstance(user_id, str):
            user_id = uuid.UUID(user_id)
        stmt = (
            select(UserOfficeRole)
            .options(
                selectinload(UserOfficeRole.office),
                selectinload(UserOfficeRole.role),
            )
            .where(UserOfficeRole.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, office_id: uuid.UUID) -> Optional[Office]:
        result = await self.session.execute(select(Office).where(Office.id == office_id))
        return result.scalar_one_or_none()
