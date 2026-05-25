"""Mobile app widget definitions (admin-controlled feature modules)."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from iip_core.db import Base


class MobileWidget(Base):
    __tablename__ = "mobile_widgets"
    __table_args__ = {"schema": "iam"}

    widget_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(100), nullable=False, default="LayoutGrid")
    menu_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    privilege_code: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    mobile_route: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
