from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from iip_core.db import Base

class Role(Base):
    """IAM Role definition."""
    __tablename__ = "roles"
    __table_args__ = {"schema": "iam"}

    role_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    requires_jit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
