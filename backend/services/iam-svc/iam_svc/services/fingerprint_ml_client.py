"""Call ml-gateway to index approved suspect fingerprints."""

from __future__ import annotations

import base64
import os

import httpx

from iip_core.logging import get_logger

logger = get_logger(__name__)

ML_GATEWAY_URL = os.environ.get("ML_GATEWAY_URL", "http://localhost:8020").rstrip("/")


async def index_submitted_fingerprint(
    *,
    access_token: str,
    suspect_id: str,
    dossier_draft_id: str,
    template_id: str,
    print_id: str,
    finger_position: str,
    template_bytes: bytes,
    criminal_name: str,
    template_format: str = "ISO19794-2",
    quality_score: float | None = None,
    device_model: str | None = None,
    image_bytes: bytes | None = None,
    image_width: int | None = None,
    image_height: int | None = None,
) -> bool:
    payload = {
        "suspectId": suspect_id,
        "dossierDraftId": dossier_draft_id,
        "templateId": template_id,
        "printId": print_id,
        "fingerPosition": finger_position,
        "templateFormat": template_format,
        "templateDataB64": base64.b64encode(template_bytes).decode("ascii"),
        "criminalName": criminal_name,
        "qualityScore": quality_score,
        "deviceModel": device_model,
    }
    if image_bytes and image_width and image_height:
        payload["imageDataB64"] = base64.b64encode(image_bytes).decode("ascii")
        payload["imageWidth"] = image_width
        payload["imageHeight"] = image_height
    url = f"{ML_GATEWAY_URL}/api/v1/ml/fingerprints/index-submitted"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if res.status_code >= 400:
                logger.warning(
                    "fingerprint_index_submitted_failed",
                    status=res.status_code,
                    body=res.text[:500],
                )
                return False
            data = res.json()
            return bool(data.get("indexed", True))
    except Exception as exc:
        logger.warning("fingerprint_index_submitted_error", error=str(exc))
        return False


async def delete_indexed_fingerprint(*, access_token: str, print_id: str) -> bool:
    url = f"{ML_GATEWAY_URL}/api/v1/ml/fingerprints/prints/{print_id}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.delete(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if res.status_code >= 400:
                logger.warning(
                    "fingerprint_delete_index_failed",
                    status=res.status_code,
                    print_id=print_id,
                    body=res.text[:500],
                )
                return False
            return True
    except Exception as exc:
        logger.warning("fingerprint_delete_index_error", print_id=print_id, error=str(exc))
        return False
