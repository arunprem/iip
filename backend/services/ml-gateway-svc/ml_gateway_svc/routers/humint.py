from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from iip_core.auth import CurrentUser, get_current_user
from iip_core.logging import get_logger
from ml_gateway_svc.services.humint_attachment_intel import process_humint_attachment
from ml_gateway_svc.services.humint_index import HumintIndexService

router = APIRouter()
logger = get_logger(__name__)
_humint_index = HumintIndexService()


class ProcessHumintAttachmentRequest(BaseModel):
    object_key: str = Field(alias="objectKey")
    attachment_type: str = Field(alias="attachmentType")
    file_name: str = Field(alias="fileName")
    content_type: str | None = Field(default=None, alias="contentType")


class ProcessHumintAttachmentResponse(BaseModel):
    extracted_text: str | None = None
    ocr_text: str | None = None
    vision_caption: str | None = None
    audio_transcript: str | None = None
    vector_status: str = "PENDING"


class HumintIndexAttachment(BaseModel):
    attachment_type: str
    file_name: str
    extracted_text: str | None = None
    ocr_text: str | None = None
    vision_caption: str | None = None
    audio_transcript: str | None = None


class HumintIndexReportRequest(BaseModel):
    report_id: str = Field(alias="reportId")
    office_id: str = Field(alias="officeId")
    supervisor_cross_unit_visible: bool = Field(alias="supervisorCrossUnitVisible")
    title: str
    report_type: str = Field(alias="reportType")
    status: str
    urgency: str | None = None
    narrative: str
    location_text: str | None = Field(default=None, alias="locationText")
    linked_case_ref: str | None = Field(default=None, alias="linkedCaseRef")
    linked_hotspot_label: str | None = Field(default=None, alias="linkedHotspotLabel")
    llm_summary: str | None = Field(default=None, alias="llmSummary")
    llm_structured_report: str | None = Field(default=None, alias="llmStructuredReport")
    llm_entities: dict[str, Any] | None = Field(default=None, alias="llmEntities")
    attachments: list[HumintIndexAttachment] = Field(default_factory=list)
    created_at: str | None = Field(default=None, alias="createdAt")


class HumintIndexReportResponse(BaseModel):
    indexed: bool = True


class HumintSemanticSearchRequest(BaseModel):
    query: str
    office_id: str = Field(alias="officeId")
    allow_cross_unit: bool = Field(alias="allowCrossUnit")
    size: int = 10


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


class HumintSemanticSearchResponse(BaseModel):
    hits: list[HumintSemanticSearchHit] = Field(default_factory=list)


@router.post("/process-attachment", response_model=ProcessHumintAttachmentResponse)
async def process_attachment(
    payload: ProcessHumintAttachmentRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ProcessHumintAttachmentResponse:
    _ = current_user
    try:
        result = await process_humint_attachment(
            object_key=payload.object_key,
            attachment_type=payload.attachment_type,
            filename=payload.file_name,
            content_type=payload.content_type,
        )
        return ProcessHumintAttachmentResponse(**result)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Attachment object not found") from exc
    except Exception as exc:
        logger.error("humint_attachment_processing_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HUMINT attachment processing failed: {str(exc)}",
        ) from exc


@router.post("/index-report", response_model=HumintIndexReportResponse)
async def index_report(
    payload: HumintIndexReportRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> HumintIndexReportResponse:
    _ = current_user
    attachment_blobs = []
    for attachment in payload.attachments:
        attachment_blobs.append(
            "\n".join(
                part
                for part in [
                    attachment.file_name,
                    attachment.extracted_text,
                    attachment.ocr_text,
                    attachment.vision_caption,
                    attachment.audio_transcript,
                ]
                if part
            )
        )
    entity_lines = []
    if payload.llm_entities:
        for key, value in payload.llm_entities.items():
            if isinstance(value, list) and value:
                entity_lines.append(f"{key}: {', '.join(str(v) for v in value)}")

    search_text = "\n".join(
        part
        for part in [
            payload.title,
            payload.narrative,
            payload.location_text,
            payload.linked_case_ref,
            payload.linked_hotspot_label,
            payload.llm_summary,
            payload.llm_structured_report,
            "\n".join(entity_lines) if entity_lines else None,
            "\n\n".join(blob for blob in attachment_blobs if blob),
        ]
        if part
    )
    try:
        await _humint_index.index_report(
            {
                "report_id": payload.report_id,
                "office_id": payload.office_id,
                "supervisor_cross_unit_visible": payload.supervisor_cross_unit_visible,
                "title": payload.title,
                "report_type": payload.report_type,
                "status": payload.status,
                "urgency": payload.urgency,
                "location_text": payload.location_text,
                "linked_case_ref": payload.linked_case_ref,
                "linked_hotspot_label": payload.linked_hotspot_label,
                "search_text": search_text,
                "created_at": payload.created_at,
            }
        )
        return HumintIndexReportResponse(indexed=True)
    except Exception as exc:
        logger.error("humint_index_report_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HUMINT report indexing failed: {str(exc)}",
        ) from exc


@router.post("/search", response_model=HumintSemanticSearchResponse)
async def search_reports(
    payload: HumintSemanticSearchRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> HumintSemanticSearchResponse:
    _ = current_user
    try:
        hits = await _humint_index.search_reports(
            query=payload.query,
            office_id=payload.office_id,
            allow_cross_unit=payload.allow_cross_unit,
            size=payload.size,
        )
        return HumintSemanticSearchResponse(hits=[HumintSemanticSearchHit(**hit) for hit in hits])
    except Exception as exc:
        logger.error("humint_semantic_search_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HUMINT semantic search failed: {str(exc)}",
        ) from exc
