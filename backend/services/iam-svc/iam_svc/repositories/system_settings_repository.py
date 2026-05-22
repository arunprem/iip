"""Persistence for iam.system_settings."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from iam_svc.models.system_setting import SystemSetting

SECURITY_KEY = "security"


class SystemSettingsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_security(self) -> dict[str, Any]:
        row = await self._get_row(SECURITY_KEY)
        if not row:
            return {"force_mfa": False}
        value = row.setting_value
        return {
            "force_mfa": bool(value.get("force_mfa", False)),
        }

    async def set_force_mfa(self, enabled: bool, updated_by: uuid.UUID | None) -> dict[str, Any]:
        row = await self._get_row(SECURITY_KEY)
        payload = {"force_mfa": enabled}
        if row is None:
            row = SystemSetting(
                setting_key=SECURITY_KEY,
                setting_value=payload,
                updated_by=updated_by,
            )
            self._db.add(row)
        else:
            row.setting_value = payload
            row.updated_by = updated_by
        await self._db.flush()
        return payload

    async def _get_row(self, key: str) -> SystemSetting | None:
        stmt = select(SystemSetting).where(SystemSetting.setting_key == key)
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()
