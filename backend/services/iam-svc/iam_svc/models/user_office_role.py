from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from iam_svc.models.associations import AssocBase

if TYPE_CHECKING:
    from iam_svc.models.office import Office
    from iam_svc.models.role import Role
    from iam_svc.models.user import User


class UserOfficeRole(AssocBase):
    __tablename__ = "user_office_roles"
    __table_args__ = {"schema": "iam"}

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.users.id", ondelete="CASCADE"), primary_key=True
    )
    office_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.offices.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.roles.id", ondelete="RESTRICT"), nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="office_assignments")
    office: Mapped["Office"] = relationship("Office", back_populates="user_assignments", lazy="joined")
    role: Mapped["Role"] = relationship("Role", lazy="joined")
