"""User notification inbox persistence."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from iam_svc.models.user import User
from iam_svc.models.user_notification import UserNotification


class NotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        user_id: uuid.UUID,
        *,
        title: str,
        message: str,
        notification_type: str,
        event_type: str | None,
        payload: dict[str, Any] | None = None,
    ) -> UserNotification:
        row = UserNotification(
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            event_type=event_type,
            payload=payload or {},
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[UserNotification]:
        stmt = (
            select(UserNotification)
            .where(UserNotification.user_id == user_id)
            .order_by(UserNotification.created_at.desc())
            .limit(min(limit, 100))
            .offset(max(offset, 0))
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_for_user(
        self,
        user_id: uuid.UUID,
        notification_id: uuid.UUID,
    ) -> UserNotification | None:
        stmt = select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.user_id == user_id,
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_read(self, user_id: uuid.UUID, notification_id: uuid.UUID) -> bool:
        now = datetime.now(timezone.utc)
        stmt = (
            update(UserNotification)
            .where(
                UserNotification.id == notification_id,
                UserNotification.user_id == user_id,
                UserNotification.read_at.is_(None),
            )
            .values(read_at=now, updated_at=now)
        )
        result = await self._session.execute(stmt)
        return result.rowcount > 0

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        now = datetime.now(timezone.utc)
        stmt = (
            update(UserNotification)
            .where(
                UserNotification.user_id == user_id,
                UserNotification.read_at.is_(None),
            )
            .values(read_at=now, updated_at=now)
        )
        result = await self._session.execute(stmt)
        return int(result.rowcount or 0)

    async def count_unread(self, user_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(UserNotification)
            .where(
                UserNotification.user_id == user_id,
                UserNotification.read_at.is_(None),
            )
        )
        result = await self._session.execute(stmt)
        return int(result.scalar_one() or 0)

    async def list_active_user_ids(self, exclude: set[str] | None = None) -> list[uuid.UUID]:
        exclude_uuids: set[uuid.UUID] = set()
        if exclude:
            for raw in exclude:
                try:
                    exclude_uuids.add(uuid.UUID(raw))
                except ValueError:
                    continue
        stmt = select(User.id).where(User.is_active.is_(True))
        if exclude_uuids:
            stmt = stmt.where(User.id.notin_(exclude_uuids))
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
