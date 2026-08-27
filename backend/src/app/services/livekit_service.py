import asyncio
import json
import logging

import httpx
from livekit import api

from ..config import get_settings
from ..schemas.livekit import DetachAgentResponse

logger = logging.getLogger(__name__)


def create_room_token(
    room_name: str,
    participant_name: str,
    participant_identity: str,
    metadata: str = "",
) -> str:
    """Generate a LiveKit access token for a participant to join a room."""
    settings = get_settings()
    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(participant_identity)
        .with_name(participant_name)
        .with_metadata(metadata)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
    )
    return token.to_jwt()


async def create_room(room_name: str) -> dict:
    """Create a LiveKit room via the API."""
    settings = get_settings()
    lk_url = settings.livekit_url.replace("ws://", "http://").replace("wss://", "https://")
    async with api.LiveKitAPI(lk_url, settings.livekit_api_key, settings.livekit_api_secret) as lk:
        try:
            room = await lk.room.create_room(api.CreateRoomRequest(name=room_name))
            return {"name": room.name, "sid": room.sid}
        except Exception:
            rooms = await lk.room.list_rooms(api.ListRoomsRequest(names=[room_name]))
            if rooms.rooms:
                r = rooms.rooms[0]
                return {"name": r.name, "sid": r.sid}
            raise


async def check_agent_in_room(session_id: str) -> dict:
    """Check if the AI agent is present in a LiveKit room."""
    settings = get_settings()
    room_name = f"session-{session_id}"
    lk_url = settings.livekit_url.replace("ws://", "http://").replace("wss://", "https://")

    try:
        async with api.LiveKitAPI(lk_url, settings.livekit_api_key, settings.livekit_api_secret) as lk:
            # Check if room exists
            rooms = await lk.room.list_rooms(api.ListRoomsRequest(names=[room_name]))
            if not rooms.rooms:
                return {"room_exists": False, "agent_connected": False, "participants": 0}

            # List participants and look for agent
            participants = await lk.room.list_participants(api.ListParticipantsRequest(room=room_name))
            agent_found = False
            participant_count = 0
            for p in participants.participants:
                participant_count += 1
                # Agent identity starts with "agent" (set by LiveKit agent SDK)
                if p.identity and (p.identity.startswith("agent") or p.kind == 1):  # kind=1 is AGENT
                    agent_found = True

            return {
                "room_exists": True,
                "agent_connected": agent_found,
                "participants": participant_count,
            }
    except Exception as e:
        logger.warning("Failed to check agent status: %s", e)
        return {"room_exists": False, "agent_connected": False, "participants": 0, "error": str(e)}


def _is_agent_participant(p) -> bool:
    """Identify an agent participant by identity prefix or LiveKit kind enum."""
    return bool(p.identity) and (p.identity.startswith("agent") or p.kind == 1)


def _lk_http_url() -> str:
    settings = get_settings()
    return settings.livekit_url.replace("ws://", "http://").replace("wss://", "https://")


async def list_agent_identities(lk: "api.LiveKitAPI", room_name: str) -> list[str]:
    """Return identities of all agent participants currently in the room.

    Takes an open LiveKitAPI client so callers can batch multiple operations
    in a single connection.
    """
    try:
        resp = await lk.room.list_participants(api.ListParticipantsRequest(room=room_name))
    except Exception as e:
        logger.debug("list_participants failed for %s: %s", room_name, e)
        return []
    return [p.identity for p in resp.participants if _is_agent_participant(p)]


async def force_remove_agents(lk: "api.LiveKitAPI", room_name: str) -> list[str]:
    """Remove every agent participant from the room. Returns identities removed."""
    identities = await list_agent_identities(lk, room_name)
    removed: list[str] = []
    for identity in identities:
        try:
            await lk.room.remove_participant(api.RoomParticipantIdentity(room=room_name, identity=identity))
            removed.append(identity)
            logger.info("Removed agent %s from room %s", identity, room_name)
        except Exception as e:
            logger.warning("Failed to remove agent %s from %s: %s", identity, room_name, e)
    return removed


async def _broadcast_agent_status(session_id: str, status: str) -> None:
    """Synthesize an agent_status WebSocket event when the worker can't broadcast itself.

    Used during forced detach: if the worker is hung or already dead, the UI would
    otherwise stay stuck showing the agent. Broadcasting via the internal endpoint
    keeps WebSocket clients in sync with reality.
    """
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            await client.post(
                f"{settings.backend_url}/api/internal/agent-status",
                json={"session_id": session_id, "status": status},
                headers={"X-Internal-Secret": settings.internal_api_secret},
            )
    except Exception as e:
        logger.debug("Failed to broadcast synthetic agent_status: %s", e)


async def publish_steering(session_id: str, action: str, source_identity: str) -> None:
    """Broadcast a participant-initiated steering event to the agent.

    Mirrors the envelope the frontend's data-channel hook uses so the worker's
    dispatch can treat slash-command sourced events identically to chip clicks.
    Best-effort — failures are logged and swallowed so the chat path still
    returns a system note.
    """
    settings = get_settings()
    room_name = f"session-{session_id}"
    payload = json.dumps(
        {
            "type": action,
            "payload": {},
            "from": source_identity,
            "ts": int(asyncio.get_event_loop().time() * 1000),
        }
    ).encode()
    async with api.LiveKitAPI(_lk_http_url(), settings.livekit_api_key, settings.livekit_api_secret) as lk:
        try:
            await lk.room.send_data(
                api.SendDataRequest(
                    room=room_name,
                    data=payload,
                    kind=api.DataPacket.Kind.RELIABLE,
                    topic="agent_steering",
                )
            )
        except Exception as e:
            logger.warning("Failed to publish steering action %s to %s: %s", action, room_name, e)


async def detach_agent_flow(session_id: str, say_goodbye: bool) -> DetachAgentResponse:
    """Hybrid graceful-then-forced detach used by both public and internal routes.

    1. List agents in the room. If none, no-op success.
    2. Send an `agent_control` data message to each agent participant.
    3. Poll for the agent(s) to leave on their own up to LIVEKIT_DETACH_GRACE_SECONDS.
    4. If any remain, force-remove via RoomService and synthesize a `detached` status.

    Raises:
        Exception: if the LiveKit API itself errors out. Callers map to HTTP 503.
    """
    settings = get_settings()
    room_name = f"session-{session_id}"
    grace_seconds = settings.livekit_detach_grace_seconds
    poll_interval = 0.5

    async with api.LiveKitAPI(_lk_http_url(), settings.livekit_api_key, settings.livekit_api_secret) as lk:
        initial = await list_agent_identities(lk, room_name)
        if not initial:
            return DetachAgentResponse(detached=True, method="noop", removed=[])

        payload = json.dumps({"action": "detach", "say_goodbye": say_goodbye}).encode()
        for identity in initial:
            try:
                await lk.room.send_data(
                    api.SendDataRequest(
                        room=room_name,
                        data=payload,
                        kind=api.DataPacket.Kind.RELIABLE,
                        destination_identities=[identity],
                        topic="agent_control",
                    )
                )
                logger.info("Sent detach signal to agent %s in %s", identity, room_name)
            except Exception as e:
                logger.warning("Failed to send detach signal to %s: %s", identity, e)

        deadline = asyncio.get_event_loop().time() + grace_seconds
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(poll_interval)
            remaining = await list_agent_identities(lk, room_name)
            if not remaining:
                return DetachAgentResponse(detached=True, method="graceful", removed=initial)

        logger.warning("Detach grace period expired for session %s; forcing removal", session_id)
        removed = await force_remove_agents(lk, room_name)

    await _broadcast_agent_status(session_id, "detached")
    return DetachAgentResponse(detached=True, method="forced", removed=removed)
