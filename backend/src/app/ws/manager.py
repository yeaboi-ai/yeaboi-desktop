import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class ConnectedUser:
    websocket: WebSocket
    user_id: str = ""
    name: str = ""
    email: str = ""
    color: str = "#e5a630"
    cursor_x: float = 0
    cursor_y: float = 0


class ConnectionManager:
    """Manages WebSocket connections grouped by room (session_id) with user identity."""

    # Palette for user cursor colors
    CURSOR_COLORS = [
        "#e5a630",
        "#4ade80",
        "#60a5fa",
        "#f472b6",
        "#a78bfa",
        "#34d399",
        "#fb923c",
        "#38bdf8",
        "#e879f9",
        "#fbbf24",
    ]

    def __init__(self):
        self.rooms: dict[str, list[ConnectedUser]] = defaultdict(list)
        # Scene storage: room_id -> {element_id -> element_data}
        self.scenes: dict[str, dict[str, dict]] = defaultdict(dict)
        # Internal subscribers (agent worker, etc.) — receive broadcasts but
        # don't show up in presence and don't get cursor/scene init traffic.
        # Used by the LiveKit agent so it sees user manual blueprint edits in
        # real time and can refresh its system prompt instead of narrating
        # stale state.
        self.internal_watchers: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, room_id: str, websocket: WebSocket, user_id: str = "", name: str = "", email: str = ""):
        await websocket.accept()
        # Assign a color based on connection count
        color_idx = len(self.rooms[room_id]) % len(self.CURSOR_COLORS)
        user = ConnectedUser(
            websocket=websocket,
            user_id=user_id,
            name=name,
            email=email,
            color=self.CURSOR_COLORS[color_idx],
        )
        self.rooms[room_id].append(user)

        from ..metrics import WS_CONNECTIONS

        WS_CONNECTIONS.labels(type="session").inc()

        # Broadcast presence update to all in room
        await self.broadcast_presence(room_id)

        # Send existing cursor positions to new connection
        await self.send_cursors_to(room_id, websocket)

        # Send current scene to new connection
        scene = self.get_scene(room_id)
        if scene:
            try:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "scene_init",
                            "payload": {"elements": scene},
                        }
                    )
                )
            except Exception:
                logger.debug("Failed to send scene_init to new connection in room %s", room_id)

    def disconnect(self, room_id: str, websocket: WebSocket):
        from ..metrics import WS_CONNECTIONS

        prev = len(self.rooms.get(room_id, []))
        self.rooms[room_id] = [u for u in self.rooms[room_id] if u.websocket != websocket]
        removed = prev - len(self.rooms[room_id])
        if removed:
            WS_CONNECTIONS.labels(type="session").dec(removed)
        if not self.rooms[room_id]:
            del self.rooms[room_id]

    async def broadcast(self, room_id: str, event: dict, exclude: WebSocket | None = None):
        """Send event to all connections in a room except the excluded one.

        Also forwards to internal watchers (e.g. the LiveKit agent) so they
        see the same events as user-facing clients without needing a JWT.
        """
        from ..tracing import tracer

        message = json.dumps(event)
        dead = []
        start = time.perf_counter()
        with tracer.start_as_current_span("ws.broadcast", attributes={"ws.room_id": room_id, "ws.type": "session"}):
            for user in self.rooms.get(room_id, []):
                if user.websocket == exclude:
                    continue
                try:
                    await user.websocket.send_text(message)
                except Exception:
                    logger.debug("WS send failed in room %s, removing dead connection", room_id)
                    dead.append(user.websocket)
            internal_dead: list[WebSocket] = []
            for ws in self.internal_watchers.get(room_id, []):
                try:
                    await ws.send_text(message)
                except Exception:
                    logger.debug("WS send to internal watcher failed in room %s", room_id)
                    internal_dead.append(ws)
            for ws in internal_dead:
                self.disconnect_internal_watcher(room_id, ws)
        duration_s = time.perf_counter() - start
        duration_ms = duration_s * 1000

        from ..metrics import WS_BROADCAST_LATENCY

        WS_BROADCAST_LATENCY.labels(type="session").observe(duration_s)

        if duration_ms > 100:
            logger.warning(
                "Slow broadcast: %.1fms to %d users in room %s", duration_ms, len(self.rooms.get(room_id, [])), room_id
            )
        for ws in dead:
            self.disconnect(room_id, ws)

    async def connect_internal_watcher(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.internal_watchers[room_id].append(websocket)

    def disconnect_internal_watcher(self, room_id: str, websocket: WebSocket) -> None:
        self.internal_watchers[room_id] = [w for w in self.internal_watchers.get(room_id, []) if w != websocket]
        if not self.internal_watchers[room_id]:
            del self.internal_watchers[room_id]

    async def send_to(self, room_id: str, event: dict):
        """Send event to all connections in a room."""
        await self.broadcast(room_id, event)

    async def broadcast_presence(self, room_id: str):
        """Send current presence list to all connections in room — deduplicated by user_id."""
        seen = set()
        users = []
        for u in self.rooms.get(room_id, []):
            if u.user_id and u.user_id not in seen:
                seen.add(u.user_id)
                users.append({"user_id": u.user_id, "name": u.name, "email": u.email, "color": u.color})
        await self.send_to(
            room_id,
            {
                "type": "presence_update",
                "payload": {"users": users},
            },
        )

    def get_connection_count(self, room_id: str) -> int:
        return len(self.rooms.get(room_id, []))

    def update_cursor(self, room_id: str, websocket: WebSocket, x: float, y: float) -> None:
        """Store latest cursor position for a user."""
        user = self.get_user_for_ws(room_id, websocket)
        if user:
            user.cursor_x = x
            user.cursor_y = y

    async def send_cursors_to(self, room_id: str, websocket: WebSocket) -> None:
        """Send all stored cursor positions to a specific connection."""
        for u in self.rooms.get(room_id, []):
            if u.websocket == websocket:
                continue
            if u.cursor_x == 0 and u.cursor_y == 0:
                continue
            try:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "cursor_position",
                            "payload": {
                                "user_id": u.user_id,
                                "name": u.name,
                                "color": u.color,
                                "x": u.cursor_x,
                                "y": u.cursor_y,
                            },
                        }
                    )
                )
            except Exception:
                logger.debug("Failed to send cursor update in room %s", room_id)

    def merge_scene_elements(self, room_id: str, elements: list[dict]) -> list[dict]:
        """Merge incoming elements with stored scene. Last-write-wins by version."""
        scene = self.scenes[room_id]
        changed = []
        for el in elements:
            eid = el.get("id")
            if not eid:
                continue
            existing = scene.get(eid)
            if not existing or el.get("version", 0) >= existing.get("version", 0):
                scene[eid] = el
                changed.append(el)
        return changed

    def get_scene(self, room_id: str) -> list[dict]:
        """Get full scene as element list."""
        return list(self.scenes[room_id].values())

    def get_user_for_ws(self, room_id: str, websocket: WebSocket) -> ConnectedUser | None:
        for u in self.rooms.get(room_id, []):
            if u.websocket == websocket:
                return u
        return None


# Global singleton
manager = ConnectionManager()
