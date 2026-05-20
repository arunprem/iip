"""
IAM Service — Health & Readiness Probes.

Kubernetes-compatible /healthz and /readyz endpoints.
"""

from __future__ import annotations

import time

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_START_TIME = time.time()


class HealthResponse(BaseModel):
    status: str
    uptime_seconds: float
    service: str
    version: str


@router.get("/healthz", response_model=HealthResponse, include_in_schema=False)
async def liveness() -> HealthResponse:
    """Liveness probe — returns 200 if the process is alive."""
    return HealthResponse(
        status="healthy",
        uptime_seconds=round(time.time() - _START_TIME, 2),
        service="iam-svc",
        version="0.1.0",
    )


@router.get("/readyz", response_model=HealthResponse, include_in_schema=False)
async def readiness() -> HealthResponse:
    """Readiness probe — returns 200 if the service is ready to handle traffic."""
    return HealthResponse(
        status="ready",
        uptime_seconds=round(time.time() - _START_TIME, 2),
        service="iam-svc",
        version="0.1.0",
    )
