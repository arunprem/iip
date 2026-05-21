"""Association tables for role ↔ menu/data grants (no ORM models)."""

from sqlalchemy import Column, Table
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from iip_core.db import Base

role_menu_privileges = Table(
    "role_menu_privileges",
    Base.metadata,
    Column("role_id", PG_UUID(as_uuid=True), primary_key=True),
    Column("privilege_id", PG_UUID(as_uuid=True), primary_key=True),
    schema="iam",
)

role_privilege_actions = Table(
    "role_privilege_actions",
    Base.metadata,
    Column("role_id", PG_UUID(as_uuid=True), primary_key=True),
    Column("privilege_id", PG_UUID(as_uuid=True), nullable=False),
    Column("action_id", PG_UUID(as_uuid=True), primary_key=True),
    schema="iam",
)
