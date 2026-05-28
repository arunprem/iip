"""
Suspect photo face detection, pose estimation, and embedding extraction via DeepFace.

Models download once to ~/.deepface/weights/ and are kept in memory for the life of the
ml-gateway process. Call warmup_face_models() on service startup.
"""

from __future__ import annotations

import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from iip_core.logging import get_logger

logger = get_logger(__name__)

POSE_FRONT = "FRONT"
POSE_LEFT_PROFILE = "LEFT_PROFILE"
POSE_RIGHT_PROFILE = "RIGHT_PROFILE"
POSE_LEFT = "LEFT"
POSE_RIGHT = "RIGHT"
POSE_OTHER = "OTHER"

ALLOWED_POSE_TYPES = frozenset(
    {
        POSE_FRONT,
        POSE_LEFT_PROFILE,
        POSE_RIGHT_PROFILE,
        POSE_LEFT,
        POSE_RIGHT,
        POSE_OTHER,
    }
)

_lock = threading.Lock()
_cached_model: Any | None = None
_cached_model_name: str | None = None
_models_ready = False
_models_warmup_in_progress = False
_models_warmup_started_at: float | None = None
_models_warmed_at: float | None = None
_warmup_error: str | None = None
_warmup_done = threading.Event()


class FacePipelineError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


# Max |nose–eye-midpoint| / inter-eye distance for a front-facing slot.
# Cropped uploads often skew landmarks slightly; 0.12 was too strict.
FRONT_YAW_ACCEPT_THRESHOLD = 0.28

# Below this magnitude, treat LEFT/RIGHT_PROFILE as FRONT (borderline crop / detector noise).
FRONT_YAW_RECLASSIFY_THRESHOLD = 0.22

# Minimum |yaw| for optional left/right profile slots (must be clearly turned, not frontal).
PROFILE_MIN_YAW = 0.12


@dataclass
class FaceAnalysisResult:
    face_detected: bool
    face_count: int
    detected_pose: str
    pose_consistent: bool
    embedding: list[float]
    facial_area: dict[str, int] | None
    yaw_offset: float | None = None


@dataclass
class FaceModelsStatus:
    ready: bool
    warming: bool
    model_name: str | None
    detector_backend: str | None
    warmed_at: float | None
    warmup_error: str | None


def get_models_status() -> FaceModelsStatus:
    return FaceModelsStatus(
        ready=_models_ready,
        warming=_models_warmup_in_progress and not _models_ready and not _warmup_error,
        model_name=_cached_model_name,
        detector_backend=None,
        warmed_at=_models_warmed_at,
        warmup_error=_warmup_error,
    )


def wait_for_models_ready(*, timeout_seconds: float = 600.0) -> None:
    """Block until warmup finishes (success or failure)."""
    if _models_ready:
        return
    if not _warmup_done.wait(timeout=timeout_seconds):
        raise FacePipelineError(
            "warmup_timeout",
            "Face models are still loading. Wait a minute and try again.",
        )
    if _warmup_error:
        raise FacePipelineError("warmup_failed", _warmup_error)
    if not _models_ready:
        raise FacePipelineError(
            "warmup_failed",
            "Face models did not load. Restart ml-gateway or POST /faces/warmup.",
        )


def _load_deepface():
    try:
        from deepface import DeepFace  # noqa: PLC0415
        from retinaface import RetinaFace  # noqa: PLC0415

        return DeepFace, RetinaFace
    except ImportError as exc:
        raise FacePipelineError(
            "deepface_unavailable",
            "DeepFace is not installed. Run: uv sync --package ml-gateway-svc",
        ) from exc


def _get_or_build_model(DeepFace: Any, model_name: str) -> Any:
    global _cached_model, _cached_model_name
    if _cached_model is not None and _cached_model_name == model_name:
        return _cached_model
    with _lock:
        if _cached_model is not None and _cached_model_name == model_name:
            return _cached_model
        logger.info("face_model_building", model_name=model_name)
        t0 = time.perf_counter()
        _cached_model = DeepFace.build_model(model_name)
        _cached_model_name = model_name
        logger.info("face_model_built", model_name=model_name, elapsed_ms=int((time.perf_counter() - t0) * 1000))
    return _cached_model


def _parse_facial_area(face_obj: dict[str, Any]) -> tuple[int, int, int, int]:
    area = face_obj.get("facial_area")
    if isinstance(area, dict):
        return (
            int(area["x"]),
            int(area["y"]),
            int(area["w"]),
            int(area["h"]),
        )
    x, y, w, h = area
    return int(x), int(y), int(w), int(h)


def _warm_detector(DeepFace: Any, detector_backend: str) -> None:
    """Load detector weights (e.g. RetinaFace ~119MB) so the first real upload is fast."""
    if detector_backend == "skip":
        return
    logger.info("face_detector_warming", detector_backend=detector_backend)
    t0 = time.perf_counter()
    blank = np.zeros((480, 480, 3), dtype=np.uint8)
    DeepFace.extract_faces(
        img_path=blank,
        detector_backend=detector_backend,
        enforce_detection=False,
        align=False,
    )
    logger.info(
        "face_detector_warmed",
        detector_backend=detector_backend,
        elapsed_ms=int((time.perf_counter() - t0) * 1000),
    )


def warmup_face_models(
    *,
    model_name: str = "Facenet512",
    detector_backend: str = "retinaface",
) -> FaceModelsStatus:
    """
    Load recognition + detector weights into memory once per process.
    Safe to call multiple times; concurrent callers wait on the same warmup.
    """
    global _models_ready, _models_warmup_in_progress, _models_warmup_started_at
    global _models_warmed_at, _warmup_error

    if _models_ready:
        return get_models_status()

    with _lock:
        if _models_ready:
            return get_models_status()
        if _models_warmup_in_progress:
            return get_models_status()
        _models_warmup_in_progress = True
        _models_warmup_started_at = time.time()
        _warmup_error = None
        _warmup_done.clear()

    try:
        logger.info("face_models_warmup_start", model_name=model_name, detector_backend=detector_backend)
        DeepFace, _RetinaFace = _load_deepface()
        _get_or_build_model(DeepFace, model_name)
        _warm_detector(DeepFace, detector_backend)
        with _lock:
            _models_ready = True
            _models_warmed_at = time.time()
            _warmup_error = None
        logger.info("face_models_ready", model_name=model_name)
    except Exception as exc:
        with _lock:
            _warmup_error = str(exc)
        logger.exception("face_models_warmup_failed")
        raise
    finally:
        with _lock:
            _models_warmup_in_progress = False
        _warmup_done.set()

    return get_models_status()


def normalize_embedding(vector: list[float]) -> list[float]:
    arr = np.asarray(vector, dtype=np.float32)
    norm = float(np.linalg.norm(arr))
    if norm <= 1e-9:
        return vector
    return (arr / norm).tolist()


def _yaw_offset_from_landmarks(landmarks: dict[str, tuple[float, float]]) -> float | None:
    """Nose horizontal offset vs eye midpoint, normalised by inter-eye distance."""
    le = landmarks.get("left_eye")
    re = landmarks.get("right_eye")
    nose = landmarks.get("nose")
    if not le or not re or not nose:
        return None

    lx, _ly = le
    rx, _ry = re
    nx, _ny = nose
    eye_dist = float(np.hypot(rx - lx, _ry - _ly))
    if eye_dist < 1e-6:
        return None

    mid_x = (lx + rx) / 2.0
    return float((nx - mid_x) / eye_dist)


def front_pose_acceptable(yaw_offset: float | None) -> bool:
    """Whether yaw is close enough for the mandatory front-face slot."""
    if yaw_offset is None:
        return True
    return abs(yaw_offset) < FRONT_YAW_ACCEPT_THRESHOLD


def profile_pose_acceptable(
    declared: str,
    yaw_offset: float | None,
    detected_pose: str,
) -> bool:
    """Whether the image matches a left or right profile slot when uploaded."""
    if declared == POSE_LEFT_PROFILE:
        if detected_pose == POSE_RIGHT_PROFILE:
            return False
        if yaw_offset is not None:
            return yaw_offset >= PROFILE_MIN_YAW
        return detected_pose == POSE_LEFT_PROFILE
    if declared == POSE_RIGHT_PROFILE:
        if detected_pose == POSE_LEFT_PROFILE:
            return False
        if yaw_offset is not None:
            return yaw_offset <= -PROFILE_MIN_YAW
        return detected_pose == POSE_RIGHT_PROFILE
    return True


def profile_pose_rejection_detail(
    declared: str,
    detected_pose: str,
    yaw_offset: float | None,
) -> str:
    if declared == POSE_LEFT_PROFILE:
        if detected_pose == POSE_FRONT or (yaw_offset is not None and abs(yaw_offset) < PROFILE_MIN_YAW):
            return (
                "This slot requires a left profile photo (face turned to show the left cheek). "
                "The image looks too frontal — turn further left and crop again."
            )
        return (
            "This slot requires a left profile, but the face appears turned the other way "
            f"(detected {detected_pose}). Upload a clear left-side profile."
        )
    if declared == POSE_RIGHT_PROFILE:
        if detected_pose == POSE_FRONT or (yaw_offset is not None and abs(yaw_offset) < PROFILE_MIN_YAW):
            return (
                "This slot requires a right profile photo (face turned to show the right cheek). "
                "The image looks too frontal — turn further right and crop again."
            )
        return (
            "This slot requires a right profile, but the face appears turned the other way "
            f"(detected {detected_pose}). Upload a clear right-side profile."
        )
    return "Profile pose does not match this slot."


def estimate_pose_from_landmarks(landmarks: dict[str, tuple[float, float]]) -> tuple[str, float | None]:
    """Estimate head pose from RetinaFace 5-point landmarks."""
    offset = _yaw_offset_from_landmarks(landmarks)
    if offset is None:
        return POSE_OTHER, None

    if abs(offset) < FRONT_YAW_RECLASSIFY_THRESHOLD:
        return POSE_FRONT, offset
    if offset >= FRONT_YAW_RECLASSIFY_THRESHOLD:
        return POSE_LEFT_PROFILE, offset
    return POSE_RIGHT_PROFILE, offset


def _pose_consistent(declared: str, detected: str) -> bool:
    if declared == detected:
        return True
    if declared == POSE_OTHER:
        return True
    if declared in {POSE_LEFT, POSE_RIGHT} and detected in {
        POSE_LEFT_PROFILE,
        POSE_RIGHT_PROFILE,
        POSE_OTHER,
    }:
        return True
    if declared == POSE_FRONT and detected == POSE_OTHER:
        return False
    return declared == POSE_OTHER or detected == POSE_OTHER


def analyze_image_bytes(
    image_bytes: bytes,
    *,
    declared_pose: str,
    model_name: str = "Facenet512",
    detector_backend: str = "retinaface",
    enforce_single_face: bool = False,
    extract_embedding: bool = True,
) -> FaceAnalysisResult:
    """Detect face(s), estimate pose, and extract a normalized embedding."""
    if declared_pose not in ALLOWED_POSE_TYPES:
        raise FacePipelineError("invalid_pose_type", f"Unsupported pose type: {declared_pose}")

    if not _models_ready:
        if _models_warmup_in_progress:
            wait_for_models_ready()
        else:
            warmup_face_models(model_name=model_name, detector_backend=detector_backend)

    DeepFace, RetinaFace = _load_deepface()
    # Warm deepface's singleton model cache (represent() does not accept model=).
    _get_or_build_model(DeepFace, model_name)

    suffix = ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        t0 = time.perf_counter()
        img_bgr = cv2.imread(tmp_path)
        if img_bgr is None:
            raise FacePipelineError("invalid_image", "Could not read the image file.")

        detections: dict[str, Any] = RetinaFace.detect_faces(tmp_path) or {}
        face_count = len(detections)
        if face_count == 0:
            raise FacePipelineError(
                "no_face_detected",
                "No face found in the image. Upload a clear photo with the face visible.",
            )

        if enforce_single_face and face_count > 1:
            raise FacePipelineError(
                "multiple_faces",
                "Photo must contain exactly one face.",
            )

        first_key = next(iter(detections))
        face_obj = detections[first_key]
        landmarks = face_obj.get("landmarks") or {}
        detected_pose, yaw_offset = estimate_pose_from_landmarks(landmarks)

        x, y, w, h = _parse_facial_area(face_obj)
        crop = img_bgr[y : y + h, x : x + w]
        if crop.size == 0:
            raise FacePipelineError("no_face_detected", "Could not crop a face region from the image.")

        embedding: list[float] = []
        facial_area: dict[str, int] | None = None
        if extract_embedding:
            representations = DeepFace.represent(
                img_path=crop,
                model_name=model_name,
                detector_backend="skip",
                enforce_detection=False,
                align=True,
            )
            if not representations:
                raise FacePipelineError("no_embedding", "Could not extract a face embedding.")

            rep = representations[0]
            embedding = normalize_embedding(list(rep["embedding"]))
            facial_area = rep.get("facial_area")

        logger.info(
            "face_analyze_complete",
            elapsed_ms=int((time.perf_counter() - t0) * 1000),
            face_count=face_count,
            declared_pose=declared_pose,
        )

        return FaceAnalysisResult(
            face_detected=True,
            face_count=face_count,
            detected_pose=detected_pose,
            pose_consistent=_pose_consistent(declared_pose, detected_pose),
            embedding=embedding,
            facial_area=facial_area,
            yaw_offset=yaw_offset,
        )
    except FacePipelineError:
        raise
    except ValueError as exc:
        msg = str(exc).lower()
        if "face could not be detected" in msg or "could not detect a face" in msg:
            raise FacePipelineError(
                "no_face_detected",
                "No face found in the image. Upload a clear photo with the face visible.",
            ) from exc
        raise FacePipelineError("face_analysis_failed", str(exc)) from exc
    except Exception as exc:
        logger.exception("face_analysis_error", declared_pose=declared_pose)
        raise FacePipelineError("face_analysis_failed", str(exc)) from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)
