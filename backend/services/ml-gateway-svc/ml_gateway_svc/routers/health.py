"""ML Gateway — Health probes."""
from __future__ import annotations
import time
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
_START = time.time()

class HealthResponse(BaseModel):
    status: str
    uptime_seconds: float
    service: str
    llm_endpoint: str

@router.get("/healthz", response_model=HealthResponse, include_in_schema=False)
async def liveness() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        uptime_seconds=round(time.time() - _START, 2),
        service="ml-gateway-svc",
        llm_endpoint="http://standalone-llm.runai-team-arun.keralapolice.gov.in",
    )

@router.get("/readyz", response_model=HealthResponse, include_in_schema=False)
async def readiness() -> HealthResponse:
    return HealthResponse(
        status="ready",
        uptime_seconds=round(time.time() - _START, 2),
        service="ml-gateway-svc",
        llm_endpoint="http://standalone-llm.runai-team-arun.keralapolice.gov.in",
    )
