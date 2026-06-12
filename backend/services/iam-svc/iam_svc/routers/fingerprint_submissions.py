"""Mobile fingerprint tagging and web approval workflow."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field

from iip_core.auth import CurrentUser, bearer_scheme
from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iam_svc.dependencies import (
    can_read_cross_unit,
    get_current_user_db,
    get_office_id,
    require_suspect_dossier_read,
    require_suspect_dossier_update,
)
from iam_svc.models.role import Role
from iam_svc.repositories.fingerprint_submission_repository import (
    FingerprintSubmissionRepository,
    _decode_template_b64,
)
from iam_svc.repositories.office_repository import OfficeRepository
from iam_svc.repositories.suspect_dossier_repository import SuspectDossierRepository
from iam_svc.services.fingerprint_ml_client import index_submitted_fingerprint
from iam_svc.routers.suspect_dossiers import _dossier_to_summary

mobile_router = APIRouter()
intelligence_router = APIRouter()


class MobileFingerprintSubmitRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dossier_id: str = Field(alias="dossierId")
    finger_position: str = Field(alias="fingerPosition")
    template_data_b64: str = Field(alias="templateDataB64")
    template_format: str = Field(default="ISO19794-2", alias="templateFormat")
    quality_score: float | None = Field(None, alias="qualityScore")
    device_model: str | None = Field(None, alias="deviceModel")
    image_data_b64: str | None = Field(None, alias="imageDataB64")
    image_width: int | None = Field(None, alias="imageWidth")
    image_height: int | None = Field(None, alias="imageHeight")


class FingerprintSubmissionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    suspect_id: str = Field(alias="suspectId")
    dossier_id: str = Field(alias="dossierId")
    master_suspect_id: str = Field(alias="masterSuspectId")
    criminal_name: str = Field(alias="criminalName")
    finger_position: str = Field(alias="fingerPosition")
    template_format: str = Field(alias="templateFormat")
    template_hash: str = Field(alias="templateHash")
    quality_score: float | None = Field(None, alias="qualityScore")
    device_model: str | None = Field(None, alias="deviceModel")
    source: str
    status: str
    captured_by: str | None = Field(None, alias="capturedBy")
    captured_at: str = Field(alias="capturedAt")
    reviewed_by: str | None = Field(None, alias="reviewedBy")
    reviewed_at: str | None = Field(None, alias="reviewedAt")
    review_notes: str | None = Field(None, alias="reviewNotes")
    office_name: str | None = Field(None, alias="officeName")


class FingerprintSubmissionListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[FingerprintSubmissionResponse]
    total: int
    page: int
    page_size: int = Field(alias="pageSize")


class ReviewFingerprintSubmissionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    review_notes: str | None = Field(None, alias="reviewNotes")


class MobileSuspectPickItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dossier_id: str = Field(alias="dossierId")
    suspect_id: str = Field(alias="suspectId")
    master_suspect_id: str = Field(alias="masterSuspectId")
    criminal_name: str = Field(alias="criminalName")
    alias_name: str | None = Field(None, alias="aliasName")
    office_name: str | None = Field(None, alias="officeName")


class MobileSuspectPickListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[MobileSuspectPickItem]
    total: int
    page: int
    page_size: int = Field(alias="pageSize")


def _row_to_response(row, office_name: str | None = None) -> FingerprintSubmissionResponse:
    return FingerprintSubmissionResponse(
        id=str(row.id),
        suspectId=str(row.suspect_id),
        dossierId=str(row.dossier_id),
        masterSuspectId=str(row.master_suspect_id),
        criminalName=row.criminal_name or "",
        fingerPosition=row.finger_position,
        templateFormat=row.template_format,
        templateHash=row.template_hash,
        qualityScore=row.quality_score,
        deviceModel=row.device_model,
        source=row.source,
        status=row.status,
        capturedBy=str(row.captured_by) if row.captured_by else None,
        capturedAt=row.captured_at.isoformat(),
        reviewedBy=str(row.reviewed_by) if row.reviewed_by else None,
        reviewedAt=row.reviewed_at.isoformat() if row.reviewed_at else None,
        reviewNotes=row.review_notes,
        officeName=office_name,
    )


@mobile_router.get(
    "/fingerprints/suspect-picks",
    response_model=MobileSuspectPickListResponse,
    response_model_by_alias=True,
)
async def list_suspects_for_fingerprint_tag(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=100),
    q: str | None = Query(None, max_length=200),
) -> MobileSuspectPickListResponse:
    """Suspect dossiers the officer may tag — all assigned offices, not only X-Office-Id."""
    _ = current_user
    cross_unit = await can_read_cross_unit(role, db)
    repo = SuspectDossierRepository(db)
    if cross_unit:
        rows, total = await repo.list_dossiers(
            page=page,
            page_size=page_size,
            q=q,
            office_id=office_id,
            cross_unit=True,
        )
    else:
        assignments = await OfficeRepository(db).get_user_offices(current_user.user_id)
        office_ids = list({a.office_id for a in assignments})
        rows, total = await repo.list_dossiers(
            page=page,
            page_size=page_size,
            q=q,
            office_ids=office_ids or None,
            office_id=office_id if not office_ids else None,
            cross_unit=False,
        )
    items: list[MobileSuspectPickItem] = []
    for row in rows:
        office_name = await repo.get_office_name(row.office_id)
        summary = _dossier_to_summary(row, office_name)
        items.append(
            MobileSuspectPickItem(
                dossierId=summary.dossier_id,
                suspectId=summary.suspect_id,
                masterSuspectId=summary.master_suspect_id,
                criminalName=summary.criminal_name,
                aliasName=summary.alias_name,
                officeName=summary.office_name,
            )
        )
    return MobileSuspectPickListResponse(
        items=items,
        total=total,
        page=page,
        pageSize=page_size,
    )


@mobile_router.post(
    "/fingerprints/submit",
    response_model=FingerprintSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_mobile_fingerprint(
    body: MobileFingerprintSubmitRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FingerprintSubmissionResponse:
    _ = role
    try:
        dossier_id = uuid.UUID(body.dossier_id.strip())
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Invalid dossier id",
        ) from exc

    template_bytes = _decode_template_b64(body.template_data_b64)
    if not template_bytes or len(template_bytes) < 32:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Fingerprint template is too small or invalid",
        )

    repo = FingerprintSubmissionRepository(db)
    dossier = await repo.get_dossier(dossier_id)
    if not dossier:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Suspect dossier not found",
        )

    cross_unit = await can_read_cross_unit(role, db)
    if not cross_unit and dossier.office_id != office_id:
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="You do not have permission to tag fingerprints for this dossier",
        )

    image_bytes = _decode_template_b64(body.image_data_b64) if body.image_data_b64 else None

    row = await repo.create_submission(
        dossier=dossier,
        finger_position=body.finger_position,
        template_bytes=template_bytes,
        template_format=body.template_format,
        captured_by=uuid.UUID(current_user.user_id),
        quality_score=body.quality_score,
        device_model=body.device_model,
        image_bytes=image_bytes,
        image_width=body.image_width,
        image_height=body.image_height,
    )
    await db.commit()
    await db.refresh(row)
    return _row_to_response(row)


@intelligence_router.get("/fingerprint-submissions", response_model=FingerprintSubmissionListResponse)
async def list_fingerprint_submissions(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str = Query("PENDING", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
) -> FingerprintSubmissionListResponse:
    _ = current_user
    repo = FingerprintSubmissionRepository(db)
    cross_unit = await can_read_cross_unit(role, db)
    rows, total = await repo.list_submissions(
        status=status_filter,
        page=page,
        page_size=page_size,
        office_id=office_id,
        cross_unit=cross_unit,
    )
    from iam_svc.repositories.suspect_dossier_repository import SuspectDossierRepository

    dossier_repo = SuspectDossierRepository(db)
    items: list[FingerprintSubmissionResponse] = []
    for row in rows:
        office_name = None
        if row.dossier and row.dossier.office_id:
            office_name = await dossier_repo.get_office_name(row.dossier.office_id)
        items.append(_row_to_response(row, office_name))
    return FingerprintSubmissionListResponse(
        items=items,
        total=total,
        page=page,
        pageSize=page_size,
    )


@intelligence_router.get("/fingerprint-submissions/{submission_id}/image")
async def get_submission_image(
    submission_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Retrieve raw grayscale fingerprint submission image, convert to PNG, and serve."""
    _ = role
    from PIL import Image
    import io
    
    repo = FingerprintSubmissionRepository(db)
    submission = await repo.get_submission(submission_id)
    if not submission:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Fingerprint submission not found",
        )
        
    cross_unit = await can_read_cross_unit(role, db)
    dossier = submission.dossier
    if not cross_unit and dossier and dossier.office_id != office_id:
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="You do not have permission to view this submission",
        )
        
    if not submission.image_data or not submission.image_width or not submission.image_height:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Fingerprint submission image data not found",
        )
        
    try:
        # Convert raw grayscale (8-bit) bytes to PNG
        img = Image.frombytes("L", (submission.image_width, submission.image_height), submission.image_data)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as exc:
         raise IIPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code=ErrorCode.UNKNOWN_ERROR,
            detail=f"Failed to process image: {str(exc)}",
        )


@intelligence_router.post(
    "/fingerprint-submissions/{submission_id}/approve",
    response_model=FingerprintSubmissionResponse,
)
async def approve_fingerprint_submission(
    submission_id: uuid.UUID,
    body: ReviewFingerprintSubmissionRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_update)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FingerprintSubmissionResponse:
    _ = role
    repo = FingerprintSubmissionRepository(db)
    submission = await repo.get_submission(submission_id)
    if not submission:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Fingerprint submission not found",
        )

    cross_unit = await can_read_cross_unit(role, db)
    dossier = submission.dossier
    if not cross_unit and dossier and dossier.office_id != office_id:
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="You do not have permission to approve this submission",
        )

    try:
        await repo.approve_submission(
            submission,
            reviewed_by=uuid.UUID(current_user.user_id),
            review_notes=body.review_notes,
        )
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=str(exc),
        ) from exc

    draft_id = (
        str(dossier.dossier_draft_id)
        if dossier and dossier.dossier_draft_id
        else str(submission.dossier_id)
    )
    await index_submitted_fingerprint(
        access_token=credentials.credentials,
        suspect_id=str(submission.master_suspect_id),
        dossier_draft_id=draft_id,
        template_id=str(submission.template_id),
        print_id=str(submission.print_id),
        finger_position=submission.finger_position,
        template_bytes=submission.template_data,
        criminal_name=submission.criminal_name or "",
        template_format=submission.template_format,
        quality_score=submission.quality_score,
        device_model=submission.device_model,
        image_bytes=submission.image_data,
        image_width=submission.image_width,
        image_height=submission.image_height,
    )
    await db.commit()
    await db.refresh(submission)
    return _row_to_response(submission)


@intelligence_router.post(
    "/fingerprint-submissions/{submission_id}/reject",
    response_model=FingerprintSubmissionResponse,
)
async def reject_fingerprint_submission(
    submission_id: uuid.UUID,
    body: ReviewFingerprintSubmissionRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_update)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FingerprintSubmissionResponse:
    _ = role
    repo = FingerprintSubmissionRepository(db)
    submission = await repo.get_submission(submission_id)
    if not submission:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Fingerprint submission not found",
        )

    cross_unit = await can_read_cross_unit(role, db)
    dossier = submission.dossier
    if not cross_unit and dossier and dossier.office_id != office_id:
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="You do not have permission to reject this submission",
        )

    try:
        await repo.reject_submission(
            submission,
            reviewed_by=uuid.UUID(current_user.user_id),
            review_notes=body.review_notes,
        )
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=str(exc),
        ) from exc

    await db.commit()
    await db.refresh(submission)
    return _row_to_response(submission)
