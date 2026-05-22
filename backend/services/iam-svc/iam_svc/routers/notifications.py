"""Real-time notifications via WebSocket and persisted inbox history."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.auth import CurrentUser, decode_token
from iip_core.db import get_db, get_db_context
from iip_core.errors import ErrorCode, IIPException
from iip_core.keycloak import decode_keycloak_access_token
from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings, get_settings
from iam_svc.dependencies import get_current_user_db
from iam_svc.repositories.notification_repository import NotificationRepository
from iam_svc.repositories.user_repository import UserRepository
from iam_svc.services.notification_dispatch import row_to_ws_payload
from iam_svc.services.notification_hub import notification_hub

router = APIRouter()
logger = get_logger(__name__)


class NotificationItemResponse(BaseModel):
    id: str
    title: str
    message: str
    notification_type: str
    event_type: str | None = None
    unread: bool
    created_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)


def _row_to_response(row: Any) -> NotificationItemResponse:
    payload = dict(row.payload or {})
    metadata: dict[str, Any] = {}
    for key in ("force_mfa", "changed_by"):
        if key in payload:
            metadata[key] = payload[key]
    return NotificationItemResponse(
        id=str(row.id),
        title=row.title,
        message=row.message,
        notification_type=row.notification_type,
        event_type=row.event_type,
        unread=row.read_at is None,
        created_at=row.created_at.isoformat(),
        metadata=metadata,
    )


async def _resolve_iam_user_id(
    access_token: str,
    settings: BaseServiceSettings,
    db: AsyncSession,
) -> str | None:
    repo = UserRepository(db)
    if settings.keycloak_enabled:
        try:
            raw = await decode_keycloak_access_token(access_token, settings)
        except Exception:
            return None
        username = (raw.get("preferred_username") or raw.get("username") or "").strip()
        if not username:
            return None
        user = await repo.get_by_username(username)
    else:
        try:
            raw = decode_token(access_token, settings)
        except HTTPException:
            return None
        if raw.get("type") == "refresh":
            return None
        user = await repo.get_by_id(raw["sub"])
    if not user or not user.is_active:
        return None
    return str(user.id)


@router.get("", response_model=list[NotificationItemResponse])
async def list_notification_history(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[NotificationItemResponse]:
    """Inbox history for the signed-in user (newest first)."""
    repo = NotificationRepository(db)
    rows = await repo.list_for_user(
        uuid.UUID(current_user.user_id),
        limit=limit,
        offset=offset,
    )
    return [_row_to_response(row) for row in rows]


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await NotificationRepository(db).mark_all_read(uuid.UUID(current_user.user_id))


@router.get("/{notification_id}", response_model=NotificationItemResponse)
async def get_notification(
    notification_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationItemResponse:
    repo = NotificationRepository(db)
    row = await repo.get_for_user(uuid.UUID(current_user.user_id), notification_id)
    if not row:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Notification not found.",
        )
    return _row_to_response(row)


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    repo = NotificationRepository(db)
    updated = await repo.mark_read(uuid.UUID(current_user.user_id), notification_id)
    if not updated:
        row = await repo.get_for_user(uuid.UUID(current_user.user_id), notification_id)
        if not row:
            raise IIPException(
                status_code=status.HTTP_404_NOT_FOUND,
                error_code=ErrorCode.NOT_FOUND,
                detail="Notification not found.",
            )


@router.websocket("/ws")
async def notifications_websocket(
    websocket: WebSocket,
    access_token: Annotated[str, Query(min_length=10)],
) -> None:
    """
    Single long-lived socket per browser tab. Token via query string (browser WebSocket limitation).
    Client may send literal 'ping'; server replies 'pong'.
    """
    settings = get_settings()
    async with get_db_context() as db:
        user_id = await _resolve_iam_user_id(access_token, settings, db)
    if not user_id:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

    await notification_hub.register(user_id, websocket)
    await notification_hub.listen(user_id, websocket)
