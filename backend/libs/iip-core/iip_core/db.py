"""
IIP Core — Async Database Engine and Session Factory.

Provides:
  - Async SQLAlchemy engine with connection pool settings
  - Async session factory via `get_db` FastAPI dependency
  - Base declarative ORM model with automatic `created_at` / `updated_at` timestamps
  - Classification-aware row-level security context variable
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import DateTime, String, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from iip_core.settings import BaseServiceSettings, ClassificationLevel

# Context variable for current user's max classification level (used for RLS)
_current_classification: ContextVar[ClassificationLevel] = ContextVar(
    "_current_classification",
    default=ClassificationLevel.UNCLASSIFIED,
)


def set_classification_context(level: ClassificationLevel) -> None:
    """Set the active classification context for the current request scope."""
    _current_classification.set(level)


def get_classification_context() -> ClassificationLevel:
    """Get the active classification level for the current request scope."""
    return _current_classification.get()


def build_engine(settings: BaseServiceSettings) -> AsyncEngine:
    """Create and return an async SQLAlchemy engine with pool configuration."""
    return create_async_engine(
        str(settings.database_url),
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_pre_ping=settings.db_pool_pre_ping,
        echo=settings.environment.value == "local",
        future=True,
    )


def build_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create a bound session factory for the given engine."""
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )


# Module-level singletons (initialized by the service at startup)
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_db(settings: BaseServiceSettings) -> None:
    """Initialize the database engine and session factory. Call once at startup."""
    global _engine, _session_factory
    _engine = build_engine(settings)
    _session_factory = build_session_factory(_engine)


async def close_db() -> None:
    """Dispose the database engine on shutdown."""
    if _engine:
        await _engine.dispose()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield an async database session per request."""
    if _session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db() at startup.")
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager version for use outside of FastAPI dependency injection."""
    if _session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db() at startup.")
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


class Base(DeclarativeBase):
    """Declarative base with auto-managed UUID primary key and audit timestamps."""

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        server_default=text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
        server_default=text("NOW()"),
    )
