"""Reference data for office forms: unit types and ranks."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.db import get_db
from iam_svc.dependencies import require_system_admin_user
from iam_svc.models.rank import Rank
from iam_svc.models.unit_type import UnitType
from iip_core.auth import CurrentUser

router = APIRouter()


class UnitTypeResponse(BaseModel):
    id: int
    description: str
    is_active: bool


class RankResponse(BaseModel):
    id: int
    rank_desc: str | None
    rank_short_tag: str | None
    unit_head: bool
    rank_priority: int
    is_active: bool


@router.get("/unit-types", response_model=list[UnitTypeResponse])
async def list_unit_types(
    _: Annotated[CurrentUser, Depends(require_system_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = Query(False),
) -> list[UnitTypeResponse]:
    stmt = select(UnitType).order_by(UnitType.id)
    if not include_inactive:
        stmt = stmt.where(UnitType.is_active.is_(True))
    result = await db.execute(stmt)
    return [
        UnitTypeResponse(id=row.id, description=row.description, is_active=row.is_active)
        for row in result.scalars().all()
    ]


@router.get("/ranks", response_model=list[RankResponse])
async def list_ranks(
    _: Annotated[CurrentUser, Depends(require_system_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = Query(False),
    unit_head_only: bool = Query(False, description="Only ranks eligible as unit head"),
) -> list[RankResponse]:
    stmt = select(Rank).order_by(Rank.rank_priority, Rank.id)
    if not include_inactive:
        stmt = stmt.where(Rank.is_active.is_(True))
    if unit_head_only:
        stmt = stmt.where(Rank.unit_head.is_(True))
    result = await db.execute(stmt)
    return [
        RankResponse(
            id=row.id,
            rank_desc=row.rank_desc,
            rank_short_tag=row.rank_short_tag,
            unit_head=row.unit_head,
            rank_priority=row.rank_priority,
            is_active=row.is_active,
        )
        for row in result.scalars().all()
    ]
