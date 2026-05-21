"""Rank master CRUD."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iam_svc.dependencies import require_system_admin_role
from iam_svc.models.rank import Rank
from iam_svc.models.role import Role
from iam_svc.repositories.reference_master_repository import ReferenceMasterRepository

router = APIRouter()


class RankResponse(BaseModel):
    id: int
    rank_desc: str | None
    rank_short_tag: str | None
    unit_head: bool
    rank_priority: int
    is_active: bool


class CreateRankRequest(BaseModel):
    rank_desc: str | None = Field(None, max_length=255)
    rank_short_tag: str | None = Field(None, max_length=100)
    unit_head: bool = False
    rank_priority: int = 0
    is_active: bool = True


class UpdateRankRequest(BaseModel):
    rank_desc: str | None = Field(None, max_length=255)
    rank_short_tag: str | None = Field(None, max_length=100)
    unit_head: bool | None = None
    rank_priority: int | None = None
    is_active: bool | None = None


class ReferenceDeleteCheckResponse(BaseModel):
    can_delete: bool
    blockers: list[str]
    usage_count: int


def _to_response(row: Rank) -> RankResponse:
    return RankResponse(
        id=row.id,
        rank_desc=row.rank_desc,
        rank_short_tag=row.rank_short_tag,
        unit_head=row.unit_head,
        rank_priority=row.rank_priority,
        is_active=row.is_active,
    )


@router.get("/", response_model=list[RankResponse])
async def list_ranks(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = Query(True),
    unit_head_only: bool = Query(False),
) -> list[RankResponse]:
    stmt = select(Rank).order_by(Rank.rank_priority, Rank.id)
    if not include_inactive:
        stmt = stmt.where(Rank.is_active.is_(True))
    if unit_head_only:
        stmt = stmt.where(Rank.unit_head.is_(True))
    result = await db.execute(stmt)
    return [_to_response(row) for row in result.scalars().all()]


@router.get("/{rank_id}", response_model=RankResponse)
async def get_rank(
    rank_id: int,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RankResponse:
    row = await ReferenceMasterRepository(db).get_rank(rank_id)
    if not row:
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Rank not found.",
        )
    return _to_response(row)


@router.post("/", response_model=RankResponse, status_code=status.HTTP_201_CREATED)
async def create_rank(
    payload: CreateRankRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RankResponse:
    repo = ReferenceMasterRepository(db)
    rank_id = await repo.next_rank_id()
    row = Rank(
        id=rank_id,
        rank_desc=payload.rank_desc.strip() if payload.rank_desc else None,
        rank_short_tag=payload.rank_short_tag.strip() if payload.rank_short_tag else None,
        unit_head=payload.unit_head,
        rank_priority=payload.rank_priority,
        is_active=payload.is_active,
    )
    db.add(row)
    await db.flush()
    return _to_response(row)


@router.patch("/{rank_id}", response_model=RankResponse)
async def update_rank(
    rank_id: int,
    payload: UpdateRankRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RankResponse:
    repo = ReferenceMasterRepository(db)
    row = await repo.get_rank(rank_id)
    if not row:
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Rank not found.",
        )

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if key in ("rank_desc", "rank_short_tag") and isinstance(value, str):
            value = value.strip() or None
        setattr(row, key, value)

    await db.flush()
    return _to_response(row)


@router.get("/{rank_id}/deletion-check", response_model=ReferenceDeleteCheckResponse)
async def check_rank_deletion(
    rank_id: int,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferenceDeleteCheckResponse:
    repo = ReferenceMasterRepository(db)
    if not await repo.get_rank(rank_id):
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Rank not found.",
        )
    usage = await repo.count_offices_by_head_rank(rank_id)
    blockers: list[str] = []
    if usage:
        blockers.append(f"{usage} office(s) use this rank as unit head.")
    return ReferenceDeleteCheckResponse(
        can_delete=usage == 0,
        blockers=blockers,
        usage_count=usage,
    )


@router.delete("/{rank_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rank(
    rank_id: int,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    repo = ReferenceMasterRepository(db)
    row = await repo.get_rank(rank_id)
    if not row:
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Rank not found.",
        )
    usage = await repo.count_offices_by_head_rank(rank_id)
    if usage:
        raise IIPException(
            status_code=400,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=f"Cannot delete rank: {usage} office(s) still reference it.",
        )
    await db.delete(row)
