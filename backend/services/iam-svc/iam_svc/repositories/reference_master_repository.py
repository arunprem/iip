"""CRUD helpers for legacy reference tables (unit_types, ranks)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from iam_svc.models.office import Office
from iam_svc.models.rank import Rank
from iam_svc.models.unit_type import UnitType


class ReferenceMasterRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def next_unit_type_id(self) -> int:
        result = await self.session.execute(select(func.coalesce(func.max(UnitType.id), 0)))
        return int(result.scalar_one()) + 1

    async def next_rank_id(self) -> int:
        result = await self.session.execute(select(func.coalesce(func.max(Rank.id), 0)))
        return int(result.scalar_one()) + 1

    async def get_unit_type(self, type_id: int) -> UnitType | None:
        return await self.session.get(UnitType, type_id)

    async def get_rank(self, rank_id: int) -> Rank | None:
        return await self.session.get(Rank, rank_id)

    async def count_offices_by_unit_type(self, type_id: int) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(Office).where(Office.office_type_id == type_id)
        )
        return int(result.scalar_one())

    async def count_offices_by_head_rank(self, rank_id: int) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(Office).where(Office.head_rank == rank_id)
        )
        return int(result.scalar_one())

    async def unit_type_description_exists(
        self, description: str, *, exclude_id: int | None = None
    ) -> bool:
        stmt = select(UnitType.id).where(func.lower(UnitType.description) == description.lower())
        if exclude_id is not None:
            stmt = stmt.where(UnitType.id != exclude_id)
        result = await self.session.execute(stmt.limit(1))
        return result.scalar_one_or_none() is not None
