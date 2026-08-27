import json
import logging
import uuid
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from ..config import get_settings
from ..db import get_session_factory
from ..logging_config import request_id_var, user_id_var
from ..models.session import Participant, Session
from ..models.user import User
from .manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()

_last_persist: dict[str, float] = {}


async def _maybe_persist_canvas(session_id: str) -> None:
    """Save canvas to DB, throttled to max once per 5 seconds."""
    import time

    now = time.time()
    if now - _last_persist.get(session_id, 0) < 5:
        return
    _last_persist[session_id] = now

    try:
        scene = manager.get_scene(session_id)
        if not scene:
            return
        session_factory = get_session_factory()
        async with session_factory() as db:
            result = await db.execute(select(Session).where(Session.id == session_id))
            session_obj = result.scalar_one_or_none()
            if session_obj:
                session_obj.canvas_elements = scene
                await db.commit()
                # Dual-write canvas sync event
                try:
                    from ..services.event_writer import write_canvas_sync_event
                    element_types: dict[str, int] = {}
                    for el in scene:
                        t = el.get("type", "unknown") if isinstance(el, dict) else "unknown"
                        element_types[t] = element_types.get(t, 0) + 1
                    await write_canvas_sync_event(
                        session_id=session_id,
                        element_count=len(scene),
                        types=element_types,
                        db=db,
                    )
                except Exception:
                    pass  # Canvas sync is fire-and-forget
    except Exception:
        logger.warning("Failed to persist canvas for session %s", session_id, exc_info=True)


async def _load_canvas_from_db(session_id: str) -> list[dict]:
    """Load canvas elements from DB into memory."""
    try:
        session_factory = get_session_factory()
        async with session_factory() as db:
            result = await db.execute(select(Session.canvas_elements).where(Session.id == session_id))
            elements = result.scalar_one_or_none()
            if elements and isinstance(elements, list):
                # Load into in-memory scene
                for el in elements:
                    eid = el.get("id")
                    if eid:
                        manager.scenes[session_id][eid] = el
                return elements
    except Exception:
        logger.warning("Failed to load canvas from DB for session %s", session_id, exc_info=True)
    return []


async def _ensure_participant(session_id: str, email: str) -> None:
    """Add user as session participant if not already one."""
    try:
        session_factory = get_session_factory()
        async with session_factory() as db:
            # Find user by email
            user_result = await db.execute(select(User).where(User.email == email))
            user = user_result.scalar_one_or_none()
            if not user:
                return

            # Check if already participant
            existing = await db.execute(
                select(Participant).where(
                    Participant.session_id == session_id,
                    Participant.user_id == user.id,
                )
            )
            if existing.scalar_one_or_none():
                return

            # Verify session exists
            session_result = await db.execute(select(Session).where(Session.id == session_id))
            if not session_result.scalar_one_or_none():
                return

            # Add as member
            db.add(Participant(session_id=session_id, user_id=user.id, role="member"))
            await db.commit()
    except Exception:
        logger.debug("Failed to auto-add participant for session %s", session_id, exc_info=True)


@router.websocket("/ws/session/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: str, token: str = Query(...)):
    """WebSocket endpoint for session events. Requires JWT token as query parameter.
    Connect via: ws://host/ws/session/{id}?token={jwt}
    """
    # Validate JWT and extract user info
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.nextauth_secret, algorithms=["HS256"])
        email = payload.get("email")
        if not email:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_name = payload.get("name", email.split("@")[0])

    # Set tracing context for this WebSocket connection
    request_id_var.set(f"ws-{uuid.uuid4().hex[:8]}")
    user_id_var.set(email)

    # Auto-add as participant if not already
    await _ensure_participant(session_id, email)

    # Load canvas from DB if this is the first connection to this room
    if manager.get_connection_count(session_id) == 0 and not manager.get_scene(session_id):
        await _load_canvas_from_db(session_id)

    await manager.connect(
        session_id,
        websocket,
        user_id=email,  # Use email as stable user ID
        name=user_name,
        email=email,
    )

    try:
        while True:
            data = await websocket.receive_text()
            try:
                event = json.loads(data)
            except json.JSONDecodeError:
                continue

            # Inject sender identity for cursor/presence events + store position
            user = manager.get_user_for_ws(session_id, websocket)
            if user and event.get("type") in ("cursor_position", "cursor_update"):
                event.setdefault("payload", {})
                event["payload"]["user_id"] = user.user_id
                event["payload"]["name"] = user.name
                event["payload"]["color"] = user.color
                # Store last known position
                p = event.get("payload", {})
                manager.update_cursor(session_id, websocket, p.get("x", 0), p.get("y", 0))

            # Handle scene updates — merge, relay, and periodically persist
            if event.get("type") == "scene_update":
                elements = event.get("payload", {}).get("elements", [])
                changed = manager.merge_scene_elements(session_id, elements)
                if changed:
                    event = {
                        "type": "scene_update",
                        "payload": {"elements": changed},
                        "timestamp": datetime.now(UTC).isoformat(),
                    }
                    await manager.broadcast(session_id, event, exclude=websocket)
                    # Persist to DB (throttled — only if 5s since last save)
                    await _maybe_persist_canvas(session_id)
                continue

            # Add server timestamp and broadcast to room
            event["timestamp"] = datetime.now(UTC).isoformat()
            await manager.broadcast(session_id, event, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
        # Force-persist canvas when last user leaves
        if manager.get_connection_count(session_id) == 0:
            _last_persist.pop(session_id, None)  # clear throttle
            try:
                scene = manager.get_scene(session_id)
                if scene:
                    session_factory = get_session_factory()
                    async with session_factory() as db:
                        result = await db.execute(select(Session).where(Session.id == session_id))
                        s = result.scalar_one_or_none()
                        if s:
                            s.canvas_elements = scene
                            await db.commit()
            except Exception:
                logger.warning("Failed to persist canvas on disconnect for session %s", session_id, exc_info=True)
        # Broadcast updated presence + leave notification
        await manager.broadcast_presence(session_id)
        await manager.broadcast(
            session_id,
            {
                "type": "participant_left",
                "payload": {"name": user_name, "email": email},
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
