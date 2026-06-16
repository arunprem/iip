from __future__ import annotations

import io
import os
import shutil
import tempfile
from typing import Any

from PIL import Image

from iip_core.logging import get_logger
from iip_core.object_storage import get_object_storage
from ml_gateway_svc.settings import get_ml_settings

logger = get_logger(__name__)
_settings = get_ml_settings()

_caption_pipeline = None
_asr_pipeline = None


def _get_caption_pipeline():
    global _caption_pipeline
    if _caption_pipeline is None:
        from transformers import pipeline

        _caption_pipeline = pipeline("image-to-text", model=_settings.humint_caption_model)
    return _caption_pipeline


def _get_asr_pipeline():
    global _asr_pipeline
    if _asr_pipeline is None:
        from transformers import pipeline

        _asr_pipeline = pipeline("automatic-speech-recognition", model=_settings.humint_asr_model)
    return _asr_pipeline


def _extract_document_text(data: bytes, content_type: str, filename: str) -> str | None:
    lowered_name = filename.lower()
    if content_type.startswith("text/") or lowered_name.endswith((".txt", ".md", ".csv", ".json")):
        return data.decode("utf-8", errors="ignore").strip() or None
    if lowered_name.endswith(".pdf") or content_type == "application/pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        return text.strip() or None
    return data.decode("utf-8", errors="ignore").strip() or None


def _extract_image_intel(data: bytes) -> tuple[str | None, str | None, str | None]:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    ocr_text = None
    if shutil.which("tesseract"):
        try:
            import pytesseract

            ocr_text = pytesseract.image_to_string(img).strip() or None
        except Exception as exc:
            logger.warning("humint_ocr_failed", error=str(exc))
    caption = None
    try:
        result = _get_caption_pipeline()(img)
        if isinstance(result, list) and result:
            caption = str(result[0].get("generated_text") or "").strip() or None
    except Exception as exc:
        logger.warning("humint_caption_failed", error=str(exc))
    extracted = "\n".join(part for part in [ocr_text, caption] if part).strip() or None
    return extracted, ocr_text, caption


def _transcribe_audio(data: bytes, filename: str) -> tuple[str | None, str]:
    if not shutil.which("ffmpeg"):
        # ffmpeg is usually needed to decode arbitrary uploads; keep a clear status when unavailable.
        return None, "PENDING"
    suffix = os.path.splitext(filename or "audio.wav")[-1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        temp_path = tmp.name
    try:
        result = _get_asr_pipeline()(temp_path)
        text = str(result.get("text") or "").strip() or None
        return text, "READY" if text else "PENDING"
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


async def process_humint_attachment(
    *, object_key: str, attachment_type: str, filename: str, content_type: str | None
) -> dict[str, Any]:
    storage = get_object_storage()
    raw = await storage.get(object_key)
    if raw is None:
        raise FileNotFoundError(object_key)
    data, detected_content_type = raw
    ctype = content_type or detected_content_type or "application/octet-stream"
    kind = attachment_type.upper()
    if kind == "DOCUMENT":
        extracted = _extract_document_text(data, ctype, filename)
        return {
            "extracted_text": extracted,
            "ocr_text": None,
            "vision_caption": None,
            "audio_transcript": None,
            "vector_status": "READY" if extracted else "PENDING",
        }
    if kind == "PHOTO":
        extracted, ocr_text, caption = _extract_image_intel(data)
        return {
            "extracted_text": extracted,
            "ocr_text": ocr_text,
            "vision_caption": caption,
            "audio_transcript": None,
            "vector_status": "READY" if extracted else "PENDING",
        }
    if kind == "AUDIO":
        transcript, vector_status = _transcribe_audio(data, filename)
        return {
            "extracted_text": transcript,
            "ocr_text": None,
            "vision_caption": None,
            "audio_transcript": transcript,
            "vector_status": vector_status,
        }
    return {
        "extracted_text": None,
        "ocr_text": None,
        "vision_caption": None,
        "audio_transcript": None,
        "vector_status": "PENDING",
    }
