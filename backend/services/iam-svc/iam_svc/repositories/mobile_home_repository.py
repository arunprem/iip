"""Mobile officer home — nearby suspects and performance aggregates."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iam_svc.models.suspect_dossier import Suspect, SuspectAddress, SuspectDossier
from iam_svc.models.user_notification import UserNotification
from iam_svc.services.mobile_home_geo import bounding_box, coord_to_float, haversine_distance_m


@dataclass(frozen=True)
class NearbySuspectRow:
    suspect_id: str
    dossier_id: str
    criminal_name: str
    alias_name: str | None
    distance_m: float
    latitude: float
    longitude: float
    photo_id: str | None
    storage_key: str | None


@dataclass(frozen=True)
class WeeklyCountRow:
    label: str
    count: int


class MobileHomeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def nearby_suspects(
        self,
        *,
        latitude: float,
        longitude: float,
        radius_m: float = 500.0,
        office_id: uuid.UUID | None,
        cross_unit: bool,
        limit: int = 20,
    ) -> list[NearbySuspectRow]:
        min_lat, max_lat, min_lon, max_lon = bounding_box(latitude, longitude, radius_m)

        stmt = (
            select(Suspect)
            .join(SuspectDossier, SuspectDossier.suspect_id == Suspect.id)
            .join(SuspectAddress, SuspectAddress.suspect_id == Suspect.id)
            .where(
                SuspectDossier.status == "SUBMITTED",
                SuspectAddress.latitude.isnot(None),
                SuspectAddress.longitude.isnot(None),
                SuspectAddress.latitude >= min_lat,
                SuspectAddress.latitude <= max_lat,
                SuspectAddress.longitude >= min_lon,
                SuspectAddress.longitude <= max_lon,
            )
            .options(
                selectinload(Suspect.addresses),
                selectinload(Suspect.photos),
                selectinload(Suspect.dossiers),
            )
            .distinct()
        )
        if not cross_unit and office_id is not None:
            stmt = stmt.where(SuspectDossier.office_id == office_id)

        result = await self._session.execute(stmt)
        suspects = list(result.scalars().unique().all())

        best_by_suspect: dict[uuid.UUID, NearbySuspectRow] = {}
        for suspect in suspects:
            dossier = _latest_submitted_dossier(suspect)
            if not dossier:
                continue
            front = next((p for p in suspect.photos or [] if p.pose_type == "FRONT"), None)
            for addr in suspect.addresses or []:
                lat = coord_to_float(addr.latitude)
                lon = coord_to_float(addr.longitude)
                if lat is None or lon is None:
                    continue
                dist = haversine_distance_m(latitude, longitude, lat, lon)
                if dist > radius_m:
                    continue
                row = NearbySuspectRow(
                    suspect_id=str(suspect.id),
                    dossier_id=str(dossier.id),
                    criminal_name=suspect.criminal_name,
                    alias_name=suspect.alias_name,
                    distance_m=round(dist, 1),
                    latitude=lat,
                    longitude=lon,
                    photo_id=str(front.photo_id) if front else None,
                    storage_key=front.storage_key if front else None,
                )
                existing = best_by_suspect.get(suspect.id)
                if existing is None or row.distance_m < existing.distance_m:
                    best_by_suspect[suspect.id] = row

        ranked = sorted(best_by_suspect.values(), key=lambda r: r.distance_m)
        return ranked[:limit]

    async def dashboard_stats(
        self,
        *,
        user_id: uuid.UUID,
        office_id: uuid.UUID | None,
        cross_unit: bool,
    ) -> dict:
        now = datetime.now(UTC)
        week_start = now - timedelta(days=now.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

        dossier_filters = [SuspectDossier.submitted_by == user_id, SuspectDossier.status == "SUBMITTED"]
        if not cross_unit and office_id is not None:
            dossier_filters.append(SuspectDossier.office_id == office_id)

        total_stmt = select(func.count()).select_from(SuspectDossier).where(*dossier_filters)
        week_stmt = select(func.count()).select_from(SuspectDossier).where(
            *dossier_filters,
            SuspectDossier.submitted_at >= week_start,
        )
        total_submitted = int((await self._session.execute(total_stmt)).scalar_one())
        week_submitted = int((await self._session.execute(week_stmt)).scalar_one())

        unread_stmt = (
            select(func.count())
            .select_from(UserNotification)
            .where(
                UserNotification.user_id == user_id,
                UserNotification.read_at.is_(None),
            )
        )
        read_stmt = (
            select(func.count())
            .select_from(UserNotification)
            .where(
                UserNotification.user_id == user_id,
                UserNotification.read_at.isnot(None),
            )
        )
        unread_count = int((await self._session.execute(unread_stmt)).scalar_one())
        read_count = int((await self._session.execute(read_stmt)).scalar_one())

        weekly = await self._weekly_dossier_counts(
            user_id=user_id,
            office_id=office_id,
            cross_unit=cross_unit,
            weeks=6,
        )

        return {
            "dossiers_submitted": total_submitted,
            "dossiers_this_week": week_submitted,
            "unread_notifications": unread_count,
            "read_notifications": read_count,
            "weekly_dossiers": [{"label": w.label, "count": w.count} for w in weekly],
        }

    async def _weekly_dossier_counts(
        self,
        *,
        user_id: uuid.UUID,
        office_id: uuid.UUID | None,
        cross_unit: bool,
        weeks: int,
    ) -> list[WeeklyCountRow]:
        now = datetime.now(UTC)
        # Start of current ISO week (Monday)
        current_week_start = now - timedelta(days=now.weekday())
        current_week_start = current_week_start.replace(hour=0, minute=0, second=0, microsecond=0)

        rows: list[WeeklyCountRow] = []
        for offset in range(weeks - 1, -1, -1):
            start = current_week_start - timedelta(weeks=offset)
            end = start + timedelta(days=7)
            filters = [
                SuspectDossier.submitted_by == user_id,
                SuspectDossier.status == "SUBMITTED",
                SuspectDossier.submitted_at >= start,
                SuspectDossier.submitted_at < end,
            ]
            if not cross_unit and office_id is not None:
                filters.append(SuspectDossier.office_id == office_id)
            stmt = select(func.count()).select_from(SuspectDossier).where(*filters)
            count = int((await self._session.execute(stmt)).scalar_one())
            label = start.strftime("%d %b")
            rows.append(WeeklyCountRow(label=label, count=count))
        return rows


def _latest_submitted_dossier(suspect: Suspect) -> SuspectDossier | None:
    dossiers = [d for d in (suspect.dossiers or []) if d.status == "SUBMITTED"]
    if not dossiers:
        return None
    return max(dossiers, key=lambda d: d.submitted_at or datetime.min.replace(tzinfo=UTC))
