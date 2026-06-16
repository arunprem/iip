from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field

from iip_core.auth import CurrentUser, bearer_scheme
from fastapi.security import HTTPAuthorizationCredentials
from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iam_svc.dependencies import (
    can_read_cross_unit,
    get_current_user_db,
    get_office_id,
    require_humint_vault_access,
)
from iam_svc.models.role import Role
from iam_svc.repositories.humint_report_repository import HumintReportRepository
from iam_svc.services.document_storage import save_document
from iam_svc.services.humint_ml_client import (
    index_humint_report,
    process_humint_attachment,
    search_humint_reports_semantic,
)

router = APIRouter()

VALID_REPORT_TYPES = {"TIP", "EVENT", "FIELD_OBSERVATION", "INTELLIGENCE_REPORT", "FOLLOW_UP"}
VALID_STATUSES = {"DRAFT", "SUBMITTED", "REVIEWED", "ACTIONED", "CLOSED"}


class HumintReportCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=3, max_length=255)
    report_type: str = Field(alias="reportType")
    narrative: str = Field(min_length=10)
    event_at: str = Field(default="", alias="eventAt")
    location_text: str = Field(default="", alias="locationText")
    latitude: str = ""
    longitude: str = ""
    urgency: str = ""
    supervisor_cross_unit_visible: bool = Field(False, alias="supervisorCrossUnitVisible")
    linked_suspect_dossier_id: str | None = Field(None, alias="linkedSuspectDossierId")
    linked_case_ref: str = Field(default="", alias="linkedCaseRef")
    linked_hotspot_label: str = Field(default="", alias="linkedHotspotLabel")
    linked_graph_node_id: str = Field(default="", alias="linkedGraphNodeId")
    llm_summary: str = Field(default="", alias="llmSummary")
    llm_structured_report: str = Field(default="", alias="llmStructuredReport")
    llm_entities: dict[str, Any] | None = Field(default=None, alias="llmEntities")
    search_text: str = Field(default="", alias="searchText")
    status: str = "DRAFT"


class HumintAttachmentResponse(BaseModel):
    id: str
    attachment_type: str
    file_name: str
    content_type: str | None = None
    object_key: str
    file_size_bytes: int | None = None
    extracted_text: str | None = None
    ocr_text: str | None = None
    vision_caption: str | None = None
    audio_transcript: str | None = None
    vector_status: str


class HumintReportResponse(BaseModel):
    id: str
    office_id: str
    reported_by: str
    title: str
    report_type: str
    status: str
    narrative: str
    event_at: str | None = None
    location_text: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    urgency: str | None = None
    supervisor_cross_unit_visible: bool
    linked_suspect_dossier_id: str | None = None
    linked_case_ref: str | None = None
    linked_hotspot_label: str | None = None
    linked_graph_node_id: str | None = None
    llm_summary: str | None = None
    llm_structured_report: str | None = None
    llm_entities: dict[str, Any] | None = None
    attachments: list[HumintAttachmentResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


class HumintReportListResponse(BaseModel):
    reports: list[HumintReportResponse]
    total: int
    page: int
    page_size: int


class HumintSemanticSearchHit(BaseModel):
    report_id: str
    title: str | None = None
    report_type: str | None = None
    status: str | None = None
    urgency: str | None = None
    location_text: str | None = None
    linked_case_ref: str | None = None
    linked_hotspot_label: str | None = None
    score: float = 0.0
    search_text: str | None = None


class HumintSemanticSearchRequest(BaseModel):
    query: str
    size: int = 10


class HumintSemanticSearchResponse(BaseModel):
    hits: list[HumintSemanticSearchHit] = Field(default_factory=list)


def _to_report_response(row) -> HumintReportResponse:
    return HumintReportResponse(
        id=str(row.id),
        office_id=str(row.office_id),
        reported_by=str(row.reported_by),
        title=row.title,
        report_type=row.report_type,
        status=row.status,
        narrative=row.narrative,
        event_at=row.event_at,
        location_text=row.location_text,
        latitude=row.latitude,
        longitude=row.longitude,
        urgency=row.urgency,
        supervisor_cross_unit_visible=row.supervisor_cross_unit_visible,
        linked_suspect_dossier_id=str(row.linked_suspect_dossier_id) if row.linked_suspect_dossier_id else None,
        linked_case_ref=row.linked_case_ref,
        linked_hotspot_label=row.linked_hotspot_label,
        linked_graph_node_id=row.linked_graph_node_id,
        llm_summary=row.llm_summary,
        llm_structured_report=row.llm_structured_report,
        llm_entities=row.llm_entities,
        attachments=[
            HumintAttachmentResponse(
                id=str(att.id),
                attachment_type=att.attachment_type,
                file_name=att.file_name,
                content_type=att.content_type,
                object_key=att.object_key,
                file_size_bytes=att.file_size_bytes,
                extracted_text=att.extracted_text,
                ocr_text=att.ocr_text,
                vision_caption=att.vision_caption,
                audio_transcript=att.audio_transcript,
                vector_status=att.vector_status,
            )
            for att in row.attachments
        ],
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _to_index_payload(row) -> dict[str, Any]:
    return {
        "reportId": str(row.id),
        "officeId": str(row.office_id),
        "supervisorCrossUnitVisible": row.supervisor_cross_unit_visible,
        "title": row.title,
        "reportType": row.report_type,
        "status": row.status,
        "urgency": row.urgency,
        "narrative": row.narrative,
        "locationText": row.location_text,
        "linkedCaseRef": row.linked_case_ref,
        "linkedHotspotLabel": row.linked_hotspot_label,
        "llmSummary": row.llm_summary,
        "llmStructuredReport": row.llm_structured_report,
        "llmEntities": row.llm_entities,
        "createdAt": row.created_at.isoformat(),
        "attachments": [
            {
                "attachment_type": att.attachment_type,
                "file_name": att.file_name,
                "extracted_text": att.extracted_text,
                "ocr_text": att.ocr_text,
                "vision_caption": att.vision_caption,
                "audio_transcript": att.audio_transcript,
            }
            for att in row.attachments
        ],
    }


@router.get("", response_model=HumintReportListResponse)
async def list_humint_reports(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_humint_vault_access)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: str | None = Query(None, max_length=200),
    report_type: str | None = Query(None, alias="reportType"),
    status_filter: str | None = Query(None, alias="status"),
) -> HumintReportListResponse:
    _ = current_user
    repo = HumintReportRepository(db)
    rows, total = await repo.list_reports(
        office_id=office_id,
        cross_unit=await can_read_cross_unit(role, db),
        q=q,
        report_type=report_type,
        status=status_filter,
        page=page,
        page_size=page_size,
    )
    return HumintReportListResponse(
        reports=[_to_report_response(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=HumintReportResponse, status_code=status.HTTP_201_CREATED)
async def create_humint_report(
    body: HumintReportCreateRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    _role: Annotated[Role, Depends(require_humint_vault_access)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HumintReportResponse:
    if body.report_type not in VALID_REPORT_TYPES:
        raise IIPException(status_code=400, error_code=ErrorCode.VALIDATION_ERROR, detail="Invalid HUMINT report type")
    if body.status not in VALID_STATUSES:
        raise IIPException(status_code=400, error_code=ErrorCode.VALIDATION_ERROR, detail="Invalid HUMINT report status")

    repo = HumintReportRepository(db)
    row = await repo.create_report(
        {
            "office_id": office_id,
            "reported_by": uuid.UUID(current_user.user_id),
            "title": body.title.strip(),
            "report_type": body.report_type,
            "status": body.status,
            "narrative": body.narrative.strip(),
            "event_at": body.event_at.strip() or None,
            "location_text": body.location_text.strip() or None,
            "latitude": body.latitude.strip() or None,
            "longitude": body.longitude.strip() or None,
            "urgency": body.urgency.strip() or None,
            "supervisor_cross_unit_visible": body.supervisor_cross_unit_visible,
            "linked_suspect_dossier_id": uuid.UUID(body.linked_suspect_dossier_id) if body.linked_suspect_dossier_id else None,
            "linked_case_ref": body.linked_case_ref.strip() or None,
            "linked_hotspot_label": body.linked_hotspot_label.strip() or None,
            "linked_graph_node_id": body.linked_graph_node_id.strip() or None,
            "llm_summary": body.llm_summary.strip() or None,
            "llm_structured_report": body.llm_structured_report.strip() or None,
            "llm_entities": body.llm_entities,
            "search_text": body.search_text.strip() or body.narrative.strip(),
        }
    )
    await repo.session.refresh(row)
    row = await repo.get_report(row.id) or row
    await index_humint_report(access_token=credentials.credentials, payload=_to_index_payload(row))
    return _to_report_response(row)


@router.post("/search/semantic", response_model=HumintSemanticSearchResponse)
async def semantic_search_humint_reports(
    body: HumintSemanticSearchRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    role: Annotated[Role, Depends(require_humint_vault_access)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HumintSemanticSearchResponse:
    _ = current_user
    result = await search_humint_reports_semantic(
        access_token=credentials.credentials,
        payload={
            "query": body.query,
            "officeId": str(office_id),
            "allowCrossUnit": await can_read_cross_unit(role, db),
            "size": body.size,
        },
    )
    hits = (result or {}).get("hits") or []
    return HumintSemanticSearchResponse(hits=[HumintSemanticSearchHit(**hit) for hit in hits])


@router.get("/{report_id}", response_model=HumintReportResponse)
async def get_humint_report(
    report_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_humint_vault_access)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HumintReportResponse:
    _ = current_user
    repo = HumintReportRepository(db)
    row = await repo.get_report(report_id)
    if row is None:
        raise IIPException(status_code=404, error_code=ErrorCode.NOT_FOUND, detail="HUMINT report not found")
    cross_unit = await can_read_cross_unit(role, db)
    if row.office_id != office_id and not (cross_unit and row.supervisor_cross_unit_visible):
        raise IIPException(status_code=403, error_code=ErrorCode.FORBIDDEN, detail="You do not have permission to view this HUMINT report")
    return _to_report_response(row)


@router.post("/{report_id}/attachments", response_model=HumintAttachmentResponse, status_code=status.HTTP_201_CREATED)
async def upload_humint_attachment(
    report_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    role: Annotated[Role, Depends(require_humint_vault_access)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    attachment_type: str = Form(..., alias="attachmentType"),
    file: UploadFile = File(...),
) -> HumintAttachmentResponse:
    repo = HumintReportRepository(db)
    report = await repo.get_report(report_id)
    if report is None:
        raise IIPException(status_code=404, error_code=ErrorCode.NOT_FOUND, detail="HUMINT report not found")
    cross_unit = await can_read_cross_unit(role, db)
    if report.office_id != office_id and not (cross_unit and report.supervisor_cross_unit_visible):
        raise IIPException(status_code=403, error_code=ErrorCode.FORBIDDEN, detail="You do not have permission to modify this HUMINT report")

    kind = attachment_type.strip().upper()
    if kind not in {"PHOTO", "AUDIO", "DOCUMENT"}:
        raise IIPException(status_code=400, error_code=ErrorCode.VALIDATION_ERROR, detail="Invalid attachment type")

    raw = await file.read()
    if not raw:
        raise IIPException(status_code=400, error_code=ErrorCode.VALIDATION_ERROR, detail="Empty attachment")
    await file.seek(0)
    object_key = await save_document(domain="humint-report", entity_id=str(report_id), upload=file)
    att = await repo.add_attachment(
        {
            "report_id": report_id,
            "uploaded_by": uuid.UUID(current_user.user_id),
            "attachment_type": kind,
            "file_name": (file.filename or "attachment").strip() or "attachment",
            "content_type": file.content_type,
            "object_key": object_key,
            "file_size_bytes": len(raw),
            "vector_status": "PENDING",
        }
    )
    processed = await process_humint_attachment(
        access_token=credentials.credentials,
        payload={
            "objectKey": object_key,
            "attachmentType": kind,
            "fileName": att.file_name,
            "contentType": att.content_type,
        },
    )
    if processed:
        await repo.update_attachment_extraction(
            att.id,
            extracted_text=processed.get("extracted_text"),
            ocr_text=processed.get("ocr_text"),
            vision_caption=processed.get("vision_caption"),
            audio_transcript=processed.get("audio_transcript"),
            vector_status=str(processed.get("vector_status") or "PENDING"),
        )
        updated_report = await repo.get_report(report_id)
        if updated_report is not None:
            attachment_blobs = []
            for item in updated_report.attachments:
                for part in [item.extracted_text, item.ocr_text, item.vision_caption, item.audio_transcript]:
                    if part:
                        attachment_blobs.append(part)
            updated_search_text = "\n".join(
                part
                for part in [updated_report.search_text, "\n\n".join(attachment_blobs) if attachment_blobs else None]
                if part
            )
            await repo.update_report_enrichment(
                report_id,
                llm_summary=updated_report.llm_summary,
                llm_structured_report=updated_report.llm_structured_report,
                llm_entities=updated_report.llm_entities,
                search_text=updated_search_text,
            )
            refreshed = await repo.get_report(report_id)
            if refreshed is not None:
                await index_humint_report(access_token=credentials.credentials, payload=_to_index_payload(refreshed))
                att = next((item for item in refreshed.attachments if item.id == att.id), att)
    return HumintAttachmentResponse(
        id=str(att.id),
        attachment_type=att.attachment_type,
        file_name=att.file_name,
        content_type=att.content_type,
        object_key=att.object_key,
        file_size_bytes=att.file_size_bytes,
        extracted_text=att.extracted_text,
        ocr_text=att.ocr_text,
        vision_caption=att.vision_caption,
        audio_transcript=att.audio_transcript,
        vector_status=att.vector_status,
    )
