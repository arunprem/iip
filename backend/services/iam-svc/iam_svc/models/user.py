from datetime import datetime
from typing import List, Optional
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, Table, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from iip_core.db import Base
from iam_svc.models.role import Role

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", PG_UUID(as_uuid=True), ForeignKey("iam.users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", PG_UUID(as_uuid=True), ForeignKey("iam.roles.id", ondelete="CASCADE"), primary_key=True),
    Column("granted_by", PG_UUID(as_uuid=True), ForeignKey("iam.users.id"), nullable=True),
    Column("justification", Text, nullable=True),
    Column("granted_at", DateTime(timezone=True), default=func.now(), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=True),
    schema="iam"
)

class User(Base):
    """IAM User profile."""
    __tablename__ = "users"
    __table_args__ = {"schema": "iam"}

    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    badge_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    department: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    clearance_level: Mapped[str] = mapped_column(String(20), default="UNCLASSIFIED", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mfa_secret: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    roles: Mapped[List["Role"]] = relationship(
        "Role", 
        secondary=user_roles,
        foreign_keys=[user_roles.c.user_id, user_roles.c.role_id],
        lazy="selectin"
    )
