"""
IAM Service — JIT (Just-In-Time) Elevation Router.

JIT Elevation is required before accessing SECRET/TOP SECRET resources.
Flow:
  1. Analyst sends POST /jit/request with justification
  2. System issues MFA challenge → analyst provides TOTP code
  3. Supervisor is notified for dual-custody approval
  4. On approval: a short-lived JIT token (15-60 min) is issued
  5. All JIT sessions are audit-logged with the full justification chain

Endpoints:
  - POST /request    : Request JIT elevation
  - POST /approve    : Supervisor approves a pending JIT request
  - POST /deny       : Supervisor denies a pending JIT request
  - GET  /status     : Check current JIT session status
  - POST /revoke     : Immediately revoke an active JIT session
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from iip_core.auth import CurrentUser, get_current_user, require_role
from iip_core.errors import ForbiddenError
from iip_core.logging import get_logger
from iip_core.settings import ClassificationLevel

router = APIRouter()
logger = get_logger(__name__)


class JITStatus(StrEnum):
    PENDING_MFA = "PENDING_MFA"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class JITRequest(BaseModel):
    target_classification: ClassificationLevel
    justification: str
    requested_duration_minutes: int = 60
    resource_description: str


class JITRequestResponse(BaseModel):
    request_id: str
    status: JITStatus
    message: str
    mfa_challenge_required: bool = True


class JITApprovalRequest(BaseModel):
    request_id: str
    decision_justification: str


class JITSessionStatus(BaseModel):
    active: bool
    request_id: str | None
    clearance_level: str | None
    expires_at: datetime | None
    granted_by: str | None


@router.post("/request", response_model=JITRequestResponse, status_code=status.HTTP_202_ACCEPTED)
async def request_jit_elevation(
    payload: JITRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> JITRequestResponse:
    """Submit a JIT elevation request for higher clearance access.

    Triggers MFA challenge followed by supervisor approval workflow.
    """
    request_id = str(uuid.uuid4())

    logger.info(
        "jit_elevation_requested",
        user_id=current_user.user_id,
        username=current_user.username,
        target_classification=payload.target_classification,
        justification=payload.justification,
        request_id=request_id,
    )

    # TODO: Persist to DB, send MFA challenge, notify supervisor queue
    return JITRequestResponse(
        request_id=request_id,
        status=JITStatus.PENDING_MFA,
        message="MFA challenge has been sent to your registered device. "
                "Supervisor notification will follow upon successful verification.",
        mfa_challenge_required=True,
    )


@router.post("/approve/{request_id}", status_code=status.HTTP_200_OK)
async def approve_jit_request(
    request_id: str,
    payload: JITApprovalRequest,
    supervisor: Annotated[CurrentUser, Depends(require_role("SUPERVISOR"))],
) -> dict:
    """Supervisor approves a pending JIT elevation request.

    Issues a time-limited JIT token and emits JIT_ELEVATION_APPROVED audit event.
    """
    logger.info(
        "jit_approved",
        request_id=request_id,
        approved_by=supervisor.username,
        justification=payload.decision_justification,
    )
    # TODO: Update DB status, issue JIT token, publish audit event
    return {"message": f"JIT request {request_id} approved. Session token will be issued."}


@router.post("/deny/{request_id}", status_code=status.HTTP_200_OK)
async def deny_jit_request(
    request_id: str,
    payload: JITApprovalRequest,
    supervisor: Annotated[CurrentUser, Depends(require_role("SUPERVISOR"))],
) -> dict:
    """Supervisor denies a pending JIT elevation request."""
    logger.warning(
        "jit_denied",
        request_id=request_id,
        denied_by=supervisor.username,
        justification=payload.decision_justification,
    )
    # TODO: Update DB status, notify analyst, publish audit event
    return {"message": f"JIT request {request_id} denied."}


@router.get("/status", response_model=JITSessionStatus)
async def get_jit_status(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> JITSessionStatus:
    """Return the current user's active JIT session status."""
    # TODO: Query Redis for active JIT session by user_id
    return JITSessionStatus(
        active=current_user.jit_elevated,
        request_id=None,
        clearance_level=current_user.clearance_level.value if current_user.jit_elevated else None,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=45) if current_user.jit_elevated else None,
        granted_by=None,
    )
