"""ORM base for legacy reference tables (integer PK, no audit columns)."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class LegacyReferenceBase(DeclarativeBase):
    """Separate metadata for legacy unit_type / rank tables."""

    pass
