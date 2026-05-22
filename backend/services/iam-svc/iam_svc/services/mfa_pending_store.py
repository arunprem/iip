"""Short-lived MFA login state between password and TOTP verification."""

from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import asdict, dataclass
from typing import Literal, Optional

from redis.asyncio import Redis

from iip_core.logging import get_logger

logger = get_logger(__name__)

MFA_PENDING_TTL_SECONDS = 600
_REDIS_OP_TIMEOUT_S = 2.0
_memory: dict[str, tuple[str, float]] = {}


@dataclass
class MfaPendingSession:
    user_id: str
    username: str
    access_token: str
    refresh_token: str
    expires_in: int
    purpose: Literal["login", "unlock"]
    enrollment_required: bool = False
    setup_secret: str | None = None


def _purge_memory() -> None:
    now = time.monotonic()
    expired = [k for k, (_, exp) in _memory.items() if exp <= now]
    for k in expired:
        _memory.pop(k, None)


async def create_pending_session(
    redis: Redis | None,
    session: MfaPendingSession,
    *,
    ttl: int = MFA_PENDING_TTL_SECONDS,
) -> str:
    token = secrets.token_urlsafe(32)
    payload = json.dumps(asdict(session))
    key = f"mfa_pending:{token}"

    if redis is not None:
        try:
            await asyncio.wait_for(redis.setex(key, ttl, payload), timeout=_REDIS_OP_TIMEOUT_S)
            return token
        except Exception as exc:
            logger.warning("mfa_pending_redis_save_failed", error=str(exc))

    _purge_memory()
    _memory[token] = (payload, time.monotonic() + ttl)
    return token


async def get_pending_session(redis: Redis | None, token: str) -> Optional[MfaPendingSession]:
    key = f"mfa_pending:{token}"
    raw: str | None = None

    if redis is not None:
        try:
            stored = await asyncio.wait_for(redis.get(key), timeout=_REDIS_OP_TIMEOUT_S)
            if stored:
                raw = stored.decode("utf-8")
        except Exception as exc:
            logger.warning("mfa_pending_redis_get_failed", error=str(exc))

    if raw is None:
        _purge_memory()
        entry = _memory.get(token)
        if not entry:
            return None
        payload, expires = entry
        if time.monotonic() > expires:
            _memory.pop(token, None)
            return None
        raw = payload

    data = json.loads(raw)
    return MfaPendingSession(**data)


async def update_pending_session(
    redis: Redis | None,
    token: str,
    session: MfaPendingSession,
    *,
    ttl: int = MFA_PENDING_TTL_SECONDS,
) -> None:
    """Refresh session fields (e.g. setup_secret) while keeping the same mfa_token."""
    payload = json.dumps(asdict(session))
    key = f"mfa_pending:{token}"

    if redis is not None:
        try:
            await asyncio.wait_for(redis.setex(key, ttl, payload), timeout=_REDIS_OP_TIMEOUT_S)
            return
        except Exception as exc:
            logger.warning("mfa_pending_redis_update_failed", error=str(exc))

    _purge_memory()
    _memory[token] = (payload, time.monotonic() + ttl)


async def consume_pending_session(redis: Redis | None, token: str) -> Optional[MfaPendingSession]:
    session = await get_pending_session(redis, token)
    if not session:
        return None

    key = f"mfa_pending:{token}"
    if redis is not None:
        try:
            await asyncio.wait_for(redis.delete(key), timeout=_REDIS_OP_TIMEOUT_S)
        except Exception as exc:
            logger.warning("mfa_pending_redis_delete_failed", error=str(exc))
    _memory.pop(token, None)
    return session
