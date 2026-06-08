"""Map markers for mobile — suspects and future geo-tagged intelligence objects."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iam_svc.models.suspect_dossier import Suspect, SuspectAddress, SuspectDossier
from iam_svc.services.mobile_home_geo import coord_to_float


@dataclass(frozen=True)
class MapMarkerRow:
    marker_id: str
    marker_type: str
    title: str
    subtitle: str
    latitude: float
    longitude: float
    suspect_id: str | None = None
    dossier_id: str | None = None
    reference_id: str | None = None
    storage_key: str | None = None


class MobileMapRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_markers(
        self,
        *,
        office_id: uuid.UUID | None,
        cross_unit: bool,
        latitude: float | None = None,
        longitude: float | None = None,
        radius_m: float | None = None,
    ) -> list[MapMarkerRow]:
        markers: list[MapMarkerRow] = []
        markers.extend(
            await self._suspect_markers(
                office_id=office_id,
                cross_unit=cross_unit,
                latitude=latitude,
                longitude=longitude,
                radius_m=radius_m,
            )
        )
        return markers

    async def latest_dossier_id(self, suspect_id: uuid.UUID) -> uuid.UUID | None:
        stmt = (
            select(SuspectDossier.id)
            .where(
                SuspectDossier.suspect_id == suspect_id,
                SuspectDossier.status == "SUBMITTED",
            )
            .order_by(SuspectDossier.submitted_at.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def latest_dossier_id_by_master(self, master_suspect_id: uuid.UUID) -> uuid.UUID | None:
        stmt = (
            select(SuspectDossier.id)
            .where(
                SuspectDossier.master_suspect_id == master_suspect_id,
                SuspectDossier.status == "SUBMITTED",
            )
            .order_by(SuspectDossier.submitted_at.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def dossier_id_by_draft_id(self, dossier_draft_id: uuid.UUID) -> uuid.UUID | None:
        stmt = (
            select(SuspectDossier.id)
            .where(
                SuspectDossier.dossier_draft_id == dossier_draft_id,
                SuspectDossier.status == "SUBMITTED",
            )
            .order_by(SuspectDossier.submitted_at.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def resolve_frs_dossier_id(
        self,
        *,
        suspect_id: uuid.UUID | None = None,
        dossier_draft_id: uuid.UUID | None = None,
    ) -> uuid.UUID | None:
        if suspect_id is not None:
            found = await self.latest_dossier_id(suspect_id)
            if found is not None:
                return found
            found = await self.latest_dossier_id_by_master(suspect_id)
            if found is not None:
                return found
        if dossier_draft_id is not None:
            return await self.dossier_id_by_draft_id(dossier_draft_id)
        return None

    async def _suspect_markers(
        self,
        *,
        office_id: uuid.UUID | None,
        cross_unit: bool,
        latitude: float | None,
        longitude: float | None,
        radius_m: float | None,
    ) -> list[MapMarkerRow]:
        from iam_svc.services.mobile_home_geo import bounding_box, haversine_distance_m

        stmt = (
            select(Suspect)
            .join(SuspectDossier, SuspectDossier.suspect_id == Suspect.id)
            .join(SuspectAddress, SuspectAddress.suspect_id == Suspect.id)
            .where(
                SuspectDossier.status == "SUBMITTED",
                SuspectAddress.latitude.isnot(None),
                SuspectAddress.longitude.isnot(None),
            )
            .options(
                selectinload(Suspect.addresses),
                selectinload(Suspect.dossiers),
                selectinload(Suspect.photos),
            )
            .distinct()
        )
        if not cross_unit and office_id is not None:
            stmt = stmt.where(SuspectDossier.office_id == office_id)

        if latitude is not None and longitude is not None and radius_m is not None:
            min_lat, max_lat, min_lon, max_lon = bounding_box(latitude, longitude, radius_m)
            stmt = stmt.where(
                SuspectAddress.latitude >= min_lat,
                SuspectAddress.latitude <= max_lat,
                SuspectAddress.longitude >= min_lon,
                SuspectAddress.longitude <= max_lon,
            )

        result = await self._session.execute(stmt)
        suspects = list(result.scalars().unique().all())
        rows: list[MapMarkerRow] = []

        for suspect in suspects:
            dossier = _latest_dossier(suspect)
            if not dossier:
                continue
            for addr in suspect.addresses or []:
                lat = coord_to_float(addr.latitude)
                lon = coord_to_float(addr.longitude)
                if lat is None or lon is None:
                    continue
                if (
                    latitude is not None
                    and longitude is not None
                    and radius_m is not None
                ):
                    dist = haversine_distance_m(latitude, longitude, lat, lon)
                    if dist > radius_m:
                        continue
                label = "Permanent" if addr.is_permanent else "Present"
                locality = addr.village_town_city or addr.locality or addr.district or ""
                front = next((p for p in suspect.photos or [] if p.pose_type == "FRONT"), None)
                rows.append(
                    MapMarkerRow(
                        marker_id=f"suspect-{suspect.id}-{addr.id}",
                        marker_type="suspect",
                        title=suspect.criminal_name,
                        subtitle=locality if locality else label,
                        latitude=lat,
                        longitude=lon,
                        suspect_id=str(suspect.id),
                        dossier_id=str(dossier.id),
                        reference_id=str(dossier.id),
                        storage_key=front.storage_key if front else None,
                    )
                )
        return rows


def _latest_dossier(suspect: Suspect) -> SuspectDossier | None:
    dossiers = [d for d in (suspect.dossiers or []) if d.status == "SUBMITTED"]
    if not dossiers:
        return None
    return max(dossiers, key=lambda d: d.submitted_at)
