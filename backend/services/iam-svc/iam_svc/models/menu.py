from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from iip_core.db import Base


class Menu(Base):
    __tablename__ = "menus"
    __table_args__ = {"schema": "iam"}

    menu_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    icon: Mapped[str] = mapped_column(String(100), default="Circle", nullable=False)
    parent_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.menus.id", ondelete="CASCADE"), nullable=True
    )
    section: Mapped[str] = mapped_column(String(100), default="Menu", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    privilege_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.privileges.id", ondelete="SET NULL"), nullable=True
    )
    is_group: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    privilege: Mapped[Optional["Privilege"]] = relationship("Privilege", back_populates="menus", lazy="joined")
    children: Mapped[list["Menu"]] = relationship(
        "Menu", back_populates="parent", lazy="selectin", order_by="Menu.sort_order"
    )
    parent: Mapped[Optional["Menu"]] = relationship(
        "Menu", back_populates="children", remote_side="Menu.id", lazy="noload"
    )


from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from iam_svc.models.privilege import Privilege
