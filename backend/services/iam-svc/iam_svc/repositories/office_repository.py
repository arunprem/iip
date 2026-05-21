import re
import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iam_svc.models.office import Office
from iam_svc.models.user_office_role import UserOfficeRole


def slugify_office_code(value: str) -> str:
    code = re.sub(r"[^A-Za-z0-9]+", "-", value.strip().upper()).strip("-")
    return code[:50] or "OFFICE"


class OfficeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_active(self) -> list[Office]:
        stmt = (
            select(Office)
            .where(Office.is_active.is_(True))
            .order_by(Office.root_id, Office.lft)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_all(self, include_inactive: bool = True) -> list[Office]:
        stmt = select(Office).order_by(Office.root_id, Office.lft)
        if not include_inactive:
            stmt = stmt.where(Office.is_active.is_(True))
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

    async def get_by_code(self, office_code: str) -> Optional[Office]:
        result = await self.session.execute(
            select(Office).where(Office.office_code == office_code)
        )
        return result.scalar_one_or_none()

    async def code_exists(self, office_code: str, exclude_id: uuid.UUID | None = None) -> bool:
        stmt = select(func.count()).select_from(Office).where(Office.office_code == office_code)
        if exclude_id:
            stmt = stmt.where(Office.id != exclude_id)
        result = await self.session.execute(stmt)
        return int(result.scalar_one()) > 0

    async def count_user_assignments(self, office_id: uuid.UUID) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(UserOfficeRole)
            .where(UserOfficeRole.office_id == office_id)
        )
        return int(result.scalar_one())

    async def count_assignments_in_subtree(self, office: Office) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(UserOfficeRole)
            .join(Office, UserOfficeRole.office_id == Office.id)
            .where(
                Office.root_id == office.root_id,
                Office.lft >= office.lft,
                Office.rgt <= office.rgt,
            )
        )
        return int(result.scalar_one())

    async def update(self, office: Office) -> Office:
        await self.session.flush()
        return office
