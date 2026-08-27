import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from livekit import api
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..db import get_db, get_session_factory
from ..deps import get_current_user
from ..models.session import Participant, Session  # noqa: F401
from ..models.user import User
from ..schemas.livekit import DetachAgentRequest, DetachAgentResponse, LiveKitTokenResponse
from ..services.livekit_service import (
    check_agent_in_room,
    create_room,
    create_room_token,
    detach_agent_flow,
    force_remove_agents,
)
from ..services.recording import is_recording_enabled, start_recording

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["livekit"])


@router.post("/{session_id}/livekit-token", response_model=LiveKitTokenResponse)
async def get_livekit_token(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a LiveKit token for the user to join the session's audio/video room."""
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status not in ("lobby", "live"):
        raise HTTPException(status_code=400, detail="Session is not active")

    # Auto-add user as participant if not already in the session
    if not any(p.user_id == user.id for p in session.participants):
        new_participant = Participant(
            session_id=session_id,
            user_id=user.id,
            role="member",
        )
        db.add(new_participant)
        await db.commit()
        await db.refresh(session, attribute_names=["participants"])

    # Room name = session ID
    room_name = f"session-{session_id}"

    # Create room if it doesn't exist
    await create_room(room_name)

    # Kick off egress recording when at least one participant has consented.
    # Idempotent — `start_recording` no-ops when one is already in flight.
    # Fire-and-forget on its own DB session so token minting isn't blocked
    # by LiveKit egress latency.
    if is_recording_enabled() and any(p.recording_consent is True for p in session.participants):

        async def _start_in_background() -> None:
            factory = get_session_factory()
            async with factory() as bg_db:
                try:
                    await start_recording(db=bg_db, session_id=session_id, started_by_id=user.id)
                except Exception:
                    logger.exception("Background start_recording failed for session %s", session_id)

        asyncio.create_task(_start_in_background())

    # Generate participant token with avatar metadata
    import json

    settings = get_settings()
    metadata = json.dumps({"avatar_url": user.avatar_url or ""})
    participant_name = user.display_name or user.name or user.email
    token = create_room_token(
        room_name=room_name,
        participant_name=participant_name,
        participant_identity=user.id,
        metadata=metadata,
    )

    return {"token": token, "url": settings.livekit_url, "participant_name": participant_name}


@router.get("/{session_id}/agent-status")
async def get_agent_status(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check if the AI agent is connected to the session's voice room."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    status = await check_agent_in_room(session_id)
    return status


@router.post("/{session_id}/dispatch-agent")
async def dispatch_agent(
    session_id: str,
    user: User = Depends(get_current_user),
) -> dict:
    """Explicitly dispatch the AI agent to join a session's LiveKit room.

    Removes any existing agent from the room first to prevent duplicates.
    """
    settings = get_settings()
    room_name = f"session-{session_id}"
    lk_url = settings.livekit_url.replace("ws://", "http://").replace("wss://", "https://")

    try:
        async with api.LiveKitAPI(lk_url, settings.livekit_api_key, settings.livekit_api_secret) as lk:
            await force_remove_agents(lk, room_name)
            dispatch = await lk.agent_dispatch.create_dispatch(
                api.CreateAgentDispatchRequest(room=room_name, agent_name=settings.agent_name)
            )
            return {"dispatched": True, "dispatch_id": dispatch.id}
    except Exception as e:
        logger.warning("Failed to dispatch agent: %s", e)
        raise HTTPException(status_code=503, detail=f"Failed to dispatch agent: {e}")


@router.post("/{session_id}/detach-agent", response_model=DetachAgentResponse)
async def detach_agent(
    session_id: str,
    body: DetachAgentRequest | None = None,
    user: User = Depends(get_current_user),
) -> DetachAgentResponse:
    """Gracefully detach the AI agent from a session's LiveKit room.

    Humans stay connected. The agent says goodbye and disconnects on its own;
    if it doesn't leave within the grace period, it is force-removed.
    """
    say_goodbye = body.say_goodbye if body else True
    try:
        return await detach_agent_flow(session_id, say_goodbye)
    except Exception as e:
        logger.warning("Failed to detach agent: %s", e)
        raise HTTPException(status_code=503, detail=f"Failed to detach agent: {e}")


@router.get("/deepgram-token")
async def get_deepgram_token(
    user: User = Depends(get_current_user),
) -> dict:
    """Return Deepgram API key for browser-side real-time transcription."""
    settings = get_settings()
    if not settings.deepgram_api_key:
        raise HTTPException(status_code=503, detail="Deepgram not configured")
    # For now, return the key directly. In production, use Deepgram's
    # temporary key API: POST /v1/projects/{project_id}/keys
    return {"key": settings.deepgram_api_key}
