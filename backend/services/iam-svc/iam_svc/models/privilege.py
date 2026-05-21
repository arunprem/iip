from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from iip_core.db import Base


class Privilege(Base):
    __tablename__ = "privileges"
    __table_args__ = {"schema": "iam"}

    privilege_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    module: Mapped[str] = mapped_column(String(100), nullable=False)
    privilege_type: Mapped[str] = mapped_column(String(20), nullable=False, default="DATA")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    actions: Mapped[list["PrivilegeAction"]] = relationship(
        "PrivilegeAction", back_populates="privilege", lazy="selectin", cascade="all, delete-orphan"
    )
    menus: Mapped[list["Menu"]] = relationship("Menu", back_populates="privilege", lazy="noload")


from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from iam_svc.models.privilege_action import PrivilegeAction
    from iam_svc.models.menu import Menu
