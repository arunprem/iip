from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from iip_core.db import Base


class PrivilegeAction(Base):
    __tablename__ = "privilege_actions"
    __table_args__ = {"schema": "iam"}

    privilege_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.privileges.id", ondelete="CASCADE"), nullable=False
    )
    action_code: Mapped[str] = mapped_column(String(100), nullable=False)
    action_label: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    privilege: Mapped["Privilege"] = relationship("Privilege", back_populates="actions", lazy="joined")


from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from iam_svc.models.privilege import Privilege
