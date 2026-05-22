"""Redis connection for IAM service (optional — captcha/auth fall back to in-memory)."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from typing import Optional

import redis.asyncio as redis
from iip_core.logging import get_logger
from iip_core.settings import get_settings

logger = get_logger(__name__)

_REDIS_PING_TIMEOUT_S = 2.0


def _build_client() -> redis.Redis:
    settings = get_settings()
    return redis.from_url(
        str(settings.redis_url),
        decode_responses=False,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


async def _yield_redis_client() -> AsyncGenerator[Optional[redis.Redis], None]:
    """Connect with a quick ping, yield the client, then close. Does not swallow route errors."""
    client = _build_client()
    try:
        await asyncio.wait_for(client.ping(), timeout=_REDIS_PING_TIMEOUT_S)
    except Exception as exc:
        logger.warning("redis_unavailable", error=str(exc))
        yield None
        return
    try:
        yield client
    finally:
        try:
            await client.aclose()
        except Exception:
            pass


async def get_redis_optional() -> AsyncGenerator[Optional[redis.Redis], None]:
    """Yield a Redis client after a quick ping, or None if unavailable (no long hang)."""
    async for client in _yield_redis_client():
        yield client


async def get_redis() -> AsyncGenerator[redis.Redis | None, None]:
    """Yield Redis for routes that prefer Redis; None when unavailable."""
    async for client in _yield_redis_client():
        yield client
