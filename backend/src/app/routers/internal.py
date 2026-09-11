"""Internal API routes — only callable by trusted services (e.g. the LiveKit agent).

All routes require the X-Internal-Secret header to match INTERNAL_API_SECRET.
No JWT auth — these are service-to-service calls within the same Railway project.
"""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models.session import ChatMessage, Session
from ..schemas.session import ChatMessageResponse

router = APIRouter(prefix="/api/internal", tags=["internal"])
logger = logging.getLogger(__name__)


def _verify_secret(x_internal_secret: str = Header(...)) -> None:
    settings = get_settings()
    if x_internal_secret != settings.internal_api_secret:
        raise HTTPException(status_code=403, detail="Invalid internal secret")


class EnhanceTranscriptRequest(BaseModel):
    text: str
    session_topic: str | None = None
    speaker_name: str | None = None
    vocabulary_hints: list[str] = []


class EnhanceTranscriptResponse(BaseModel):
    enhanced_text: str
    raw_text: str
    was_enhanced: bool


class InternalMessageCreate(BaseModel):
    session_id: str
    content: str
    message_type: str = "chat"  # "chat" for participant speech, "ai" for agent response
    speaker_name: str | None = None
    original_content: str | None = None  # raw ASR text before LLM enhancement
    is_enhanced: bool = False
    # W3.2.4 — optional AI-response metadata that the frontend renders in a
    # "reasoning peek" popover. None of these are persisted as columns; the
    # router stuffs them into the existing `attachments` JSON under `_ai_meta`.
    model: str | None = None
    latency_ms: int | None = None
    reason: str | None = None


class AgentStatusUpdate(BaseModel):
    session_id: str
    status: str  # "connected", "disconnected", "extracting", "detaching", "detached", "error", "tts_error"


@router.post("/enhance-transcript", response_model=EnhanceTranscriptResponse)
async def enhance_transcript_endpoint(
    body: EnhanceTranscriptRequest,
    _: None = Depends(_verify_secret),
) -> EnhanceTranscriptResponse:
    """Enhance a raw transcript via LLM post-processing. Used by the LiveKit agent."""
    from ..services.transcript_enhancer import TranscriptContext, enhance_transcript

    ctx = TranscriptContext(
        session_topic=body.session_topic,
        speaker_name=body.speaker_name,
        vocabulary_hints=body.vocabulary_hints,
    )
    result = await enhance_transcript(body.text, context=ctx)
    return EnhanceTranscriptResponse(
        enhanced_text=result.enhanced_text,
        raw_text=result.raw_text,
        was_enhanced=result.was_enhanced,
    )


@router.post("/messages", status_code=201, response_model=ChatMessageResponse)
async def create_internal_message(
    body: InternalMessageCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> ChatMessage:
    """Persist a message from the voice agent — no JWT required."""
    # Verify session exists
    result = await db.execute(select(Session).where(Session.id == body.session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Pack optional AI-response metadata into the attachments JSON so the
    # frontend can render the W3.2.4 reasoning peek without a schema change.
    attachments: list[dict] | None = None
    if body.model or body.latency_ms is not None or body.reason:
        attachments = [
            {
                "_ai_meta": {
                    "model": body.model,
                    "latency_ms": body.latency_ms,
                    "reason": body.reason,
                }
            }
        ]

    msg = ChatMessage(
        session_id=body.session_id,
        user_id=None,
        content=body.content,
        original_content=body.original_content,
        is_enhanced=body.is_enhanced,
        message_type=body.message_type,
        speaker_name=body.speaker_name,
        attachments=attachments,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    logger.info(
        "Internal message saved: session=%s type=%s speaker=%s",
        body.session_id,
        body.message_type,
        body.speaker_name,
    )

    # Dual-write to session event log
    try:
        from ..services.event_writer import write_message_event

        await write_message_event(
            session_id=body.session_id,
            content=body.content,
            message_type=body.message_type,
            speaker_name=body.speaker_name,
            source="voice",
            db=db,
            message_id=msg.id,
        )
    except Exception:
        logger.warning("Failed to write session event for voice message %s", msg.id, exc_info=True)

    # Broadcast via WebSocket so voice messages appear in real-time on the Notes tab
    from ..ws.manager import manager

    await manager.broadcast(
        body.session_id,
        {
            "type": "chat_message",
            "payload": {
                "id": msg.id,
                "content": msg.content,
                "message_type": msg.message_type,
                "user_id": None,
                "speaker_name": msg.speaker_name,
                "created_at": msg.created_at.isoformat() if msg.created_at else "",
                "attachments": msg.attachments,
            },
        },
    )

    # Trigger debounced passive blueprint extraction. Passive listening
    # transcripts (Deepgram → POST /api/internal/messages) used to never
    # reach the extraction layer because that lived inside the LiveKit
    # agent worker; this fires the same Claude Haiku extraction prompt
    # in-process so AI Suggestions populate without an explicit agent
    # dispatch. Voice-AI replies are included so dialogue context is
    # preserved when the agent IS dispatched.
    if body.message_type in ("voice_chat", "voice_ai"):
        try:
            from ..db import get_session_factory
            from ..services.passive_extraction import schedule_extraction

            schedule_extraction(body.session_id, get_session_factory())
        except Exception:
            logger.warning(
                "Failed to schedule passive extraction for session %s",
                body.session_id,
                exc_info=True,
            )

    return msg


@router.post("/agent-status")
async def update_agent_status(
    body: AgentStatusUpdate,
    _: None = Depends(_verify_secret),
) -> dict:
    """Receive agent status updates and broadcast to session WebSocket clients."""
    from ..ws.manager import manager

    logger.info("Agent status update: session=%s status=%s", body.session_id, body.status)
    await manager.broadcast(
        body.session_id,
        {"type": "agent_status", "payload": {"status": body.status, "session_id": body.session_id}},
    )
    return {"ok": True}


class AgentIntent(BaseModel):
    session_id: str
    # Short imperative — e.g. "ask about scope", "summarize and move on", or
    # an empty string to clear a previously-broadcast intent.
    intent: str
    # Estimated ms until the agent acts on the intent. The frontend uses this
    # for the cancel countdown. None = indeterminate.
    eta_ms: int | None = None


@router.post("/agent-intent")
async def broadcast_agent_intent(
    body: AgentIntent,
    _: None = Depends(_verify_secret),
) -> dict:
    """W3.2.5 — Receive a short "I plan to do X next" hint from the agent and
    broadcast it to session WebSocket clients. The frontend renders a
    preview strip + cancel button that posts a "skip this" hint back via
    the existing chat send pipeline.
    """
    from ..ws.manager import manager

    await manager.broadcast(
        body.session_id,
        {
            "type": "agent_intent",
            "payload": {
                "intent": body.intent,
                "eta_ms": body.eta_ms,
                "session_id": body.session_id,
            },
        },
    )
    logger.info("Agent intent broadcast: session=%s intent=%r", body.session_id, body.intent)
    return {"ok": True}


class PersonaSuggestion(BaseModel):
    session_id: str
    persona: str  # slug e.g. "pm"
    label: str  # display name e.g. "Product Manager"
    reason: str  # e.g. "to cover Users & Personas, Goals & Constraints"


@router.post("/suggest-persona")
async def suggest_persona(
    body: PersonaSuggestion,
    _: None = Depends(_verify_secret),
) -> dict:
    """Broadcast a persona switch suggestion to session WebSocket clients."""
    from ..ws.manager import manager

    logger.info("Persona suggestion: session=%s persona=%s", body.session_id, body.persona)
    await manager.broadcast(
        body.session_id,
        {
            "type": "suggest_persona",
            "payload": {
                "persona": body.persona,
                "label": body.label,
                "reason": body.reason,
            },
        },
    )
    return {"ok": True}


class DispatchAgentRequest(BaseModel):
    session_id: str


@router.post("/dispatch-agent")
async def dispatch_agent_internal(
    body: DispatchAgentRequest,
    _: None = Depends(_verify_secret),
) -> dict:
    """Dispatch the AI agent to a LiveKit room via internal API."""
    from livekit import api as lk_api

    from ..config import get_settings
    from ..services.livekit_service import force_remove_agents

    settings = get_settings()
    room_name = f"session-{body.session_id}"
    lk_url = settings.livekit_url.replace("ws://", "http://").replace("wss://", "https://")

    try:
        async with lk_api.LiveKitAPI(lk_url, settings.livekit_api_key, settings.livekit_api_secret) as lk:
            await force_remove_agents(lk, room_name)
            dispatch = await lk.agent_dispatch.create_dispatch(
                lk_api.CreateAgentDispatchRequest(room=room_name, agent_name=settings.agent_name)
            )
            logger.info("Agent dispatched: session=%s dispatch_id=%s", body.session_id, dispatch.id)
            return {"dispatched": True, "dispatch_id": dispatch.id}
    except Exception as e:
        logger.warning("Failed to dispatch agent: %s", e)
        raise HTTPException(status_code=503, detail=f"Failed to dispatch agent: {e}")


class DetachAgentRequestInternal(BaseModel):
    session_id: str
    say_goodbye: bool = True


@router.post("/detach-agent")
async def detach_agent_internal(
    body: DetachAgentRequestInternal,
    _: None = Depends(_verify_secret),
) -> dict:
    """Gracefully detach the AI agent via internal API.

    Mirror of the public route — used by the Next.js proxy. See
    `services.livekit_service.detach_agent_flow` for the actual logic.
    """
    from ..services.livekit_service import detach_agent_flow

    try:
        response = await detach_agent_flow(body.session_id, body.say_goodbye)
    except Exception as e:
        logger.warning("Failed to detach agent: %s", e)
        raise HTTPException(status_code=503, detail=f"Failed to detach agent: {e}")
    return response.model_dump()


@router.get("/sessions/{session_id}/ai-config")
async def get_session_ai_config(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> dict:
    """Return the session's ai_config merged with resolved voice settings + avatar."""
    from ..models.blueprint_template import BlueprintPersona
    from ..models.video_avatar import VideoAvatar
    from ..services.voice_config_service import resolve_voice_config

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    ai_config = dict(session.ai_config or {})
    persona_slug = ai_config.get("persona", "default")
    # Per-persona session override (set in-call via the Settings drawer). Each
    # persona has its own slot so switching personas mid-call doesn't leak the
    # override across personas. MUST be honoured by both the voice resolver
    # AND the avatar payload below — otherwise voice and face drift apart.
    overrides = ai_config.get("video_avatar_overrides") or {}
    session_override_id = overrides.get(persona_slug) if isinstance(overrides, dict) else None

    # Resolve voice settings: org defaults > effective character > hardcoded.
    # `override_video_avatar_id` makes the resolver use the session-overridden
    # character's voice rather than always falling back to the persona's
    # studio-level default.
    voice_config = await resolve_voice_config(
        session.org_id,
        persona_slug,
        db,
        override_video_avatar_id=session_override_id,
    )
    logger.info(
        "Resolved voice config session=%s org=%s persona=%s override_avatar=%s "
        "voice_id=%s language=%s emotion=%s speed=%s",
        session_id,
        session.org_id,
        persona_slug,
        session_override_id,
        voice_config.get("voice_id"),
        voice_config.get("language"),
        voice_config.get("emotion"),
        voice_config.get("speed"),
    )
    # Merge: voice config values override any stale session ai_config values
    ai_config.update(voice_config)

    # Avatar payload uses the same effective-character precedence as voice
    # resolution above so the two can never drift to different characters.
    persona_result = await db.execute(
        select(BlueprintPersona).where(
            BlueprintPersona.org_id == session.org_id,
            BlueprintPersona.slug == persona_slug,
            BlueprintPersona.deleted_at.is_(None),
        )
    )
    persona = persona_result.scalar_one_or_none()
    effective_avatar_id = session_override_id or (persona.video_avatar_id if persona else None)

    avatar_payload: dict | None = None
    if effective_avatar_id:
        avatar_result = await db.execute(
            select(VideoAvatar).where(
                VideoAvatar.id == effective_avatar_id,
                VideoAvatar.deleted_at.is_(None),
            )
        )
        avatar = avatar_result.scalar_one_or_none()
        if avatar:
            avatar_payload = {
                "id": avatar.id,
                "provider": avatar.provider,
                "replica_id": avatar.replica_id,
                "tavus_persona_id": avatar.tavus_persona_id,
                "preview_url": avatar.preview_url,
            }
    ai_config["video_avatar"] = avatar_payload
    ai_config.setdefault("agent_camera_off", False)

    return ai_config


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def get_session_messages(
    session_id: str,
    limit: int = 200,
    before: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> list[ChatMessage]:
    """Fetch message history for context loading on agent restart.

    Paginated so a session with thousands of messages doesn't OOM the agent
    on boot. Returns the most recent ``limit`` messages in chronological
    order. Pass ``before`` (a message id) to load older messages.
    """
    limit = max(1, min(limit, 500))
    stmt = select(ChatMessage).where(ChatMessage.session_id == session_id)
    if before:
        cutoff = await db.execute(select(ChatMessage.created_at).where(ChatMessage.id == before))
        cutoff_at = cutoff.scalar_one_or_none()
        if cutoff_at is not None:
            stmt = stmt.where(ChatMessage.created_at < cutoff_at)
    stmt = stmt.order_by(ChatMessage.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    rows.reverse()  # ascending chronological order
    return rows


@router.get("/sessions/{session_id}/blueprint")
async def get_session_blueprint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> dict:
    """Return the current blueprint content for this session's project."""
    from ..services.blueprint_service import get_or_create_blueprint

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    bp = await get_or_create_blueprint(session.id, db)
    return {"content": bp.content, "version_number": bp.version_number}


@router.get("/sessions/{session_id}/coverage")
async def get_session_coverage(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> dict:
    """Return coverage scores for the agent's spoken radar.

    This is the SAME function the frontend uses (``facilitator.assess_coverage``)
    so the agent's percentages and gap list match exactly what the user sees in
    the UI. Filtered by the iteration's template sections when applicable, so a
    "small_win" iteration doesn't get scored against all 13 sections.
    """
    from ..services.blueprint_service import get_active_iteration, get_or_create_blueprint
    from ..services.blueprint_template_service import get_template_sections
    from ..services.facilitator import assess_coverage

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    bp = await get_or_create_blueprint(session.id, db)

    sections_filter: list[str] | None = None
    iteration = await get_active_iteration(session.id, db)
    if iteration and iteration.iteration_type:
        org = iteration.org_id
        sections_filter = await get_template_sections(org, iteration.iteration_type, db)

    cov = assess_coverage(bp.content, sections_filter=sections_filter)
    return {
        "scores": cov["scores"],
        "overall": cov["overall"],
        "grade": cov["grade"],
        "gaps": cov["gaps"],
        "sections": list(cov["scores"].keys()),
        "version_number": bp.version_number,
    }


class InternalBlueprintUpdate(BaseModel):
    section: str
    content: str
    # "merge" = union with prior bullets (default for the agent so a partial
    # extraction never overwrites prior content). "replace" = exact set, used
    # if the agent ever needs to rewrite a section wholesale.
    mode: str = "merge"
    # Optimistic concurrency: the version the agent based its extraction on.
    # If the live blueprint has moved past this, backend returns 409 and the
    # agent re-fetches and re-merges.
    expected_version: int | None = None


@router.patch("/sessions/{session_id}/blueprint")
async def update_blueprint_from_agent(
    session_id: str,
    body: InternalBlueprintUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> dict:
    """Let the agent update a blueprint section based on conversation insights."""
    from ..schemas.blueprint import BLUEPRINT_SECTIONS
    from ..services.blueprint_service import ConcurrentBlueprintUpdate, update_section

    if body.section not in BLUEPRINT_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {body.section}")
    if body.mode not in ("merge", "replace"):
        raise HTTPException(status_code=400, detail=f"Invalid mode: {body.mode}")

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        bp = await update_section(
            session.id,
            body.section,
            body.content,
            "ai-agent",
            db,
            mode=body.mode,
            expected_version=body.expected_version,
        )
    except ConcurrentBlueprintUpdate as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    # In merge mode, the stored content is the union (not what the agent
    # sent). Use the actual stored content for downstream consumers so the
    # session event log and WebSocket clients see the same thing the DB has.
    stored_content = bp.content.get(body.section, "")

    # Dual-write to session event log
    try:
        from ..services.event_writer import write_blueprint_event

        await write_blueprint_event(
            session_id=session_id,
            section=body.section,
            content=stored_content,
            db=db,
        )
    except Exception:
        logger.warning("Failed to write blueprint event for session %s", session_id, exc_info=True)

    # Broadcast blueprint update to session WebSocket clients
    from ..ws.manager import manager

    await manager.broadcast(
        session_id,
        {
            "type": "blueprint_update",
            "payload": {
                "section": body.section,
                "content": stored_content,
                "version": bp.version_number,
            },
        },
    )

    return {
        "version_number": bp.version_number,
        "section": body.section,
        "content": stored_content,
    }


class InternalSuggestionCreate(BaseModel):
    section: str
    content: str
    source_message_ids: list[str] | None = None
    # When the LLM detects the new fact contradicts/updates an existing
    # bullet in this section, it captures the old bullet's text here.
    # Surfaced in the suggestions UI; powers the 'replace' accept mode.
    supersedes_bullet: str | None = None


@router.post("/sessions/{session_id}/blueprint-suggestions", status_code=201)
async def create_blueprint_suggestion_from_agent(
    session_id: str,
    body: InternalSuggestionCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> dict:
    """Create a pending blueprint suggestion from the agent.

    This replaces the agent's old direct PATCH to the blueprint — extractions
    now go to a review queue instead of mutating the live blueprint. The user
    accepts/edits/rejects from the SuggestionsDrawer.
    """
    from ..schemas.blueprint import BLUEPRINT_SECTIONS
    from ..services.blueprint_service import create_suggestion

    if body.section not in BLUEPRINT_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {body.section}")

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    suggestion = await create_suggestion(
        session.id,
        body.section,
        body.content,
        db,
        source_message_ids=body.source_message_ids,
        supersedes_bullet=body.supersedes_bullet,
    )

    # Broadcast so the frontend's SuggestionsDrawer updates live
    from ..ws.manager import manager

    await manager.broadcast(
        session_id,
        {
            "type": "suggestion_added",
            "payload": {
                "id": suggestion.id,
                "session_id": suggestion.session_id,
                "section": suggestion.section,
                "content": suggestion.content,
                "status": suggestion.status,
                "supersedes_bullet": suggestion.supersedes_bullet,
                "created_at": suggestion.created_at.isoformat() if suggestion.created_at else "",
            },
        },
    )

    return {"id": suggestion.id, "status": suggestion.status}


@router.get("/sessions/{session_id}/vocabulary")
async def get_session_vocabulary(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> dict:
    """Return vocabulary keywords for the session's org. Used by the LiveKit agent for Deepgram STT."""
    from ..services.vocabulary_service import get_vocabulary_for_transcription

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    vocabulary = await get_vocabulary_for_transcription(session.org_id, None, db)
    return {
        "keywords": vocabulary.to_deepgram_keywords(),
        "prompt": vocabulary.to_whisper_prompt(),
    }


class AgentRuntimeStateUpdate(BaseModel):
    state: dict


@router.get("/sessions/{session_id}/agent-state")
async def get_agent_runtime_state(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> dict:
    """Return the persisted runtime state so the agent can rehydrate after a
    worker restart (speaker diarization, used personas, last-extracted-idx)."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"state": session.agent_runtime_state or {}}


@router.patch("/sessions/{session_id}/agent-state")
async def update_agent_runtime_state(
    session_id: str,
    body: AgentRuntimeStateUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_secret),
) -> dict:
    """Checkpoint the voice agent's in-memory runtime state."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.agent_runtime_state = body.state
    await db.commit()
    return {"ok": True}


@router.websocket("/ws/sessions/{session_id}/events")
async def internal_session_events_ws(
    websocket: WebSocket,
    session_id: str,
    secret: str = Query(...),
) -> None:
    """Push session events (blueprint_update, etc.) to internal subscribers.

    Used by the LiveKit agent so it sees user manual blueprint edits in real
    time and can refresh its system prompt — instead of narrating stale
    content until the next agent extraction. Authenticated via the
    X-Internal-Secret value passed as a query param (browser WS clients
    can't set custom headers).
    """
    settings = get_settings()
    if secret != settings.internal_api_secret:
        await websocket.close(code=4003, reason="Invalid internal secret")
        return

    from ..ws.manager import manager

    await manager.connect_internal_watcher(session_id, websocket)
    try:
        while True:
            # Internal watchers don't send anything; they just receive.
            # `receive_text` is here only to detect client disconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_internal_watcher(session_id, websocket)
