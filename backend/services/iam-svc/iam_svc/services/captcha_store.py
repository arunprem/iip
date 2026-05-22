"""Captcha answer storage — Redis with in-memory fallback when Redis is unavailable."""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from redis.asyncio import Redis

from iip_core.logging import get_logger

logger = get_logger(__name__)

_memory: dict[str, tuple[str, float]] = {}
CAPTCHA_TTL_SECONDS = 180
_REDIS_OP_TIMEOUT_S = 2.0


async def _redis_setex(redis: Redis, key: str, ttl: int, value: str) -> None:
    await asyncio.wait_for(redis.setex(key, ttl, value), timeout=_REDIS_OP_TIMEOUT_S)


async def _redis_get(redis: Redis, key: str) -> Optional[bytes]:
    return await asyncio.wait_for(redis.get(key), timeout=_REDIS_OP_TIMEOUT_S)


async def _redis_delete(redis: Redis, key: str) -> None:
    await asyncio.wait_for(redis.delete(key), timeout=_REDIS_OP_TIMEOUT_S)


def _purge_expired_memory() -> None:
    now = time.monotonic()
    expired = [cid for cid, (_, exp) in _memory.items() if exp <= now]
    for cid in expired:
        _memory.pop(cid, None)


async def save_captcha(
    redis: Redis | None,
    captcha_id: str,
    captcha_text: str,
    *,
    ttl: int = CAPTCHA_TTL_SECONDS,
) -> None:
    key = f"captcha:{captcha_id}"
    if redis is not None:
        try:
            await _redis_setex(redis, key, ttl, captcha_text)
            return
        except Exception as exc:
            logger.warning("captcha_redis_save_failed", error=str(exc))

    _purge_expired_memory()
    _memory[captcha_id] = (captcha_text, time.monotonic() + ttl)


async def consume_captcha(redis: Redis | None, captcha_id: str) -> Optional[str]:
    key = f"captcha:{captcha_id}"
    if redis is not None:
        try:
            stored = await _redis_get(redis, key)
            if stored:
                await _redis_delete(redis, key)
                return stored.decode("utf-8")
        except Exception as exc:
            logger.warning("captcha_redis_consume_failed", error=str(exc))

    _purge_expired_memory()
    entry = _memory.pop(captcha_id, None)
    if not entry:
        return None
    text, expires = entry
    if time.monotonic() > expires:
        return None
    return text
