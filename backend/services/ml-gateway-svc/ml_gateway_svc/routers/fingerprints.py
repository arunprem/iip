"""Fingerprint template ingest and 1:N identification (no images)."""

from __future__ import annotations

import base64
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from iip_core.auth import CurrentUser, get_current_user
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger

from ml_gateway_svc.services.fingerprint_index import FingerprintIndexService, new_print_id
from ml_gateway_svc.services.fingerprint_pipeline import (
    template_hash,
    validate_template_bytes,
)
from ml_gateway_svc.settings import get_ml_settings

router = APIRouter()
logger = get_logger(__name__)
_settings = get_ml_settings()
_index = FingerprintIndexService()


class FingerprintMatchResponse(BaseModel):
    print_id: str
    template_id: str | None = None
    dossier_draft_id: str | None = None
    suspect_id: str | None = None
    criminal_name: str | None = None
    finger_position: str
    similarity_score: float


class FingerprintIngestRequest(BaseModel):
    dossier_draft_id: str = Field(alias="dossierDraftId")
    template_id: str = Field(alias="templateId")
    finger_position: str = Field(alias="fingerPosition")
    template_format: str = Field(default="ISO19794-2", alias="templateFormat")
    template_data_b64: str = Field(alias="templateDataB64")
    criminal_name: str | None = Field(None, alias="criminalName")
    suspect_id: str | None = Field(None, alias="suspectId")
    quality_score: float | None = Field(None, alias="qualityScore")
    device_model: str | None = Field(None, alias="deviceModel")
    replace_print_id: str | None = Field(None, alias="replacePrintId")


class FingerprintIngestResponse(BaseModel):
    template_id: str
    print_id: str
    finger_position: str
    template_format: str
    template_hash: str
    quality_score: float | None = None
    indexed: bool
    duplicate_matches: list[FingerprintMatchResponse]
    has_duplicate: bool
    message: str | None = None


class IndexSubmittedFingerprintRequest(BaseModel):
    suspect_id: str = Field(alias="suspectId")
    dossier_draft_id: str = Field(alias="dossierDraftId")
    template_id: str = Field(alias="templateId")
    print_id: str = Field(alias="printId")
    finger_position: str = Field(alias="fingerPosition")
    template_format: str = Field(default="ISO19794-2", alias="templateFormat")
    template_data_b64: str = Field(alias="templateDataB64")
    criminal_name: str | None = Field(None, alias="criminalName")
    quality_score: float | None = Field(None, alias="qualityScore")
    device_model: str | None = Field(None, alias="deviceModel")


class IndexSubmittedFingerprintResponse(BaseModel):
    indexed: bool
    print_id: str
    suspect_id: str
    message: str | None = None


class FingerprintIdentifyRequest(BaseModel):
    template_data_b64: str = Field(alias="templateDataB64")
    finger_position: str | None = Field(None, alias="fingerPosition")


class FingerprintIdentifyResponse(BaseModel):
    matches: list[FingerprintMatchResponse]
    best_match: FingerprintMatchResponse | None = None


class DraftDiscardResponse(BaseModel):
    deleted: bool
    dossier_draft_id: str


def _decode_b64(value: str) -> bytes:
    try:
        return base64.b64decode(value.strip())
    except Exception as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Invalid base64 template data",
        ) from exc


def _match_to_response(m) -> FingerprintMatchResponse:
    return FingerprintMatchResponse(
        print_id=m.print_id,
        template_id=m.template_id,
        dossier_draft_id=m.dossier_draft_id,
        suspect_id=m.suspect_id,
        criminal_name=m.criminal_name,
        finger_position=m.finger_position,
        similarity_score=m.similarity_score,
    )


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"status": "ok", "service": "fingerprints"}


@router.post("/ingest", response_model=FingerprintIngestResponse)
async def ingest_fingerprint(
    body: FingerprintIngestRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FingerprintIngestResponse:
    template_bytes = _decode_b64(body.template_data_b64)
    try:
        validate_template_bytes(template_bytes)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Fingerprint template is too small or too large",
        ) from exc

    if body.replace_print_id:
        await _index.delete_print(body.replace_print_id)

    print_id = new_print_id()
    t_hash = template_hash(template_bytes)

    duplicates = await _index.find_similar(
        template_bytes,
        exclude_dossier_draft_id=body.dossier_draft_id,
        submitted_only=True,
        min_cosine=_settings.fingerprint_duplicate_min_cosine,
        apply_margin=True,
    )

    indexed = False
    if body.suspect_id:
        try:
            await _index.index_print(
                print_id=print_id,
                template_id=body.template_id,
                dossier_draft_id=body.dossier_draft_id,
                finger_position=body.finger_position,
                template_format=body.template_format,
                template_bytes=template_bytes,
                template_hash=t_hash,
                created_by=current_user.user_id,
                suspect_id=body.suspect_id,
                criminal_name=body.criminal_name,
                quality_score=body.quality_score,
                device_model=body.device_model,
            )
            indexed = True
        except Exception as exc:
            logger.warning("fingerprint_draft_index_failed", error=str(exc))

    dup_responses = [_match_to_response(m) for m in duplicates]
    return FingerprintIngestResponse(
        template_id=body.template_id,
        print_id=print_id,
        finger_position=body.finger_position.upper(),
        template_format=body.template_format.upper(),
        template_hash=t_hash,
        quality_score=body.quality_score,
        indexed=indexed,
        duplicate_matches=dup_responses,
        has_duplicate=len(dup_responses) > 0,
        message=None,
    )


@router.post("/index-submitted", response_model=IndexSubmittedFingerprintResponse)
async def index_submitted_fingerprint(
    body: IndexSubmittedFingerprintRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> IndexSubmittedFingerprintResponse:
    template_bytes = _decode_b64(body.template_data_b64)
    try:
        validate_template_bytes(template_bytes)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Fingerprint template is too small or too large",
        ) from exc

    try:
        uuid.UUID(body.suspect_id)
        uuid.UUID(body.print_id)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Invalid suspect or print id",
        ) from exc

    if not _index.enabled:
        return IndexSubmittedFingerprintResponse(
            indexed=False,
            print_id=body.print_id,
            suspect_id=body.suspect_id,
            message="Elasticsearch disabled — fingerprint not indexed for search",
        )

    try:
        await _index.index_print(
            print_id=body.print_id,
            template_id=body.template_id,
            dossier_draft_id=body.dossier_draft_id,
            finger_position=body.finger_position,
            template_format=body.template_format,
            template_bytes=template_bytes,
            template_hash=template_hash(template_bytes),
            created_by=current_user.user_id,
            suspect_id=body.suspect_id,
            criminal_name=body.criminal_name,
            quality_score=body.quality_score,
            device_model=body.device_model,
        )
        return IndexSubmittedFingerprintResponse(
            indexed=True,
            print_id=body.print_id,
            suspect_id=body.suspect_id,
        )
    except Exception as exc:
        logger.warning("fingerprint_index_submitted_failed", error=str(exc))
        return IndexSubmittedFingerprintResponse(
            indexed=False,
            print_id=body.print_id,
            suspect_id=body.suspect_id,
            message="Could not index fingerprint for field search",
        )


@router.post("/identify", response_model=FingerprintIdentifyResponse)
async def identify_fingerprint(
    body: FingerprintIdentifyRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FingerprintIdentifyResponse:
    _ = current_user
    template_bytes = _decode_b64(body.template_data_b64)
    try:
        validate_template_bytes(template_bytes)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Fingerprint template is too small or too large",
        ) from exc

    matches = await _index.find_similar(
        template_bytes,
        submitted_only=True,
        min_cosine=_settings.fingerprint_identify_min_cosine,
        apply_margin=True,
    )
    responses = [_match_to_response(m) for m in matches]
    return FingerprintIdentifyResponse(
        matches=responses,
        best_match=responses[0] if responses else None,
    )


@router.delete("/drafts/{dossier_draft_id}", response_model=DraftDiscardResponse)
async def discard_draft_fingerprints(
    dossier_draft_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> DraftDiscardResponse:
    _ = current_user
    await _index.delete_draft_prints(dossier_draft_id)
    return DraftDiscardResponse(deleted=True, dossier_draft_id=dossier_draft_id)
