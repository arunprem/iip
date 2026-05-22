"""Persist notifications and deliver over WebSocket."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.logging import get_logger
from iam_svc.repositories.notification_repository import NotificationRepository
from iam_svc.services.notification_hub import notification_hub

logger = get_logger(__name__)


def row_to_ws_payload(row: Any) -> dict[str, Any]:
    payload = dict(row.payload or {})
    return {
        "id": str(row.id),
        "type": row.event_type,
        "notification_type": row.notification_type,
        "title": row.title,
        "message": row.message,
        "created_at": row.created_at.isoformat(),
        **payload,
    }


def event_template_to_fields(event: dict[str, Any]) -> dict[str, Any]:
    metadata = {
        k: v
        for k, v in event.items()
        if k
        not in (
            "id",
            "type",
            "notification_type",
            "title",
            "message",
            "created_at",
        )
        and v is not None
    }
    return {
        "title": str(event.get("title") or "Notification"),
        "message": str(event.get("message") or ""),
        "notification_type": str(event.get("notification_type") or "info"),
        "event_type": str(event["type"]) if event.get("type") else None,
        "payload": metadata,
    }


async def publish_to_active_users(
    db: AsyncSession,
    event: dict[str, Any],
    *,
    exclude_user_ids: set[str] | None = None,
) -> int:
    """Store one notification per active user and push to connected clients."""
    repo = NotificationRepository(db)
    fields = event_template_to_fields(event)
    user_ids = await repo.list_active_user_ids(exclude=exclude_user_ids)
    delivered = 0

    for user_id in user_ids:
        row = await repo.create(user_id, **fields)
        payload = row_to_ws_payload(row)
        sent = await notification_hub.send_to_user(str(user_id), payload)
        if sent:
            delivered += 1

    logger.info(
        "notifications_published",
        recipients=len(user_ids),
        ws_delivered=delivered,
        event_type=fields.get("event_type"),
    )
    return len(user_ids)
