"""Unit type master CRUD."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iam_svc.dependencies import require_system_admin_role
from iam_svc.models.role import Role
from iam_svc.models.unit_type import UnitType
from iam_svc.repositories.reference_master_repository import ReferenceMasterRepository

router = APIRouter()


class UnitTypeResponse(BaseModel):
    id: int
    description: str
    is_active: bool


class CreateUnitTypeRequest(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    is_active: bool = True


class UpdateUnitTypeRequest(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=255)
    is_active: bool | None = None


class ReferenceDeleteCheckResponse(BaseModel):
    can_delete: bool
    blockers: list[str]
    usage_count: int


@router.get("/", response_model=list[UnitTypeResponse])
async def list_unit_types(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = Query(True),
) -> list[UnitTypeResponse]:
    stmt = select(UnitType).order_by(UnitType.id)
    if not include_inactive:
        stmt = stmt.where(UnitType.is_active.is_(True))
    result = await db.execute(stmt)
    return [
        UnitTypeResponse(id=row.id, description=row.description, is_active=row.is_active)
        for row in result.scalars().all()
    ]


@router.get("/{type_id}", response_model=UnitTypeResponse)
async def get_unit_type(
    type_id: int,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UnitTypeResponse:
    row = await ReferenceMasterRepository(db).get_unit_type(type_id)
    if not row:
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Unit type not found.",
        )
    return UnitTypeResponse(id=row.id, description=row.description, is_active=row.is_active)


@router.post("/", response_model=UnitTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_unit_type(
    payload: CreateUnitTypeRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UnitTypeResponse:
    repo = ReferenceMasterRepository(db)
    desc = payload.description.strip()
    if await repo.unit_type_description_exists(desc):
        raise IIPException(
            status_code=400,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=f"Unit type '{desc}' already exists.",
            meta={"field": "description"},
        )

    type_id = await repo.next_unit_type_id()
    row = UnitType(id=type_id, description=desc, is_active=payload.is_active)
    db.add(row)
    await db.flush()
    return UnitTypeResponse(id=row.id, description=row.description, is_active=row.is_active)


@router.patch("/{type_id}", response_model=UnitTypeResponse)
async def update_unit_type(
    type_id: int,
    payload: UpdateUnitTypeRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UnitTypeResponse:
    repo = ReferenceMasterRepository(db)
    row = await repo.get_unit_type(type_id)
    if not row:
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Unit type not found.",
        )

    data = payload.model_dump(exclude_unset=True)
    if "description" in data:
        desc = data["description"].strip()
        if await repo.unit_type_description_exists(desc, exclude_id=type_id):
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"Unit type '{desc}' already exists.",
                meta={"field": "description"},
            )
        row.description = desc
    if "is_active" in data:
        row.is_active = data["is_active"]

    await db.flush()
    return UnitTypeResponse(id=row.id, description=row.description, is_active=row.is_active)


@router.get("/{type_id}/deletion-check", response_model=ReferenceDeleteCheckResponse)
async def check_unit_type_deletion(
    type_id: int,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferenceDeleteCheckResponse:
    repo = ReferenceMasterRepository(db)
    if not await repo.get_unit_type(type_id):
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Unit type not found.",
        )
    usage = await repo.count_offices_by_unit_type(type_id)
    blockers: list[str] = []
    if usage:
        blockers.append(f"{usage} office(s) use this unit type.")
    return ReferenceDeleteCheckResponse(
        can_delete=usage == 0,
        blockers=blockers,
        usage_count=usage,
    )


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit_type(
    type_id: int,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    repo = ReferenceMasterRepository(db)
    row = await repo.get_unit_type(type_id)
    if not row:
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Unit type not found.",
        )
    usage = await repo.count_offices_by_unit_type(type_id)
    if usage:
        raise IIPException(
            status_code=400,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=f"Cannot delete unit type: {usage} office(s) still reference it.",
        )
    await db.delete(row)
