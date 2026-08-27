import json
import logging
import time
import uuid
from collections import defaultdict
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..config import get_settings
from ..logging_config import request_id_var, user_id_var

logger = logging.getLogger(__name__)

router = APIRouter()


class BoardConnectionManager:
    """Manages WebSocket connections grouped by board_id.

    Also tracks per-card presence — viewers currently looking at a specific
    ticket. The frontend opts in by sending ``presence.subscribe`` after
    connect; we maintain the viewer set here so late joiners see the current
    state immediately on their first ``presence.update`` broadcast.
    """

    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = defaultdict(list)
        # Map column_id → board_id for broadcast routing
        self._column_board: dict[str, str] = {}
        # Map card_id → list of (websocket, user_dict) for presence tracking.
        self._card_viewers: dict[str, list[tuple[WebSocket, dict]]] = defaultdict(list)
        # Reverse index: websocket → list of card_ids it's subscribed to.
        # Lets us tear everything down cleanly on disconnect.
        self._ws_subscriptions: dict[WebSocket, set[str]] = defaultdict(set)

    async def connect(self, board_id: str, websocket: WebSocket):
        from ..metrics import WS_CONNECTIONS

        await websocket.accept()
        self.rooms[board_id].append(websocket)
        WS_CONNECTIONS.labels(type="board").inc()

    def disconnect(self, board_id: str, websocket: WebSocket):
        from ..metrics import WS_CONNECTIONS

        prev = len(self.rooms.get(board_id, []))
        self.rooms[board_id] = [ws for ws in self.rooms[board_id] if ws != websocket]
        removed = prev - len(self.rooms[board_id])
        if removed:
            WS_CONNECTIONS.labels(type="board").dec(removed)
        if not self.rooms[board_id]:
            del self.rooms[board_id]

        # Tear down any presence subscriptions this socket had — emit a
        # presence.update for each card so other viewers see the avatar leave.
        for card_id in list(self._ws_subscriptions.get(websocket, ())):
            self._remove_viewer(card_id, websocket)
        self._ws_subscriptions.pop(websocket, None)

    def _remove_viewer(self, card_id: str, websocket: WebSocket) -> None:
        viewers = self._card_viewers.get(card_id, [])
        self._card_viewers[card_id] = [(ws, user) for ws, user in viewers if ws is not websocket]
        if not self._card_viewers[card_id]:
            self._card_viewers.pop(card_id, None)
        self._ws_subscriptions.get(websocket, set()).discard(card_id)

    def viewers_for_card(self, card_id: str) -> list[dict]:
        """Return the unique viewer dicts (one per user) for a card."""
        seen: dict[str, dict] = {}
        for _ws, user in self._card_viewers.get(card_id, []):
            uid = str(user.get("id") or user.get("email") or "")
            if uid and uid not in seen:
                seen[uid] = user
        return list(seen.values())

    async def add_viewer(
        self, board_id: str, card_id: str, websocket: WebSocket, user: dict
    ) -> None:
        """Register the websocket as a viewer of card_id and broadcast presence."""
        existing = self._card_viewers[card_id]
        if not any(ws is websocket for ws, _ in existing):
            existing.append((websocket, user))
        self._ws_subscriptions[websocket].add(card_id)
        await self._broadcast_presence(board_id, card_id)

    async def remove_viewer(
        self, board_id: str, card_id: str, websocket: WebSocket
    ) -> None:
        self._remove_viewer(card_id, websocket)
        await self._broadcast_presence(board_id, card_id)

    async def _broadcast_presence(self, board_id: str, card_id: str) -> None:
        await self.broadcast(
            board_id,
            {
                "type": "presence.update",
                "payload": {
                    "card_id": card_id,
                    "viewers": self.viewers_for_card(card_id),
                },
            },
        )

    async def broadcast(self, board_id: str, event: dict, exclude: WebSocket | None = None):
        from ..tracing import tracer

        message = json.dumps(event)
        dead = []
        start = time.perf_counter()
        with tracer.start_as_current_span("ws.broadcast", attributes={"ws.room_id": board_id, "ws.type": "board"}):
            for ws in self.rooms.get(board_id, []):
                if ws == exclude:
                    continue
                try:
                    await ws.send_text(message)
                except Exception:
                    logger.debug("Board WS send failed, removing dead connection")
                    dead.append(ws)
        duration_s = time.perf_counter() - start
        duration_ms = duration_s * 1000

        from ..metrics import WS_BROADCAST_LATENCY

        WS_BROADCAST_LATENCY.labels(type="board").observe(duration_s)

        if duration_ms > 100:
            logger.warning(
                "Slow board broadcast: %.1fms to %d users in board %s",
                duration_ms,
                len(self.rooms.get(board_id, [])),
                board_id,
            )
        for ws in dead:
            self.disconnect(board_id, ws)

    def register_column(self, column_id: str, board_id: str):
        self._column_board[column_id] = board_id

    async def broadcast_card_event(self, column_id: str, event_type: str, card) -> None:
        """Broadcast a card event to the board room identified by column_id."""
        board_id = self._column_board.get(column_id)
        if not board_id:
            return

        event = {
            "type": event_type,
            "timestamp": datetime.now(UTC).isoformat(),
            "payload": {
                "id": card.id,
                "column_id": card.column_id,
                "position": card.position,
                "title": card.title,
                "priority": card.priority,
            },
        }
        await self.broadcast(board_id, event)

    async def broadcast_column_event(
        self, board_id: str, event_type: str, payload: dict
    ) -> None:
        """Broadcast a column lifecycle event (created/updated/deleted/reordered)."""
        event = {
            "type": event_type,
            "timestamp": datetime.now(UTC).isoformat(),
            "payload": payload,
        }
        await self.broadcast(board_id, event)


board_manager = BoardConnectionManager()


@router.websocket("/ws/board/{board_id}")
async def board_websocket(websocket: WebSocket, board_id: str, token: str = Query(...)):
    """WebSocket endpoint for board events.
    Connect via: ws://host/ws/board/{board_id}?token={jwt}
    """
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.nextauth_secret, algorithms=["HS256"])
        if not payload.get("email"):
            await websocket.close(code=4001, reason="Invalid token")
            return
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Set tracing context for this WebSocket connection
    request_id_var.set(f"ws-{uuid.uuid4().hex[:8]}")
    user_id_var.set(payload.get("email", "-"))

    # Build a presence-user dict from the JWT once per connection.
    user = {
        "id": payload.get("sub") or payload.get("email"),
        "email": payload.get("email"),
        "name": payload.get("name") or payload.get("email"),
        "image": payload.get("picture"),
    }

    await board_manager.connect(board_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                event = json.loads(data)
            except json.JSONDecodeError:
                continue

            event["timestamp"] = datetime.now(UTC).isoformat()

            # Presence + soft-lock messages are server-mediated so late joiners
            # see consistent state. Everything else is fanned out as-is.
            if event.get("type") == "presence.subscribe":
                card_id = (event.get("payload") or {}).get("card_id")
                if isinstance(card_id, str) and card_id:
                    await board_manager.add_viewer(board_id, card_id, websocket, user)
                continue
            if event.get("type") == "presence.unsubscribe":
                card_id = (event.get("payload") or {}).get("card_id")
                if isinstance(card_id, str) and card_id:
                    await board_manager.remove_viewer(board_id, card_id, websocket)
                continue
            if event.get("type") in ("card.editing.start", "card.editing.stop"):
                # Soft-lock indicator: stamp the user so the recipient knows
                # who's typing without snooping the JWT.
                payload_obj = event.setdefault("payload", {})
                payload_obj["user"] = user
                await board_manager.broadcast(board_id, event, exclude=websocket)
                continue

            await board_manager.broadcast(board_id, event, exclude=websocket)
    except WebSocketDisconnect:
        board_manager.disconnect(board_id, websocket)
        await board_manager.broadcast(
            board_id,
            {"type": "user_left", "timestamp": datetime.now(UTC).isoformat()},
        )
