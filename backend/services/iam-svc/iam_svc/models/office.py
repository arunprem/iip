from sqlalchemy import Boolean, String
from typing import TYPE_CHECKING

from sqlalchemy.orm import Mapped, mapped_column, relationship
from iip_core.db import Base

if TYPE_CHECKING:
    from iam_svc.models.user_office_role import UserOfficeRole


class Office(Base):
    __tablename__ = "offices"
    __table_args__ = {"schema": "iam"}

    office_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    office_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user_assignments: Mapped[list["UserOfficeRole"]] = relationship(
        "UserOfficeRole", back_populates="office", lazy="selectin"
    )
