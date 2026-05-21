"""Office (unit) hierarchy CRUD with nested-set tree operations."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger
from iam_svc.dependencies import require_system_admin_role
from iam_svc.models.office import Office
from iam_svc.models.role import Role
from iam_svc.repositories.office_repository import OfficeRepository, slugify_office_code
from iam_svc.services.legacy_unit_import import (
    import_legacy_units_from_sql,
    parse_units_sql,
    sync_legacy_metadata,
)
from iam_svc.services.office_nested_set import InsertPosition, OfficeNestedSetService

router = APIRouter()

_LEGACY_UNIT_SQL = (
    Path(__file__).resolve().parents[5] / "infra/postgres/seed/unit_table_with_data.sql"
)
logger = get_logger(__name__)


class OfficeNodeResponse(BaseModel):
    office_id: str
    office_code: str
    office_name: str
    office_short_code: str | None = None
    ncrb_id: str | None = None
    office_type_id: int | None = None
    head_rank: int = 0
    is_parent_unit: bool = False
    district_id: int | None = None
    list_order: int | None = None
    is_active: bool = True
    parent_id: str | None = None
    lft: int
    rgt: int
    hlevel: int
    root_id: str | None = None
    child_count: int = 0
    descendant_count: int = 0
    children: list["OfficeNodeResponse"] = Field(default_factory=list)


class CreateOfficeRequest(BaseModel):
    office_code: str | None = Field(None, max_length=50)
    office_name: str = Field(min_length=1, max_length=255)
    office_short_code: str | None = Field(None, max_length=100)
    ncrb_id: str | None = Field(None, max_length=20)
    office_type_id: int | None = None
    head_rank: int = 0
    is_parent_unit: bool = False
    district_id: int | None = None
    list_order: int | None = None
    is_active: bool = True
    parent_id: str | None = None
    position: InsertPosition = InsertPosition.LAST_CHILD
    reference_id: str | None = None


class UpdateOfficeRequest(BaseModel):
    office_name: str | None = Field(None, min_length=1, max_length=255)
    office_short_code: str | None = None
    ncrb_id: str | None = None
    office_type_id: int | None = None
    head_rank: int | None = None
    is_parent_unit: bool | None = None
    district_id: int | None = None
    list_order: int | None = None
    is_active: bool | None = None


class MoveOfficeRequest(BaseModel):
    new_parent_id: str | None = None
    position: InsertPosition = InsertPosition.LAST_CHILD
    reference_id: str | None = None


class OfficeDeletionCheckResponse(BaseModel):
    can_delete: bool
    blockers: list[str]
    descendant_count: int


class RebuildResponse(BaseModel):
    nodes_updated: int
    message: str


class LegacyImportResponse(BaseModel):
    parsed: int
    imported: int
    skipped_existing: int
    synced: int = 0
    rebuild_nodes: int
    message: str


class LegacySyncResponse(BaseModel):
    parsed: int
    synced: int
    message: str


OfficeNodeResponse.model_rebuild()


@router.get("/tree", response_model=list[OfficeNodeResponse])
async def get_office_tree(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = True,
) -> list[OfficeNodeResponse]:
    offices = await OfficeRepository(db).list_all(include_inactive=include_inactive)
    return _build_forest(offices)


@router.get("/flat", response_model=list[OfficeNodeResponse])
async def list_offices_flat(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = True,
) -> list[OfficeNodeResponse]:
    offices = await OfficeRepository(db).list_all(include_inactive=include_inactive)
    return [_to_flat_node(o, offices) for o in offices]


@router.get("/{office_id}", response_model=OfficeNodeResponse)
async def get_office(
    office_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfficeNodeResponse:
    svc = OfficeNestedSetService(db)
    office = await svc.get_by_id(uuid.UUID(office_id))
    all_offices = await OfficeRepository(db).list_all(include_inactive=True)
    return _to_flat_node(office, all_offices)


@router.post("/", response_model=OfficeNodeResponse, status_code=status.HTTP_201_CREATED)
async def create_office(
    payload: CreateOfficeRequest,
    current_user: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfficeNodeResponse:
    repo = OfficeRepository(db)
    code = (payload.office_code or payload.office_short_code or payload.office_name).strip()
    office_code = slugify_office_code(code)
    if await repo.code_exists(office_code):
        raise IIPException(
            status_code=400,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=f"Office code '{office_code}' already exists.",
            meta={"field": "office_code"},
        )

    parent_id = uuid.UUID(payload.parent_id) if payload.parent_id else None
    reference_id = uuid.UUID(payload.reference_id) if payload.reference_id else None
    position = payload.position
    if parent_id is None:
        position = InsertPosition.ROOT

    svc = OfficeNestedSetService(db)
    office = await svc.create_node(
        office_code=office_code,
        office_name=payload.office_name.strip(),
        parent_id=parent_id,
        position=position,
        reference_id=reference_id,
        office_short_code=payload.office_short_code,
        ncrb_id=payload.ncrb_id,
        office_type_id=payload.office_type_id,
        head_rank=payload.head_rank,
        is_parent_unit=payload.is_parent_unit,
        district_id=payload.district_id,
        list_order=payload.list_order,
        is_active=payload.is_active,
    )
    logger.info("office_created", office_code=office_code, by=current_user.role_name)
    all_offices = await repo.list_all(include_inactive=True)
    return _to_flat_node(office, all_offices)


@router.patch("/{office_id}", response_model=OfficeNodeResponse)
async def update_office(
    office_id: str,
    payload: UpdateOfficeRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfficeNodeResponse:
    svc = OfficeNestedSetService(db)
    repo = OfficeRepository(db)
    office = await svc.get_by_id(uuid.UUID(office_id))
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(office, key, value)
    await repo.update(office)
    all_offices = await repo.list_all(include_inactive=True)
    return _to_flat_node(office, all_offices)


@router.post("/{office_id}/move", response_model=OfficeNodeResponse)
async def move_office(
    office_id: str,
    payload: MoveOfficeRequest,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfficeNodeResponse:
    svc = OfficeNestedSetService(db)
    new_parent_id = uuid.UUID(payload.new_parent_id) if payload.new_parent_id else None
    reference_id = uuid.UUID(payload.reference_id) if payload.reference_id else None
    office = await svc.move_node(
        uuid.UUID(office_id),
        new_parent_id=new_parent_id,
        position=payload.position,
        reference_id=reference_id,
    )
    all_offices = await OfficeRepository(db).list_all(include_inactive=True)
    return _to_flat_node(office, all_offices)


@router.get("/{office_id}/deletion-check", response_model=OfficeDeletionCheckResponse)
async def check_office_deletion(
    office_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfficeDeletionCheckResponse:
    svc = OfficeNestedSetService(db)
    repo = OfficeRepository(db)
    oid = uuid.UUID(office_id)
    office = await svc.get_by_id(oid)
    descendants = await svc.count_descendants(oid)
    assignments = await repo.count_assignments_in_subtree(office)
    blockers: list[str] = []
    if descendants:
        blockers.append(
            f"Has {descendants} descendant office(s). The entire subtree will be removed."
        )
    if assignments:
        blockers.append(
            f"{assignments} user assignment(s) in this subtree. Reassign users before delete."
        )
    return OfficeDeletionCheckResponse(
        can_delete=assignments == 0,
        blockers=blockers,
        descendant_count=descendants,
    )


@router.delete("/{office_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_office(
    office_id: str,
    current_user: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    subtree: bool = Query(True, description="Delete node and all descendants"),
) -> None:
    svc = OfficeNestedSetService(db)
    repo = OfficeRepository(db)
    oid = uuid.UUID(office_id)
    office = await svc.get_by_id(oid)
    assignments = await repo.count_assignments_in_subtree(office)
    if assignments:
        raise IIPException(
            status_code=400,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Cannot delete office subtree with user assignments.",
        )
    if subtree:
        await svc.delete_subtree(oid)
    else:
        descendants = await svc.count_descendants(oid)
        if descendants:
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="Office has descendants. Use subtree=true or delete children first.",
            )
        await svc.delete_subtree(oid)
    logger.info("office_deleted", office_id=office_id, by=current_user.role_name)


@router.post("/import-legacy", response_model=LegacyImportResponse)
async def import_legacy_office_tree(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    replace: bool = Query(False, description="Replace previously imported legacy rows first"),
) -> LegacyImportResponse:
    """Import Kerala police unit hierarchy from bundled legacy SQL export."""
    if not _LEGACY_UNIT_SQL.is_file():
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail=f"Legacy unit seed file not found at {_LEGACY_UNIT_SQL}",
        )
    stats = await import_legacy_units_from_sql(db, _LEGACY_UNIT_SQL, replace=replace)
    mode = "nested-set export" if stats.get("uses_nested_set") else "inferred hierarchy"
    synced = stats.get("synced", 0)
    if stats["imported"]:
        msg = f"Imported {stats['imported']} offices from {stats['parsed']} legacy units ({mode})."
        if synced:
            msg += f" Synced metadata (NCRB ID, unit type, etc.) on {synced} existing rows."
    elif synced:
        msg = (
            f"No new offices imported. Synced legacy metadata (including NCRB ID) on {synced} "
            f"existing offices from {stats['parsed']} legacy units."
        )
    else:
        msg = "No new offices imported (legacy data may already be loaded)."
    return LegacyImportResponse(
        message=msg,
        parsed=stats["parsed"],
        imported=stats["imported"],
        skipped_existing=stats["skipped_existing"],
        synced=synced,
        rebuild_nodes=stats["rebuild_nodes"],
    )


@router.post("/sync-legacy-metadata", response_model=LegacySyncResponse)
async def sync_legacy_office_metadata(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LegacySyncResponse:
    """Backfill ncrb_id, unit type, and related fields from bundled legacy export."""
    if not _LEGACY_UNIT_SQL.is_file():
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail=f"Legacy unit seed file not found at {_LEGACY_UNIT_SQL}",
        )
    sql_text = _LEGACY_UNIT_SQL.read_text(encoding="utf-8", errors="replace")
    units = parse_units_sql(sql_text)
    if not units:
        raise IIPException(
            status_code=400,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="No units parsed from legacy export.",
        )
    synced = await sync_legacy_metadata(db, units)
    msg = (
        f"Synced legacy metadata on {synced} offices (NCRB ID, unit type, head rank, etc.)."
        if synced
        else "No imported legacy offices found to sync."
    )
    return LegacySyncResponse(parsed=len(units), synced=synced, message=msg)


@router.post("/rebuild", response_model=RebuildResponse)
async def rebuild_office_tree(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RebuildResponse:
    nodes = await OfficeNestedSetService(db).rebuild_forest()
    return RebuildResponse(
        nodes_updated=nodes,
        message="Nested-set indices rebuilt from parent_id hierarchy.",
    )


def _to_flat_node(office: Office, all_offices: list[Office]) -> OfficeNodeResponse:
    child_count = sum(1 for o in all_offices if o.parent_id == office.id)
    descendant_count = (office.rgt - office.lft - 1) // 2
    return OfficeNodeResponse(
        office_id=str(office.id),
        office_code=office.office_code,
        office_name=office.office_name,
        office_short_code=office.office_short_code,
        ncrb_id=office.ncrb_id,
        office_type_id=office.office_type_id,
        head_rank=office.head_rank,
        is_parent_unit=office.is_parent_unit,
        district_id=office.district_id,
        list_order=office.list_order,
        is_active=office.is_active,
        parent_id=str(office.parent_id) if office.parent_id else None,
        lft=office.lft,
        rgt=office.rgt,
        hlevel=office.hlevel,
        root_id=str(office.root_id) if office.root_id else None,
        child_count=child_count,
        descendant_count=descendant_count,
    )


def _build_forest(offices: list[Office]) -> list[OfficeNodeResponse]:
    by_parent: dict[str | None, list[Office]] = {}
    for o in offices:
        key = str(o.parent_id) if o.parent_id else None
        by_parent.setdefault(key, []).append(o)

    def build(parent_key: str | None) -> list[OfficeNodeResponse]:
        nodes = []
        for o in sorted(by_parent.get(parent_key, []), key=lambda x: (x.list_order or 9999, x.lft)):
            flat = _to_flat_node(o, offices)
            flat.children = build(str(o.id))
            nodes.append(flat)
        return nodes

    return build(None)
