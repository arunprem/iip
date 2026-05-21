"""Declarative base for composite-key tables (no surrogate id from iip_core.db.Base)."""

from sqlalchemy.orm import DeclarativeBase

from iip_core.db import Base


class AssocBase(DeclarativeBase):
    """Shares registry with main Base so relationships resolve across models."""

    registry = Base.registry
