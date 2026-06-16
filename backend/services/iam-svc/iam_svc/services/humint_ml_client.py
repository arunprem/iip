from __future__ import annotations

import os

import httpx

from iip_core.logging import get_logger

logger = get_logger(__name__)
ML_GATEWAY_URL = os.environ.get("ML_GATEWAY_URL", "http://localhost:8020").rstrip("/")


async def process_humint_attachment(*, access_token: str, payload: dict) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(
                f"{ML_GATEWAY_URL}/api/v1/ml/humint/process-attachment",
                json=payload,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if res.status_code >= 400:
                logger.warning("humint_attachment_process_failed", status=res.status_code, body=res.text[:500])
                return None
            return res.json()
    except Exception as exc:
        logger.warning("humint_attachment_process_error", error=str(exc))
        return None


async def index_humint_report(*, access_token: str, payload: dict) -> bool:
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(
                f"{ML_GATEWAY_URL}/api/v1/ml/humint/index-report",
                json=payload,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            return res.status_code < 400
    except Exception as exc:
        logger.warning("humint_index_report_error", error=str(exc))
        return False


async def search_humint_reports_semantic(*, access_token: str, payload: dict) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                f"{ML_GATEWAY_URL}/api/v1/ml/humint/search",
                json=payload,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if res.status_code >= 400:
                logger.warning("humint_semantic_search_failed", status=res.status_code, body=res.text[:500])
                return None
            return res.json()
    except Exception as exc:
        logger.warning("humint_semantic_search_error", error=str(exc))
        return None
