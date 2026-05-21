from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from iam_svc.models.legacy_reference_base import LegacyReferenceBase


class Rank(LegacyReferenceBase):
    """Legacy rank reference (head_rank / idrank)."""

    __tablename__ = "ranks"
    __table_args__ = {"schema": "iam"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rank_desc: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rank_short_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit_head: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rank_priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
