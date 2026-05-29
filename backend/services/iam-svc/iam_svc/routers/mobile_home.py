"""Mobile officer home — assignments feed, nearby suspects, performance dashboard."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from iip_core.auth import CurrentUser
from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.object_storage import SUSPECT_PHOTOS_PREFIX, get_object_storage
from iam_svc.dependencies import (
    can_read_cross_unit,
    get_current_user_db,
    get_office_id,
    require_suspect_dossier_read,
)
from iam_svc.models.role import Role
from iam_svc.repositories.mobile_home_repository import MobileHomeRepository
from iam_svc.repositories.mobile_map_repository import MobileMapRepository
from iam_svc.repositories.notification_repository import NotificationRepository
from iam_svc.routers.notifications import NotificationItemResponse, _row_to_response

router = APIRouter()


class NearbySuspectItem(BaseModel):
    suspect_id: str
    dossier_id: str
    criminal_name: str
    alias_name: str | None = None
    distance_m: float
    latitude: float
    longitude: float
    photo_id: str | None = None
    storage_key: str | None = None
    photo_url: str | None = None


class NearbySuspectsResponse(BaseModel):
    items: list[NearbySuspectItem]
    radius_m: float
    latitude: float
    longitude: float


class WeeklyDossierCount(BaseModel):
    label: str
    count: int


class MobileDashboardResponse(BaseModel):
    dossiers_submitted: int
    dossiers_this_week: int
    unread_notifications: int
    read_notifications: int
    weekly_dossiers: list[WeeklyDossierCount]


class MobileAssignmentsResponse(BaseModel):
    items: list[NotificationItemResponse]
    unread_count: int


def _photo_url(storage_key: str | None) -> str | None:
    if not storage_key:
        return None
    from urllib.parse import quote

    return f"/api/v1/mobile/home/suspect-photos/image?storage_key={quote(storage_key, safe='')}"


@router.get("/home/assignments", response_model=MobileAssignmentsResponse)
async def list_mobile_assignments(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(15, ge=1, le=50),
) -> MobileAssignmentsResponse:
    """Recent notifications and alerts for the signed-in officer."""
    user_id = uuid.UUID(current_user.user_id)
    repo = NotificationRepository(db)
    rows = await repo.list_for_user(user_id, limit=limit, offset=0)
    unread = await repo.count_unread(user_id)
    return MobileAssignmentsResponse(
        items=[_row_to_response(row) for row in rows],
        unread_count=unread,
    )


@router.get("/home/nearby-suspects", response_model=NearbySuspectsResponse)
async def list_nearby_suspects(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_m: float = Query(500, ge=50, le=5000),
    limit: int = Query(20, ge=1, le=50),
) -> NearbySuspectsResponse:
    _ = current_user
    cross_unit = await can_read_cross_unit(role, db)
    repo = MobileHomeRepository(db)
    rows = await repo.nearby_suspects(
        latitude=latitude,
        longitude=longitude,
        radius_m=radius_m,
        office_id=office_id,
        cross_unit=cross_unit,
        limit=limit,
    )
    items = [
        NearbySuspectItem(
            suspect_id=r.suspect_id,
            dossier_id=r.dossier_id,
            criminal_name=r.criminal_name,
            alias_name=r.alias_name,
            distance_m=r.distance_m,
            latitude=r.latitude,
            longitude=r.longitude,
            photo_id=r.photo_id,
            storage_key=r.storage_key,
            photo_url=_photo_url(r.storage_key),
        )
        for r in rows
    ]
    return NearbySuspectsResponse(
        items=items,
        radius_m=radius_m,
        latitude=latitude,
        longitude=longitude,
    )


@router.get("/home/dashboard", response_model=MobileDashboardResponse)
async def get_mobile_dashboard(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MobileDashboardResponse:
    cross_unit = await can_read_cross_unit(role, db)
    stats = await MobileHomeRepository(db).dashboard_stats(
        user_id=uuid.UUID(current_user.user_id),
        office_id=office_id,
        cross_unit=cross_unit,
    )
    return MobileDashboardResponse(
        dossiers_submitted=stats["dossiers_submitted"],
        dossiers_this_week=stats["dossiers_this_week"],
        unread_notifications=stats["unread_notifications"],
        read_notifications=stats["read_notifications"],
        weekly_dossiers=[WeeklyDossierCount(**w) for w in stats["weekly_dossiers"]],
    )


@router.get("/home/suspect-photos/image")
async def get_mobile_suspect_photo(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    _role: Annotated[Role, Depends(require_suspect_dossier_read)],
    storage_key: str = Query(..., min_length=8, max_length=512),
) -> Response:
    """Serve a suspect photo blob for mobile thumbnails (auth + READ on dossier)."""
    _ = current_user
    key = storage_key.strip()
    if not key.startswith(f"{SUSPECT_PHOTOS_PREFIX}/"):
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="Invalid photo reference.",
        )
    storage = get_object_storage()
    if not storage.enabled:
        raise IIPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            detail="Photo storage is not available.",
        )
    result = await storage.get(key)
    if not result:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Photo not found.",
        )
    data, content_type = result
    return Response(content=data, media_type=content_type)


class MapMarkerItem(BaseModel):
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


class MapMarkersResponse(BaseModel):
    items: list[MapMarkerItem]
    center_latitude: float | None = None
    center_longitude: float | None = None


class FrsSuspectDossierResponse(BaseModel):
    suspect_id: str
    dossier_id: str | None


class FrsResolveDossierResponse(BaseModel):
    dossier_id: str | None = None
    suspect_id: str | None = None
    dossier_draft_id: str | None = None


@router.get("/map/markers", response_model=MapMarkersResponse)
async def list_map_markers(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    latitude: float | None = Query(None, ge=-90, le=90),
    longitude: float | None = Query(None, ge=-180, le=180),
    radius_m: float | None = Query(800, ge=100, le=200_000),
) -> MapMarkersResponse:
    _ = current_user
    cross_unit = await can_read_cross_unit(role, db)
    repo = MobileMapRepository(db)
    rows = await repo.list_markers(
        office_id=office_id,
        cross_unit=cross_unit,
        latitude=latitude,
        longitude=longitude,
        radius_m=radius_m if latitude is not None and longitude is not None else None,
    )
    return MapMarkersResponse(
        items=[
            MapMarkerItem(
                marker_id=r.marker_id,
                marker_type=r.marker_type,
                title=r.title,
                subtitle=r.subtitle,
                latitude=r.latitude,
                longitude=r.longitude,
                suspect_id=r.suspect_id,
                dossier_id=r.dossier_id,
                reference_id=r.reference_id,
                storage_key=r.storage_key,
            )
            for r in rows
        ],
        center_latitude=latitude,
        center_longitude=longitude,
    )


@router.get("/frs/suspects/{suspect_id}/dossier", response_model=FrsSuspectDossierResponse)
async def frs_resolve_suspect_dossier(
    suspect_id: uuid.UUID,
    _current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    _role: Annotated[Role, Depends(require_suspect_dossier_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FrsSuspectDossierResponse:
    dossier_id = await MobileMapRepository(db).latest_dossier_id(suspect_id)
    return FrsSuspectDossierResponse(
        suspect_id=str(suspect_id),
        dossier_id=str(dossier_id) if dossier_id else None,
    )


@router.get("/frs/resolve-dossier", response_model=FrsResolveDossierResponse)
async def frs_resolve_dossier(
    _current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    _role: Annotated[Role, Depends(require_suspect_dossier_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    suspect_id: uuid.UUID | None = Query(None),
    dossier_draft_id: uuid.UUID | None = Query(None),
) -> FrsResolveDossierResponse:
    """Resolve submitted dossier id for a field FRS match (suspect and/or draft id from face index)."""
    if suspect_id is None and dossier_draft_id is None:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Provide suspect_id and/or dossier_draft_id",
        )
    repo = MobileMapRepository(db)
    resolved = await repo.resolve_frs_dossier_id(
        suspect_id=suspect_id,
        dossier_draft_id=dossier_draft_id,
    )
    return FrsResolveDossierResponse(
        dossier_id=str(resolved) if resolved else None,
        suspect_id=str(suspect_id) if suspect_id else None,
        dossier_draft_id=str(dossier_draft_id) if dossier_draft_id else None,
    )
