"""
Face recognition for suspect dossiers — DeepFace validation, Elasticsearch FRS, duplicate detection.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from iip_core.auth import CurrentUser, get_current_user
from fastapi import status

from iip_core.errors import ErrorCode, IIPException
from iip_core.object_storage import get_object_storage
from iip_core.logging import get_logger

from ml_gateway_svc.services.face_index import FaceDuplicateMatch, FaceIndexService, new_face_id
from ml_gateway_svc.services.face_pipeline import (
    POSE_FRONT,
    POSE_LEFT,
    POSE_LEFT_PROFILE,
    POSE_OTHER,
    POSE_RIGHT,
    POSE_RIGHT_PROFILE,
    ALLOWED_POSE_TYPES,
    FacePipelineError,
    analyze_image_bytes,
    front_pose_acceptable,
    get_models_status,
    profile_pose_acceptable,
    profile_pose_rejection_detail,
    warmup_face_models as warmup_face_models_sync,
)

# Reference angles — stored without face/pose checks.
STORE_ONLY_POSES = frozenset({POSE_LEFT, POSE_RIGHT, POSE_OTHER})
# Optional profile slots + front — face detected and pose verified when uploaded.
FACE_CHECK_POSES = frozenset({POSE_FRONT, POSE_LEFT_PROFILE, POSE_RIGHT_PROFILE})
from ml_gateway_svc.services.suspect_photo_storage import (
    delete_suspect_photo_blob,
    discard_draft_photos,
    save_suspect_photo,
    validate_suspect_photo_storage_key,
)
from ml_gateway_svc.settings import get_ml_settings

router = APIRouter()
logger = get_logger(__name__)

_face_index = FaceIndexService()


class DuplicateMatchResponse(BaseModel):
    face_id: str
    photo_id: str | None = None
    dossier_draft_id: str | None = None
    suspect_id: str | None = None
    criminal_name: str | None = None
    storage_key: str | None = None
    pose_type: str
    similarity_score: float = Field(description="Elasticsearch kNN cosine score (higher = more similar)")


class FaceAnalyzeResponse(BaseModel):
    photo_id: str
    face_id: str
    face_detected: bool
    face_count: int
    declared_pose: str
    detected_pose: str
    pose_consistent: bool
    storage_key: str
    indexed: bool
    duplicate_matches: list[DuplicateMatchResponse]
    has_duplicate: bool
    message: str | None = None


class FaceDeleteResponse(BaseModel):
    deleted: bool
    photo_id: str


class DraftDiscardResponse(BaseModel):
    deleted: bool
    dossier_draft_id: str


def _match_to_response(m: FaceDuplicateMatch) -> DuplicateMatchResponse:
    return DuplicateMatchResponse(
        face_id=m.face_id,
        photo_id=m.photo_id,
        dossier_draft_id=m.dossier_draft_id,
        suspect_id=m.suspect_id,
        criminal_name=m.criminal_name,
        storage_key=m.storage_key,
        pose_type=m.pose_type,
        similarity_score=round(m.score, 4),
    )


@router.post("/analyze", response_model=FaceAnalyzeResponse)
async def analyze_suspect_photo(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    file: UploadFile = File(...),
    pose_type: str = Form(...),
    dossier_draft_id: str = Form(...),
    photo_id: str = Form(...),
    criminal_name: str | None = Form(None),
    suspect_id: str | None = Form(None),
    replace_face_id: str | None = Form(None),
) -> FaceAnalyzeResponse:
    """
    Validate that the image contains a face, extract embedding, store in MinIO + Elasticsearch.
    For FRONT poses, run duplicate search against submitted dossiers only (suspect_id in index).
    Draft uploads are stored in MinIO but not indexed until suspect_id is provided on submit.
    """
    settings = get_ml_settings()
    pose = pose_type.strip().upper()
    if pose not in ALLOWED_POSE_TYPES:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=f"pose_type must be one of: {', '.join(sorted(ALLOWED_POSE_TYPES))}",
            meta={"field": "pose_type"},
        )

    try:
        uuid.UUID(dossier_draft_id)
        uuid.UUID(photo_id)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="dossier_draft_id and photo_id must be valid UUIDs",
        ) from exc

    submitted_suspect_id: str | None = None
    if suspect_id and suspect_id.strip():
        try:
            uuid.UUID(suspect_id.strip())
            submitted_suspect_id = suspect_id.strip()
        except ValueError as exc:
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="suspect_id must be a valid UUID when provided",
            ) from exc

    image_bytes = await file.read()
    if not image_bytes:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Image file is empty",
            meta={"field": "file"},
        )

    if len(image_bytes) > settings.face_max_upload_bytes:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.PAYLOAD_TOO_LARGE,
            detail=f"Image must be {settings.face_max_upload_bytes // (1024 * 1024)} MB or smaller",
            meta={"field": "file"},
        )

    # Three-quarter / other angles: store only (no face or pose verification).
    if pose in STORE_ONLY_POSES:
        await file.seek(0)
        try:
            storage_key = await save_suspect_photo(
                dossier_draft_id,
                photo_id,
                file,
                max_bytes=settings.face_max_upload_bytes,
            )
        except ValueError as exc:
            code = str(exc)
            if code == "unsupported_type":
                raise IIPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code=ErrorCode.VALIDATION_ERROR,
                    detail="Use JPEG, PNG, or WebP images only",
                    meta={"field": "file"},
                ) from exc
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=str(exc),
                meta={"field": "file"},
            ) from exc
        except RuntimeError as exc:
            raise IIPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                error_code=ErrorCode.SERVICE_UNAVAILABLE,
                detail="Photo storage is not available",
            ) from exc

        logger.info(
            "suspect_photo_stored",
            user_id=current_user.user_id,
            dossier_draft_id=dossier_draft_id,
            photo_id=photo_id,
            pose=pose,
        )
        return FaceAnalyzeResponse(
            photo_id=photo_id,
            face_id="",
            face_detected=False,
            face_count=0,
            declared_pose=pose,
            detected_pose=pose,
            pose_consistent=True,
            storage_key=storage_key,
            indexed=False,
            duplicate_matches=[],
            has_duplicate=False,
            message=None,
        )

    if pose not in FACE_CHECK_POSES:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=f"Unsupported pose_type for analysis: {pose}",
            meta={"field": "pose_type"},
        )

    logger.info(
        "suspect_face_analyze_started",
        user_id=current_user.user_id,
        dossier_draft_id=dossier_draft_id,
        photo_id=photo_id,
        pose=pose,
        bytes=len(image_bytes),
    )
    t0 = time.perf_counter()
    try:
        analysis = await asyncio.wait_for(
            asyncio.to_thread(
                analyze_image_bytes,
                image_bytes,
                declared_pose=pose,
                model_name=settings.face_model_name,
                detector_backend=settings.face_detector_backend,
                enforce_single_face=True,
                extract_embedding=(pose == POSE_FRONT),
            ),
            timeout=float(settings.face_analysis_timeout_seconds),
        )
    except TimeoutError as exc:
        raise IIPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            detail=(
                "Face analysis timed out. The first upload on this server downloads AI models "
                "(about 2–5 minutes). Please wait and try again, or ask an administrator to run "
                "model warmup."
            ),
            meta={"field": "file"},
        ) from exc
    except FacePipelineError as exc:
        raise IIPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=exc.message,
            meta={"reason": exc.code, "field": "file"},
        ) from exc

    if pose == POSE_FRONT and not front_pose_acceptable(analysis.yaw_offset):
        raise IIPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=(
                "This slot requires a front-facing photo. The face appears turned too far to the "
                "side — center both eyes in the crop and try again."
            ),
            meta={
                "reason": "pose_mismatch",
                "field": "file",
                "detected_pose": analysis.detected_pose,
                "yaw_offset": (
                    float(analysis.yaw_offset) if analysis.yaw_offset is not None else None
                ),
            },
        )

    if pose in {POSE_LEFT_PROFILE, POSE_RIGHT_PROFILE} and not profile_pose_acceptable(
        pose, analysis.yaw_offset, analysis.detected_pose
    ):
        raise IIPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=profile_pose_rejection_detail(
                pose, analysis.detected_pose, analysis.yaw_offset
            ),
            meta={
                "reason": "pose_mismatch",
                "field": "file",
                "detected_pose": analysis.detected_pose,
                "yaw_offset": (
                    float(analysis.yaw_offset) if analysis.yaw_offset is not None else None
                ),
            },
        )

    await file.seek(0)
    try:
        storage_key = await save_suspect_photo(
            dossier_draft_id,
            photo_id,
            file,
            max_bytes=settings.face_max_upload_bytes,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "unsupported_type":
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="Use JPEG, PNG, or WebP images only",
                meta={"field": "file"},
            ) from exc
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=str(exc),
            meta={"field": "file"},
        ) from exc
    except RuntimeError as exc:
        raise IIPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            detail="Photo storage is not available",
        ) from exc

    face_id = ""
    if pose == POSE_FRONT:
        face_id = replace_face_id or new_face_id()
        if replace_face_id:
            await _face_index.delete_face(replace_face_id)

    duplicate_matches: list[FaceDuplicateMatch] = []
    if pose == POSE_FRONT:
        duplicate_matches = await _face_index.find_similar_front_faces(
            analysis.embedding,
            exclude_dossier_draft_id=dossier_draft_id,
            exclude_face_id=face_id,
        )

    indexed = False
    if submitted_suspect_id:
        indexed = await _face_index.safe_index_face(
            face_id=face_id,
            photo_id=photo_id,
            dossier_draft_id=dossier_draft_id,
            pose_type=pose,
            detected_pose=analysis.detected_pose,
            embedding=analysis.embedding,
            storage_key=storage_key,
            created_by=current_user.user_id,
            suspect_id=submitted_suspect_id,
            criminal_name=(criminal_name or "").strip() or None,
        )
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    dup_responses = [_match_to_response(m) for m in duplicate_matches]
    has_duplicate = len(dup_responses) > 0
    message = None
    if has_duplicate:
        message = (
            "A similar front-facing face already exists on a submitted dossier. "
            "Review matches before continuing, or confirm this is a different person."
        )
    elif not analysis.pose_consistent:
        message = (
            f"Face detected; declared pose is {pose} but auto-detected pose is "
            f"{analysis.detected_pose}. You may continue if the label is correct."
        )
    if submitted_suspect_id and not indexed:
        es_note = " Face vector could not be saved to search index — photo stored; try again later."
        message = (message or "") + es_note

    logger.info(
        "suspect_face_analyzed",
        user_id=current_user.user_id,
        dossier_draft_id=dossier_draft_id,
        photo_id=photo_id,
        pose=pose,
        detected_pose=analysis.detected_pose,
        duplicates=len(dup_responses),
        indexed=indexed,
        elapsed_ms=elapsed_ms,
    )

    return FaceAnalyzeResponse(
        photo_id=photo_id,
        face_id=face_id,
        face_detected=analysis.face_detected,
        face_count=analysis.face_count,
        declared_pose=pose,
        detected_pose=analysis.detected_pose,
        pose_consistent=analysis.pose_consistent,
        storage_key=storage_key,
        indexed=indexed,
        duplicate_matches=dup_responses,
        has_duplicate=has_duplicate,
        message=message,
    )


@router.get("/photos/{photo_id}/image")
async def get_suspect_photo_image(
    photo_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    dossier_draft_id: str = Query(...),
    storage_key: str = Query(...),
) -> Response:
    """Return a stored suspect photo for draft UI preview (auth required)."""
    try:
        uuid.UUID(dossier_draft_id)
        uuid.UUID(photo_id)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="dossier_draft_id and photo_id must be valid UUIDs",
        ) from exc

    try:
        validate_suspect_photo_storage_key(dossier_draft_id, photo_id, storage_key)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="Invalid storage key for this photo",
        ) from exc

    storage = get_object_storage()
    if not storage.enabled:
        raise IIPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            detail="Photo storage is not available",
        )

    loaded = await storage.get(storage_key)
    if not loaded:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Photo not found",
        )
    data, content_type = loaded
    return Response(content=data, media_type=content_type)


@router.delete("/drafts/{dossier_draft_id}", response_model=DraftDiscardResponse)
async def discard_suspect_draft(
    dossier_draft_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> DraftDiscardResponse:
    """
    Delete all photos for an abandoned dossier draft (MinIO + any legacy draft face vectors).
    Call when the user discards the wizard or starts over without submitting.
    """
    _ = current_user
    try:
        uuid.UUID(dossier_draft_id)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="dossier_draft_id must be a valid UUID",
        ) from exc

    try:
        await discard_draft_photos(dossier_draft_id)
    except RuntimeError as exc:
        raise IIPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            detail="Photo storage is not available",
        ) from exc

    await _face_index.delete_draft_faces(dossier_draft_id)
    logger.info("suspect_draft_discarded", dossier_draft_id=dossier_draft_id)
    return DraftDiscardResponse(deleted=True, dossier_draft_id=dossier_draft_id)


@router.delete("/photos/{photo_id}", response_model=FaceDeleteResponse)
async def delete_suspect_photo(
    photo_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    dossier_draft_id: str = Query(...),
    storage_key: str = Query(...),
    face_id: str | None = Query(None),
) -> FaceDeleteResponse:
    """Remove one draft photo from MinIO and optionally its face vector (if indexed)."""
    _ = current_user
    try:
        uuid.UUID(photo_id)
        uuid.UUID(dossier_draft_id)
        if face_id:
            uuid.UUID(face_id)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="photo_id, dossier_draft_id, and face_id must be valid UUIDs",
        ) from exc

    try:
        validate_suspect_photo_storage_key(dossier_draft_id, photo_id, storage_key)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="Invalid storage key for this photo",
        ) from exc

    if face_id:
        await _face_index.delete_face(face_id)

    try:
        await delete_suspect_photo_blob(dossier_draft_id, photo_id, storage_key)
    except RuntimeError as exc:
        raise IIPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            detail="Photo storage is not available",
        ) from exc

    return FaceDeleteResponse(deleted=True, photo_id=photo_id)


class FaceModelsStatusResponse(BaseModel):
    ready: bool
    warming: bool = False
    service_available: bool = True
    model_name: str | None = None
    warmed_at: float | None = None
    warmup_error: str | None = None
    message: str


@router.get("/ping", response_model=FaceModelsStatusResponse)
async def face_service_ping() -> FaceModelsStatusResponse:
    """Lightweight check that ml-gateway is up (no auth)."""
    st = get_models_status()
    return FaceModelsStatusResponse(
        ready=st.ready,
        warming=st.warming,
        service_available=True,
        model_name=st.model_name,
        warmed_at=st.warmed_at,
        warmup_error=st.warmup_error,
        message=_status_message(st),
    )


def _status_message(st) -> str:
    if st.ready:
        return "Face recognition models are loaded. Uploads usually finish in 5–20 seconds."
    if st.warmup_error:
        return f"Model load failed: {st.warmup_error}"
    if st.warming:
        return "Models are loading on the server (one-time, about 2 minutes). Please wait…"
    return "Models not loaded yet. They will load automatically on first upload or server warmup."


@router.get("/status", response_model=FaceModelsStatusResponse)
async def face_models_status(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FaceModelsStatusResponse:
    """Whether face AI models are loaded in memory (uploads are fast when ready=true)."""
    _ = current_user
    st = get_models_status()
    return FaceModelsStatusResponse(
        ready=st.ready,
        warming=st.warming,
        service_available=True,
        model_name=st.model_name,
        warmed_at=st.warmed_at,
        warmup_error=st.warmup_error,
        message=_status_message(st),
    )


@router.post("/warmup", response_model=FaceModelsStatusResponse)
async def warmup_face_models_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FaceModelsStatusResponse:
    """Pre-load DeepFace / RetinaFace into memory (normally done automatically at startup)."""
    _ = current_user
    settings = get_ml_settings()
    await asyncio.wait_for(
        asyncio.to_thread(
            warmup_face_models_sync,
            model_name=settings.face_model_name,
            detector_backend=settings.face_detector_backend,
        ),
        timeout=float(settings.face_analysis_timeout_seconds) * 2,
    )
    await _face_index.ensure_index()
    st = get_models_status()
    return FaceModelsStatusResponse(
        ready=st.ready,
        warming=st.warming,
        service_available=True,
        model_name=st.model_name,
        warmed_at=st.warmed_at,
        warmup_error=st.warmup_error,
        message="Face recognition models loaded.",
    )
