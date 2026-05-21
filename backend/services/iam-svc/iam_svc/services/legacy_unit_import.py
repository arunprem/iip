"""Import legacy MySQL unit export into iam.offices (nested-set aware)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from iam_svc.models.office import Office

KERALA_STATE_ID = 1012

# Full export: id, ncrb_id, unit_name, unit_short_code, idunittype, head_rank,
# is_parent_unit, dist, list_order, is_qdata, status, parent_id, lft, rgt, hlevel, root_id
TUPLE_RE_NESTED = re.compile(
    r"\((\d+),(?:'([^']*)'|NULL),'([^']*)','([^']*)',"
    r"(\d+),(\d+),(\d+),(NULL|\d+),(NULL|\d+),(\d+),(\d+),"
    r"(\d+),(\d+),(\d+),(\d+),(\d+)\)"
)

# Legacy 11-column export (no nested set) — kept for backward compatibility
TUPLE_RE_LEGACY = re.compile(
    r"\("
    r"(\d+),"
    r"(?:'([^']*)'|NULL),"
    r"(\d+),"
    r"(\d+),"
    r"'([^']*)',"
    r"'([^']*)',"
    r"(\d+|NULL),"
    r"(\d+|NULL),"
    r"(\d+),"
    r"(\d+),"
    r"(\d+)"
    r"\)"
)


def _sql_str(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip()
    return None if not s else s


def _sql_int(raw: str | None) -> int | None:
    if raw is None or raw == "NULL":
        return None
    return int(raw)


@dataclass
class LegacyUnit:
    id: int
    ncrb_id: str | None
    unit_name: str
    unit_short_code: str
    idunittype: int
    head_rank: int
    is_parent_unit: bool
    dist: int | None
    list_order: int | None
    is_qdata: bool
    status: bool
    parent_id: int
    lft: int
    rgt: int
    hlevel: int
    root_id: int
    has_nested_set: bool = True


def _parse_nested(m: re.Match[str]) -> LegacyUnit:
    return LegacyUnit(
        id=int(m.group(1)),
        ncrb_id=_sql_str(m.group(2)),
        unit_name=m.group(3).strip(),
        unit_short_code=m.group(4).strip(),
        idunittype=int(m.group(5)),
        head_rank=int(m.group(6)),
        is_parent_unit=bool(int(m.group(7))),
        dist=_sql_int(m.group(8)),
        list_order=_sql_int(m.group(9)),
        is_qdata=bool(int(m.group(10))),
        status=bool(int(m.group(11))),
        parent_id=int(m.group(12)),
        lft=int(m.group(13)),
        rgt=int(m.group(14)),
        hlevel=int(m.group(15)),
        root_id=int(m.group(16)),
        has_nested_set=True,
    )


def _parse_legacy_flat(m: re.Match[str]) -> LegacyUnit:
    dist_raw, list_order_raw = m.group(7), m.group(8)
    return LegacyUnit(
        id=int(m.group(1)),
        ncrb_id=_sql_str(m.group(2)),
        unit_name=m.group(5).strip(),
        unit_short_code=m.group(6).strip(),
        idunittype=int(m.group(3)),
        head_rank=int(m.group(4)),
        is_parent_unit=bool(int(m.group(9))),
        dist=_sql_int(dist_raw),
        list_order=_sql_int(list_order_raw),
        is_qdata=bool(int(m.group(10))),
        status=bool(int(m.group(11))),
        parent_id=0,
        lft=0,
        rgt=0,
        hlevel=0,
        root_id=0,
        has_nested_set=False,
    )


def parse_units_sql(sql_text: str) -> list[LegacyUnit]:
    """Parse unit rows; prefers nested-set column layout when present."""
    if "parent_id" in sql_text and "root_id" in sql_text:
        units = [_parse_nested(m) for m in TUPLE_RE_NESTED.finditer(sql_text)]
        if units:
            return _ensure_kerala_state_root(units)
    units = [_parse_legacy_flat(m) for m in TUPLE_RE_LEGACY.finditer(sql_text)]
    return units


def _ensure_kerala_state_root(units: list[LegacyUnit]) -> list[LegacyUnit]:
    """Export references root_id=1012 but may omit the KERALA STATE row."""
    by_id = {u.id: u for u in units}
    if KERALA_STATE_ID in by_id:
        return units
    max_rgt = max((u.rgt for u in units if u.root_id == KERALA_STATE_ID), default=0)
    units.append(
        LegacyUnit(
            id=KERALA_STATE_ID,
            ncrb_id=None,
            unit_name="KERALA STATE",
            unit_short_code="KERALA STATE",
            idunittype=24,
            head_rank=0,
            is_parent_unit=False,
            dist=None,
            list_order=None,
            is_qdata=False,
            status=True,
            parent_id=0,
            lft=1,
            rgt=max(max_rgt + 1, 2),
            hlevel=0,
            root_id=KERALA_STATE_ID,
            has_nested_set=True,
        )
    )
    return units


def _make_office_code(unit: LegacyUnit, used: set[str]) -> str:
    base = unit.unit_short_code or f"UNIT-{unit.id}"
    base = re.sub(r"[^A-Za-z0-9]+", "-", base.upper()).strip("-")[:40] or f"UNIT-{unit.id}"
    code = base
    suffix = 1
    while code in used:
        code = f"{base}-{unit.id}" if suffix == 1 else f"{base}-{unit.id}-{suffix}"
        suffix += 1
    used.add(code)
    return code


def _resolve_parent_legacy_id(unit: LegacyUnit, legacy_to_uuid: dict[int, object]) -> object | None:
    pid = unit.parent_id
    if pid == 0 or pid == unit.id:
        # Orphan rows at end of export (no nested-set row) → hang under Kerala State
        if unit.lft == 0 and unit.rgt == 0 and KERALA_STATE_ID in legacy_to_uuid:
            return legacy_to_uuid[KERALA_STATE_ID]
        return None
    if pid in legacy_to_uuid:
        return legacy_to_uuid[pid]
    if pid == KERALA_STATE_ID and KERALA_STATE_ID in legacy_to_uuid:
        return legacy_to_uuid[KERALA_STATE_ID]
    return None


def _resolve_root_uuid(unit: LegacyUnit, legacy_to_uuid: dict[int, object]) -> object | None:
    rid = unit.root_id
    if rid and rid in legacy_to_uuid:
        return legacy_to_uuid[rid]
    if KERALA_STATE_ID in legacy_to_uuid:
        return legacy_to_uuid[KERALA_STATE_ID]
    return None


async def sync_legacy_metadata(
    session: AsyncSession,
    units: list[LegacyUnit],
) -> int:
    """Backfill ncrb_id and legacy unit fields on offices already imported by legacy_unit_id."""
    by_legacy_id = {u.id: u for u in units}
    if not by_legacy_id:
        return 0

    result = await session.execute(
        select(Office).where(Office.legacy_unit_id.in_(by_legacy_id.keys()))
    )
    updated = 0
    for office in result.scalars().all():
        unit = by_legacy_id.get(office.legacy_unit_id)
        if unit is None:
            continue
        office.ncrb_id = unit.ncrb_id
        office.office_type_id = unit.idunittype
        office.head_rank = unit.head_rank
        if unit.unit_short_code:
            office.office_short_code = unit.unit_short_code
        office.district_id = unit.dist
        office.list_order = unit.list_order
        office.is_parent_unit = unit.is_parent_unit
        updated += 1

    if updated:
        await session.flush()
    return updated


async def import_legacy_units_from_sql(
    session: AsyncSession,
    sql_path: Path,
    *,
    replace: bool = False,
) -> dict[str, int]:
    """Import units using legacy parent_id and nested-set indices when available."""
    sql_text = sql_path.read_text(encoding="utf-8", errors="replace")
    units = parse_units_sql(sql_text)
    if not units:
        raise ValueError(f"No units parsed from {sql_path}")

    uses_nested_set = any(u.has_nested_set and u.lft > 0 for u in units)

    if replace:
        await session.execute(delete(Office).where(Office.legacy_unit_id.isnot(None)))

    existing = await session.execute(
        select(Office.legacy_unit_id).where(Office.legacy_unit_id.isnot(None))
    )
    existing_ids = {row[0] for row in existing.all()}
    if existing_ids and not replace:
        synced = await sync_legacy_metadata(session, units)
        return {
            "parsed": len(units),
            "imported": 0,
            "skipped_existing": len(existing_ids),
            "synced": synced,
            "rebuild_nodes": 0,
            "uses_nested_set": uses_nested_set,
        }

    used_codes: set[str] = set()
    legacy_to_uuid: dict[int, object] = {}

    # Pass 1: insert rows (order by lft when nested set present)
    sort_key = lambda u: (u.lft if u.has_nested_set and u.lft else u.id, u.id)
    for unit in sorted(units, key=sort_key):
        if unit.id in existing_ids:
            continue
        office = Office(
            office_code=_make_office_code(unit, used_codes),
            office_name=unit.unit_name or f"Unit {unit.id}",
            office_short_code=unit.unit_short_code or None,
            ncrb_id=unit.ncrb_id,
            office_type_id=unit.idunittype,
            head_rank=unit.head_rank,
            is_parent_unit=unit.is_parent_unit,
            district_id=unit.dist,
            list_order=unit.list_order,
            is_active=unit.status,
            legacy_unit_id=unit.id,
            parent_id=None,
            lft=0,
            rgt=0,
            hlevel=0,
            root_id=None,
        )
        session.add(office)
        await session.flush()
        legacy_to_uuid[unit.id] = office.id

    # Pass 2: parent links from legacy parent_id
    for unit in units:
        if unit.id not in legacy_to_uuid:
            continue
        office = await session.get(Office, legacy_to_uuid[unit.id])
        office.parent_id = _resolve_parent_legacy_id(unit, legacy_to_uuid)

    await session.flush()

    rebuild_nodes = 0
    if uses_nested_set:
        # Pass 3: apply lft/rgt/hlevel/root_id from production nested set
        for unit in units:
            if unit.id not in legacy_to_uuid or unit.lft <= 0:
                continue
            office = await session.get(Office, legacy_to_uuid[unit.id])
            office.lft = unit.lft
            office.rgt = unit.rgt
            office.hlevel = unit.hlevel
            office.root_id = _resolve_root_uuid(unit, legacy_to_uuid)
        await session.flush()
    else:
        from iam_svc.services.office_nested_set import OfficeNestedSetService

        rebuild_nodes = await OfficeNestedSetService(session).rebuild_forest()

    synced = await sync_legacy_metadata(session, units)

    return {
        "parsed": len(units),
        "imported": len(legacy_to_uuid),
        "skipped_existing": len(existing_ids) if not replace else 0,
        "synced": synced,
        "rebuild_nodes": rebuild_nodes,
        "uses_nested_set": uses_nested_set,
    }
