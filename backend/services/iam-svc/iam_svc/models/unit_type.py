from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from iam_svc.models.legacy_reference_base import LegacyReferenceBase


class UnitType(LegacyReferenceBase):
    """Legacy unit_type reference (idunittype)."""

    __tablename__ = "unit_types"
    __table_args__ = {"schema": "iam"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
