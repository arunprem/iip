"""In-process WebSocket fan-out for real-time user notifications (single iam-svc instance)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from iip_core.logging import get_logger

logger = get_logger(__name__)

MAX_CONNECTIONS_PER_USER = 3
PING_PAYLOAD = "ping"
PONG_PAYLOAD = "pong"


class NotificationHub:
    """Tracks active sockets per IAM user id; prunes dead connections on send failure."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def register(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            bucket = self._connections.setdefault(user_id, set())
            while len(bucket) >= MAX_CONNECTIONS_PER_USER:
                oldest = next(iter(bucket))
                bucket.discard(oldest)
                await _close_quietly(oldest)
            bucket.add(websocket)
            active = len(bucket)
        logger.debug("notification_ws_connected", user_id=user_id, active=active)

    async def unregister(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            bucket = self._connections.get(user_id)
            if bucket:
                bucket.discard(websocket)
                if not bucket:
                    self._connections.pop(user_id, None)
        await _close_quietly(websocket)

    async def listen(self, user_id: str, websocket: WebSocket) -> None:
        """Hold connection until client disconnects; answer keepalive pings only."""
        try:
            while True:
                message = await websocket.receive_text()
                if message.strip().lower() == PING_PAYLOAD:
                    if websocket.client_state == WebSocketState.CONNECTED:
                        await websocket.send_text(PONG_PAYLOAD)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.debug("notification_ws_listen_end", user_id=user_id, error=str(exc))
        finally:
            await self.unregister(user_id, websocket)

    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> bool:
        """Push one event to all sockets for a user. Returns True if at least one send succeeded."""
        text = json.dumps(payload, separators=(",", ":"))
        async with self._lock:
            sockets = list(self._connections.get(user_id, []))

        if not sockets:
            return False

        delivered = 0
        stale: list[WebSocket] = []
        for ws in sockets:
            if ws.client_state != WebSocketState.CONNECTED:
                stale.append(ws)
                continue
            try:
                await ws.send_text(text)
                delivered += 1
            except Exception:
                stale.append(ws)

        for ws in stale:
            await self.unregister(user_id, ws)
        return delivered > 0

    async def broadcast(
        self,
        payload: dict[str, Any],
        *,
        exclude_user_ids: set[str] | None = None,
    ) -> int:
        """Send JSON event to all connected users. Returns delivery count."""
        exclude = exclude_user_ids or set()
        text = json.dumps(payload, separators=(",", ":"))

        async with self._lock:
            snapshot = [
                (uid, list(sockets))
                for uid, sockets in self._connections.items()
                if uid not in exclude and sockets
            ]

        delivered = 0
        stale: list[tuple[str, WebSocket]] = []

        for user_id, sockets in snapshot:
            for ws in sockets:
                if ws.client_state != WebSocketState.CONNECTED:
                    stale.append((user_id, ws))
                    continue
                try:
                    await ws.send_text(text)
                    delivered += 1
                except Exception:
                    stale.append((user_id, ws))

        for user_id, ws in stale:
            await self.unregister(user_id, ws)

        logger.info(
            "notification_broadcast",
            event_type=payload.get("type"),
            recipients=delivered,
            excluded=len(exclude),
        )
        return delivered

    @property
    def connection_count(self) -> int:
        return sum(len(s) for s in self._connections.values())


async def _close_quietly(websocket: WebSocket) -> None:
    try:
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close(code=1000)
    except Exception:
        pass


notification_hub = NotificationHub()
