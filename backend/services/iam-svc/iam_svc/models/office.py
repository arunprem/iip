from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from iip_core.db import Base

if TYPE_CHECKING:
    from iam_svc.models.user_office_role import UserOfficeRole


class Office(Base):
    """Organizational unit (office) in a nested-set hierarchy."""

    __tablename__ = "offices"
    __table_args__ = {"schema": "iam"}

    office_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    office_name: Mapped[str] = mapped_column(String(255), nullable=False)
    office_short_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ncrb_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    office_type_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    head_rank: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_parent_unit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    district_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    list_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    legacy_unit_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True)

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.offices.id", ondelete="RESTRICT"),
        nullable=True,
    )
    lft: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rgt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    hlevel: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    root_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.offices.id", ondelete="RESTRICT"),
        nullable=True,
    )

    parent: Mapped["Office | None"] = relationship(
        "Office",
        remote_side="Office.id",
        foreign_keys=[parent_id],
        lazy="selectin",
    )
    user_assignments: Mapped[list["UserOfficeRole"]] = relationship(
        "UserOfficeRole", back_populates="office", lazy="selectin"
    )
