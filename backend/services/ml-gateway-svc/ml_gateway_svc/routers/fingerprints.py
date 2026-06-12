"""Fingerprint template ingest and 1:N identification (no images)."""

from __future__ import annotations

import base64
import uuid
from typing import Annotated

from pathlib import Path
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field

from iip_core.auth import CurrentUser, get_current_user
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger

from ml_gateway_svc.services.fingerprint_index import new_print_id
from ml_gateway_svc.services.fingerprint_store import get_fingerprint_store
from ml_gateway_svc.services.fingerprint_pipeline import (
    calibrate_identify_display_score,
    identify_confidence_label,
    template_hash,
    validate_template_bytes,
)
from ml_gateway_svc.services.fingerprint_quality import assess_template_quality
from ml_gateway_svc.settings import get_ml_settings

router = APIRouter()
logger = get_logger(__name__)
_settings = get_ml_settings()
_index = get_fingerprint_store()


class FingerprintMatchResponse(BaseModel):
    print_id: str
    template_id: str | None = None
    dossier_draft_id: str | None = None
    suspect_id: str | None = None
    criminal_name: str | None = None
    finger_position: str
    similarity_score: float
    display_similarity_score: float | None = Field(
        None,
        description="Calibrated confidence for field identify UI (raw overlap is much lower)",
    )
    match_confidence: str | None = Field(
        None,
        description="strong | moderate | weak — based on raw minutiae overlap",
    )


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
    image_data_b64: str | None = Field(None, alias="imageDataB64")
    image_width: int | None = Field(None, alias="imageWidth")
    image_height: int | None = Field(None, alias="imageHeight")


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
    image_data_b64: str | None = Field(None, alias="imageDataB64")
    image_width: int | None = Field(None, alias="imageWidth")
    image_height: int | None = Field(None, alias="imageHeight")


class IndexSubmittedFingerprintResponse(BaseModel):
    indexed: bool
    print_id: str
    suspect_id: str
    message: str | None = None


class FingerprintIdentifyRequest(BaseModel):
    model_config = {"populate_by_name": True}

    template_data_b64: str = Field(alias="templateDataB64")
    finger_position: str | None = Field(None, alias="fingerPosition")
    match_engine: str = Field(default="openafis", alias="matchEngine")
    image_data_b64: str | None = Field(None, alias="imageDataB64")
    image_width: int | None = Field(None, alias="imageWidth")
    image_height: int | None = Field(None, alias="imageHeight")


class FingerprintQualityResponse(BaseModel):
    grade: str
    message: str
    template_bytes: int = Field(alias="templateBytes")
    minutiae_count: int = Field(alias="minutiaeCount")
    ok: bool

    model_config = {"populate_by_name": True}


class FingerprintIdentifyResponse(BaseModel):
    matches: list[FingerprintMatchResponse]
    best_match: FingerprintMatchResponse | None = None
    probe_quality: FingerprintQualityResponse | None = Field(None, alias="probeQuality")

    model_config = {"populate_by_name": True}


class DraftDiscardResponse(BaseModel):
    deleted: bool
    dossier_draft_id: str


def _decode_optional_b64(value: str | None) -> bytes | None:
    if not value or not value.strip():
        return None
    return _decode_b64(value)


def _decode_b64(value: str) -> bytes:
    try:
        return base64.b64decode(value.strip())
    except Exception as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Invalid base64 template data",
        ) from exc


def _match_to_response(m, *, for_identify: bool = False) -> FingerprintMatchResponse:
    raw = m.similarity_score
    return FingerprintMatchResponse(
        print_id=m.print_id,
        template_id=m.template_id,
        dossier_draft_id=m.dossier_draft_id,
        suspect_id=m.suspect_id,
        criminal_name=m.criminal_name,
        finger_position=m.finger_position,
        similarity_score=raw,
        display_similarity_score=calibrate_identify_display_score(raw) if for_identify else None,
        match_confidence=identify_confidence_label(raw) if for_identify else None,
    )


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "fingerprints",
        "backend": _settings.fingerprint_backend,
    }


@router.get("/prints/{print_id}/image")
async def get_fingerprint_image(
    print_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Response:
    """Read the stored raw grayscale fingerprint image, convert it to PNG using Pillow, and return it."""
    _ = current_user
    try:
        uuid.UUID(print_id)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Invalid print ID format",
        ) from exc
    import os
    import json
    from PIL import Image
    import io
    
    meta_path = Path(_settings.nbis_images_dir) / f"{print_id}.json"
    raw_path = Path(_settings.nbis_images_dir) / f"{print_id}.raw"
    
    if not raw_path.exists() or not meta_path.exists():
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Fingerprint image not found",
        )
        
    try:
        meta = json.loads(meta_path.read_text())
        width = meta["width"]
        height = meta["height"]
        raw_data = raw_path.read_bytes()
        
        # Convert raw grayscale (8-bit) bytes to PNG
        img = Image.frombytes("L", (width, height), raw_data)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as exc:
         raise IIPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code=ErrorCode.UNKNOWN_ERROR,
            detail=f"Failed to process image: {str(exc)}",
        )



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

    logger.info(
        "fingerprint_ingest_match_start",
        dossier_draft_id=body.dossier_draft_id,
        finger_position=body.finger_position,
    )
    duplicates = await _index.find_similar(
        template_bytes,
        exclude_dossier_draft_id=body.dossier_draft_id,
        submitted_only=True,
        min_cosine=_settings.fingerprint_duplicate_min_cosine,
        apply_margin=True,
        finger_position=body.finger_position,
    )
    logger.info(
        "fingerprint_ingest_match_done",
        dossier_draft_id=body.dossier_draft_id,
        duplicate_count=len(duplicates),
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
                image_bytes=_decode_optional_b64(body.image_data_b64),
                image_width=body.image_width,
                image_height=body.image_height,
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
            message="Fingerprint search backend disabled",
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
            image_bytes=_decode_optional_b64(body.image_data_b64),
            image_width=body.image_width,
            image_height=body.image_height,
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
    engine = (body.match_engine or "openafis").strip().lower()
    if engine not in ("openafis", "nbis"):
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="matchEngine must be openafis or nbis",
        )

    template_bytes = _decode_b64(body.template_data_b64)
    image_bytes = _decode_optional_b64(body.image_data_b64)
    if engine == "nbis":
        if not image_bytes or not body.image_width or not body.image_height:
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="NBIS matching requires imageDataB64, imageWidth, and imageHeight from capture",
            )
    else:
        try:
            validate_template_bytes(template_bytes)
        except ValueError as exc:
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="Fingerprint template is too small or too large",
            ) from exc

    finger = (body.finger_position or "").strip().upper() or None
    min_cosine = (
        _settings.fingerprint_identify_min_cosine
        if finger
        else _settings.fingerprint_identify_min_cosine_any_finger
    )
    probe_quality_raw = assess_template_quality(template_bytes) if engine == "openafis" else None
    logger.info(
        "fingerprint_identify_start",
        match_engine=engine,
        finger_position=finger,
        min_cosine=min_cosine if engine == "openafis" else None,
        probe_grade=probe_quality_raw["grade"] if probe_quality_raw else None,
        probe_minutiae=probe_quality_raw["minutiae_count"] if probe_quality_raw else None,
    )
    matches = await _index.find_similar(
        template_bytes,
        submitted_only=True,
        min_cosine=min_cosine,
        apply_margin=False,
        finger_position=finger,
        identify_mode=True,
        match_engine=engine,
        image_bytes=image_bytes,
        image_width=body.image_width,
        image_height=body.image_height,
    )
    responses = [_match_to_response(m, for_identify=True) for m in matches]
    probe_quality = None
    if probe_quality_raw:
        probe_quality = FingerprintQualityResponse(
            grade=str(probe_quality_raw["grade"]),
            message=str(probe_quality_raw["message"]),
            template_bytes=int(probe_quality_raw["bytes"]),
            minutiae_count=int(probe_quality_raw["minutiae_count"]),
            ok=bool(probe_quality_raw["ok"]),
        )
    return FingerprintIdentifyResponse(
        matches=responses,
        best_match=responses[0] if responses else None,
        probe_quality=probe_quality,
    )


@router.delete("/drafts/{dossier_draft_id}", response_model=DraftDiscardResponse)
async def discard_draft_fingerprints(
    dossier_draft_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> DraftDiscardResponse:
    _ = current_user
    await _index.delete_draft_prints(dossier_draft_id)
    return DraftDiscardResponse(deleted=True, dossier_draft_id=dossier_draft_id)


class PrintDeleteResponse(BaseModel):
    deleted: bool
    print_id: str


@router.delete("/prints/{print_id}", response_model=PrintDeleteResponse)
async def delete_indexed_fingerprint(
    print_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> PrintDeleteResponse:
    _ = current_user
    await _index.delete_print(print_id)
    logger.info("fingerprint_print_deleted", print_id=print_id)
    return PrintDeleteResponse(deleted=True, print_id=print_id)
