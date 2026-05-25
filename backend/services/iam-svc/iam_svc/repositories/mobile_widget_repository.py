"""CRUD for mobile app widgets."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from iam_svc.models.mobile_widget import MobileWidget


class MobileWidgetRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[MobileWidget]:
        stmt = select(MobileWidget).order_by(MobileWidget.sort_order, MobileWidget.label)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def list_active(self) -> list[MobileWidget]:
        stmt = (
            select(MobileWidget)
            .where(MobileWidget.is_active.is_(True))
            .order_by(MobileWidget.sort_order, MobileWidget.label)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, widget_id: uuid.UUID) -> MobileWidget | None:
        stmt = select(MobileWidget).where(MobileWidget.id == widget_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_key(self, widget_key: str) -> MobileWidget | None:
        stmt = select(MobileWidget).where(MobileWidget.widget_key == widget_key)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, **fields: Any) -> MobileWidget:
        row = MobileWidget(**fields)
        self._session.add(row)
        await self._session.flush()
        return row

    async def update(self, row: MobileWidget, **fields: Any) -> MobileWidget:
        for key, value in fields.items():
            setattr(row, key, value)
        row.updated_at = datetime.now(timezone.utc)
        await self._session.flush()
        return row

    async def set_active(self, widget_id: uuid.UUID, is_active: bool) -> bool:
        now = datetime.now(timezone.utc)
        stmt = (
            update(MobileWidget)
            .where(MobileWidget.id == widget_id)
            .values(is_active=is_active, updated_at=now)
        )
        result = await self._session.execute(stmt)
        return bool(result.rowcount)
