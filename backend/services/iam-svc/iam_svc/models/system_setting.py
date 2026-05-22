"""Key-value system settings (JSON payloads)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from iam_svc.models.associations import AssocBase


class SystemSetting(AssocBase):
    """Maps iam.system_settings (setting_key PK; no surrogate id)."""

    __tablename__ = "system_settings"
    __table_args__ = {"schema": "iam"}

    setting_key: Mapped[str] = mapped_column(String(100), primary_key=True)
    setting_value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.users.id", ondelete="SET NULL"),
        nullable=True,
    )
