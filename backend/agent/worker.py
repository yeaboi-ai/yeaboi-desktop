"""LiveKit Voice Agent — joins planning session rooms as an AI facilitator.

Listens via Deepgram STT → processes with Claude → responds via ElevenLabs TTS.
Runs as a separate process: uv run python -m agent.worker start

Required env vars:
  LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
  ANTHROPIC_API_KEY
  DEEPGRAM_API_KEY
  ELEVENLABS_API_KEY
  BACKEND_URL      — URL of the backend service (e.g. https://your-backend.up.railway.app)
  INTERNAL_API_SECRET — shared secret matching the backend's INTERNAL_API_SECRET
"""

import asyncio
import json
import logging
import os
import re
import time
from collections import deque
from dataclasses import dataclass, field

import httpx
import sentry_sdk
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    ConversationItemAddedEvent,
    JobContext,
    StopResponse,
    UserInputTranscribedEvent,
    WorkerOptions,
    cli,
)
from livekit.agents.llm import ImageContent
from livekit.agents.voice.room_io import RoomOptions
from livekit.plugins import anthropic, deepgram, elevenlabs, silero

try:
    from livekit.plugins import cartesia as cartesia_plugin

    HAS_CARTESIA = bool(os.getenv("CARTESIA_API_KEY"))
except ImportError:
    HAS_CARTESIA = False

try:
    from livekit.plugins import google as google_plugin

    HAS_GOOGLE_STT = bool(os.getenv("GOOGLE_API_KEY"))
except ImportError:
    google_plugin = None  # type: ignore[assignment]
    HAS_GOOGLE_STT = False

try:
    from livekit.plugins import tavus as tavus_plugin

    HAS_TAVUS = bool(os.getenv("TAVUS_API_KEY"))
except ImportError:
    tavus_plugin = None  # type: ignore[assignment]
    HAS_TAVUS = False

load_dotenv("../.env")

# Unify ElevenLabs key — the LiveKit plugin expects ELEVEN_API_KEY
if os.getenv("ELEVENLABS_API_KEY") and not os.getenv("ELEVEN_API_KEY"):
    os.environ["ELEVEN_API_KEY"] = os.environ["ELEVENLABS_API_KEY"]
logger = logging.getLogger("planning-agent")
logger.setLevel(logging.INFO)

_HEADER_RE = re.compile(r"^#{1,6}\s+", flags=re.MULTILINE)
_NUMLIST_RE = re.compile(r"^\d+\.\s+", flags=re.MULTILINE)
_BULLET_RE = re.compile(r"^[-*]\s+", flags=re.MULTILINE)


def strip_markdown(text: str) -> str:
    """Strip markdown formatting. Safe to call on streaming chunks because it operates
    per-character on emphasis/code markers rather than matching paired regions."""
    if not text:
        return text
    text = text.replace("**", "").replace("__", "")
    text = text.replace("*", "").replace("_", "").replace("`", "")
    text = _HEADER_RE.sub("", text)
    text = _NUMLIST_RE.sub("", text)
    text = _BULLET_RE.sub("", text)
    text = text.replace("\n\n", ". ").replace("\n", " ")
    return text


class FacilitatorAgent(Agent):
    """Agent variant that strips markdown from both the spoken (TTS) and transcribed
    text streams so what's heard matches what's shown in the live transcript.

    Also gates whether the LLM is invoked at all on each user turn, based on the
    `involvement` mode in the session's ai_config. This is the "be more or less
    involved" mechanism — see ``on_user_turn_completed`` below.
    """

    def __init__(
        self,
        *args,
        involvement_state: "InvolvementState | None" = None,
        screen_vision_state: "ScreenVisionState | None" = None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        # The worker owns this state; we hold a reference so the gate sees live mutations.
        self._involvement_state: InvolvementState = involvement_state or InvolvementState()
        # Latest screen-share frame + pointer (None when screen vision is off/idle).
        self._screen_vision_state: ScreenVisionState = screen_vision_state or ScreenVisionState()

    async def transcription_node(self, text, model_settings):
        async for chunk in text:
            if isinstance(chunk, str):
                stripped = strip_markdown(chunk)
                if stripped:
                    yield stripped
            else:
                yield chunk

    async def tts_node(self, text, model_settings):
        async def _stripped():
            async for chunk in text:
                if isinstance(chunk, str):
                    stripped = strip_markdown(chunk)
                    if stripped:
                        yield stripped
                else:
                    yield chunk

        async for frame in Agent.default.tts_node(self, _stripped(), model_settings):
            yield frame

    async def on_user_turn_completed(self, turn_ctx, new_message):
        """Gate whether to actually generate a reply for this turn.

        Raising ``StopResponse`` cleanly skips LLM generation while still
        keeping the transcript in chat context — the LiveKit-supported way
        to suppress an auto-reply (livekit-agents 1.x).
        """
        cfg = self._involvement_state
        cfg.last_user_turn_end = time.time()

        text = ""
        try:
            text = (new_message.text_content or "") if new_message is not None else ""
        except Exception:
            text = ""

        decision = should_respond(text, cfg)
        cfg.last_decision = decision
        if decision == "allow":
            # Attach the current screen-share frame ONLY on the allow path, so
            # suppressed/observer turns spend zero vision tokens.
            self._maybe_attach_screen(new_message)
            return
        logger.info("Involvement gate: suppress turn (mode=%s, reason=%s)", cfg.mode, decision)
        raise StopResponse

    def _maybe_attach_screen(self, new_message) -> None:
        """Attach the latest screen-share frame to this turn, with any pen
        strokes the user drew composited on top.

        No-op unless screen vision is enabled and a fresh frame exists. Keeps
        only the latest frame — never a history — and downsamples for cost.
        """
        sv = self._screen_vision_state  # never None — __init__ defaults it
        if not sv.enabled:
            return
        frame = sv.latest_frame
        if frame is None:
            return
        if sv.frame_ts and (time.time() - sv.frame_ts) > SCREEN_FRAME_MAX_AGE:
            return  # stale screenshot — share likely stopped; don't show it
        if new_message is None or not hasattr(new_message, "content"):
            return
        try:
            strokes = _recent_annotations(sv.annotations)
            annotated = _render_annotated_frame(frame, strokes, SCREEN_INFERENCE_LONG_EDGE) if strokes else None
            if annotated:
                new_message.content.append(ImageContent(image=annotated))
                new_message.content.append(
                    "The user has drawn on the shared screen (the red marks) to point something out — "
                    "focus on what they highlighted."
                )
            else:
                new_message.content.append(
                    ImageContent(
                        image=frame,
                        inference_width=SCREEN_INFERENCE_LONG_EDGE,
                        inference_height=SCREEN_INFERENCE_LONG_EDGE,
                    )
                )
            logger.info(
                "Screen vision: attached frame to turn (presenter=%s, annotations=%d)",
                sv.presenter_identity,
                len(strokes),
            )
        except Exception:
            logger.exception("Screen vision: failed to attach frame (presenter=%s)", sv.presenter_identity)


def should_respond(text: str, cfg: "InvolvementState") -> str:
    """Pure decision function: returns 'allow' or a suppression reason.

    Extracted as a standalone function so it can be unit-tested without
    spinning up LiveKit. Reasons returned: 'paused', 'observer',
    'not_addressed', 'addresses_other'. A 'force_next_reply' flag bypasses
    every gate (used by /ask and the 'Ask Agent' button).
    """
    # Hard pause beats every mode, including direct address.
    if cfg.paused_until and time.time() < cfg.paused_until:
        return "paused"

    # One-shot summon — bypasses gate, consumed once.
    if cfg.force_next_reply:
        cfg.force_next_reply = False
        return "allow"

    mode = cfg.mode if cfg.mode in INVOLVEMENT_VALID else INVOLVEMENT_DEFAULT

    if mode == "driver":
        return "allow"
    if mode == "observer":
        # Observer never auto-replies — only force_next_reply gets through.
        return "observer"

    addressed = _is_addressed(text, cfg.participants, cfg.persona_label)
    multi = len(cfg.participants) > 1

    if mode == "responsive":
        # Strict: only respond when the agent is the explicit target.
        return "allow" if addressed else "not_addressed"

    # facilitator (default): respond unless this utterance is clearly directed
    # at another human. In a 1-on-1 call, fall back to current behavior.
    if not multi:
        return "allow"
    if addressed:
        return "allow"
    if _addresses_other_participant(text, cfg.participants):
        return "addresses_other"
    # Multi-participant declarative statement with no question — stay out of cross-talk.
    if not text.rstrip().endswith("?"):
        return "addresses_other"
    return "allow"


BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
INTERNAL_SECRET = os.getenv("INTERNAL_API_SECRET", "change-me-in-production")


def _backend_ws_url() -> str:
    """Derive the WebSocket URL from BACKEND_URL (http→ws, https→wss)."""
    if BACKEND_URL.startswith("https://"):
        return "wss://" + BACKEND_URL[len("https://"):]
    if BACKEND_URL.startswith("http://"):
        return "ws://" + BACKEND_URL[len("http://"):]
    return BACKEND_URL


BACKEND_WS_URL = _backend_ws_url()
PERSONAPLEX_ENABLED = os.getenv("PERSONAPLEX_ENABLED", "false").lower() == "true"

# ── Screen vision ─────────────────────────────────────────────────────
# When the user shares their screen, the agent subscribes to that video
# track, keeps ONLY the latest frame, and attaches it (downsampled) to the
# user's turn so Claude can "see" what's on screen. Gated by the involvement
# logic (no vision tokens on suppressed turns) and this kill-switch.
SCREEN_VISION_ENABLED = os.getenv("SCREEN_VISION_ENABLED", "true").lower() == "true"
# Long edge (px) the screen frame is downsampled to before sending to Claude.
# ~768px keeps UI text legible at ~450 image tokens/turn on Haiku 4.5.
try:
    SCREEN_INFERENCE_LONG_EDGE = int(os.getenv("SCREEN_INFERENCE_LONG_EDGE", "768"))
except ValueError:
    logger.warning("Invalid SCREEN_INFERENCE_LONG_EDGE (must be an int) — falling back to 768")
    SCREEN_INFERENCE_LONG_EDGE = 768
# Cap on points per drawn stroke — bounds the work a crafted screen_draw packet
# can push into PIL.draw.line().
SCREEN_MAX_STROKE_POINTS = 2000
# Drop a frame older than this (secs) — guards against a stale screenshot
# lingering if stop-share teardown races the next turn.
SCREEN_FRAME_MAX_AGE = 10.0
# Keep pen-drawn annotations this long (secs) before they're pruned. Slightly
# longer than the frontend fade (~4s) so a stroke drawn just before the user
# speaks still lands on the frame the agent sends to Claude.
SCREEN_ANNOTATION_MAX_AGE = 6.0

# Blueprint sections — matches chat agent's 13 sections
BLUEPRINT_FLOW = [
    ("project_overview", "Project Overview", "What are you building? What problem does it solve?"),
    ("goals_constraints", "Goals & Constraints", "Key goals? Constraints — budget, timeline, team size, compliance?"),
    ("users_personas", "Users & Personas", "Who will use this? Key needs and pain points?"),
    ("team_capacity", "Team & Capacity", "How many developers? Sprint length? Velocity?"),
    ("architecture", "Architecture", "High-level system design — frontend, backend, services, data flow."),
    ("tech_stack", "Tech Stack", "Languages, frameworks, databases, and tools?"),
    ("api_integrations", "API & Integrations", "Third-party APIs, payment providers, auth services?"),
    ("ui_ux", "UI/UX", "Design direction — mobile-first? Dark mode? Key screens?"),
    ("security_compliance", "Security & Compliance", "Auth strategy, data privacy, encryption, regulatory needs?"),
    ("infrastructure", "Infrastructure", "Hosting, CI/CD, monitoring, deployment strategy?"),
    ("risks_unknowns", "Risks & Unknowns", "Blockers, technical risks, dependencies, unknowns?"),
    ("out_of_scope", "Out of Scope", "What's explicitly NOT included in this version?"),
    ("open_questions", "Open Questions", "Anything unresolved that needs more discussion?"),
]

SECTION_KEYS = [s[0] for s in BLUEPRINT_FLOW]
SECTION_LABELS = {s[0]: s[1] for s in BLUEPRINT_FLOW}

# NOTE: coverage scoring is now done server-side in
# `app/services/facilitator.py:assess_coverage` and fetched via
# GET /api/internal/sessions/{id}/coverage. The agent's previous local copy
# diverged from the backend (different keyword sets) so the user's UI showed
# one number while the agent narrated another. The single-source rule is what
# makes the agent's "we still need X" claims match what the user is reading.


PERSONA_PROMPTS = {
    "default": (
        "You are a sharp, opinionated senior engineer. "
        "You think in terms of systems, trade-offs, and implementation. "
        "Your PRIMARY focus areas are: Tech Stack, Architecture, Infrastructure, "
        "and API & Integrations. Steer the conversation toward these sections "
        "when they have gaps. You CAN answer questions about other areas but "
        "always return to your focus areas if they're incomplete."
    ),
    "pm": (
        "You are an experienced product manager. You think in terms of USERS, "
        "not technology. Your PRIMARY focus areas are: Project Overview, Goals & "
        "Constraints, Users & Personas, UI/UX, and Out of Scope. "
        "NEVER ask about tech stack, frameworks, databases, or "
        "infrastructure — that's engineering's job. Instead focus on: "
        "Who are the users and what problems do they have? "
        "What features matter most and why? What's the MVP? "
        "Timeline, budget, and go-to-market strategy. "
        "When the user mentions technical choices, acknowledge briefly but "
        "redirect to product questions."
    ),
    "architect": (
        "You are a system architect. You think in terms of components, "
        "boundaries, data flow, and scalability. Your PRIMARY focus areas are: "
        "Architecture, Tech Stack, API & Integrations, Infrastructure, and "
        "Security & Compliance. Focus on: "
        "System decomposition, data models and relationships, "
        "API design and integration patterns, security architecture, "
        "infrastructure and deployment topology, "
        "performance, scaling, and reliability trade-offs. "
        "Push for clear technical decisions."
    ),
    "mentor": (
        "You are a patient technical mentor. You cover ALL blueprint areas "
        "but at a teaching pace. You explain concepts clearly "
        "and ask teaching questions to help the team think through problems. "
        "When the user doesn't know something, explain it simply before "
        "asking them to decide. Use analogies. Be encouraging but thorough. "
        "Never assume knowledge — if they seem unsure, offer options with "
        "plain-English explanations of trade-offs."
    ),
    "challenger": (
        "You are a devil's advocate. Your PRIMARY focus areas are: Risks & "
        "Unknowns, Goals & Constraints, Out of Scope, and Security & Compliance. "
        "Question EVERY assumption. For every "
        "choice the user makes, ask why not the alternative. Push back on "
        "easy answers. Stress-test ideas until they're bulletproof. Be "
        "respectful but relentless."
    ),
}

PERSONA_FOCUS_SECTIONS: dict[str, list[str]] = {
    "default": ["tech_stack", "architecture", "infrastructure", "api_integrations"],
    "pm": ["project_overview", "goals_constraints", "users_personas", "ui_ux", "out_of_scope"],
    "architect": ["architecture", "tech_stack", "api_integrations", "infrastructure", "security_compliance"],
    "mentor": ["project_overview", "goals_constraints", "users_personas", "team_capacity", "open_questions"],
    "challenger": ["risks_unknowns", "goals_constraints", "out_of_scope", "security_compliance"],
}

PERSONA_LABELS = {
    "default": "Senior Engineer",
    "pm": "Product Manager",
    "architect": "System Architect",
    "mentor": "Patient Mentor",
    "challenger": "Devil's Advocate",
}

ASSERTIVENESS_PROMPTS = {
    "passive": "Only respond when directly asked a question. Do not interject or steer the conversation. Wait for the user to lead.",
    "balanced": "",
    "active": "Drive the conversation aggressively. Don't wait for the user to finish thoughts — jump in with recommendations. Challenge weak ideas directly. Keep the pace high.",
}

INVOLVEMENT_PROMPTS = {
    "observer": (
        "INVOLVEMENT: Observer mode. You are silently observing this conversation. "
        "Take notes, but do NOT speak unless someone explicitly summons you (button or /ask)."
    ),
    "responsive": (
        "INVOLVEMENT: Responsive mode. Speak ONLY when addressed — by name (\"agent\", \"AI\", "
        "your persona label) or with a direct question to the room that is NOT prefixed with "
        "another participant's name. Otherwise stay silent and let the humans drive."
    ),
    "facilitator": (
        "INVOLVEMENT: Facilitator mode. Speak when addressed, and at natural breaks in the "
        "conversation. Do NOT respond when participants are clearly addressing each other. "
        "Re-engage quiet participants by name when air-time is imbalanced."
    ),
    "driver": (
        "INVOLVEMENT: Driver mode. Push the agenda forward on every turn. Interject with "
        "recommendations and the next question. Address participants by name."
    ),
}
INVOLVEMENT_DEFAULT = "facilitator"
INVOLVEMENT_VALID = set(INVOLVEMENT_PROMPTS.keys())

# Wake-word / direct-address regex. \b ensures we don't trip on substrings.
WAKE_RE = re.compile(r"\b(agent|@ai|hey ai|ok ai|facilitator)\b", re.IGNORECASE)
# "AI" alone is matched separately with stricter rules to avoid false positives like "the AI is fine".
_AI_TOKEN_RE = re.compile(r"\b(ai)\b[,?]|^(ai)[,\s]|\bhey,?\s+ai\b", re.IGNORECASE)

# Facilitator silence-break threshold (seconds) — how long the room must be quiet before
# the agent will speak in facilitator mode without being directly addressed.
FACILITATOR_BREAK_SECONDS = 2.5


def _addresses_other_participant(text: str, participants: dict[str, str]) -> bool:
    """True if the utterance leads with another participant's first name (e.g. 'Bob, ...')."""
    stripped = text.strip()
    if not stripped:
        return False
    head = re.split(r"[,?\s]", stripped, maxsplit=1)[0].strip().lower()
    if not head:
        return False
    for name in participants.values():
        if not name:
            continue
        first = name.split()[0].lower() if name.split() else ""
        if first and head == first:
            return True
    return False


def _is_addressed(text: str, participants: dict[str, str], persona_label: str | None) -> bool:
    """Heuristic: was this utterance directed at the agent (vs. another participant)?

    Layered rules (cheap regex only, no LLM call):
    1. Wake words: 'agent', '@ai', 'hey ai', 'ok ai', 'facilitator'
    2. Persona label match (e.g. 'Senior Engineer')
    3. Loose 'AI' match constrained by punctuation/position to avoid false positives
    4. Question (?) that does NOT lead with another participant's first name
    """
    if not text:
        return False
    if WAKE_RE.search(text):
        return True
    if persona_label and persona_label.lower() in text.lower():
        return True
    if _AI_TOKEN_RE.search(text):
        return True
    if text.rstrip().endswith("?") and not _addresses_other_participant(text, participants):
        return True
    return False


def _parse_paused_until(value) -> float:
    """Coerce ai_config['paused_until'] (None, ISO string, or epoch seconds) to epoch float."""
    if not value:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        from datetime import datetime
        s = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.timestamp()
    except Exception:
        return 0.0


@dataclass
class InvolvementState:
    """Mutable shared state read by FacilitatorAgent.on_user_turn_completed.

    Owned by the worker scope; the agent reads (never writes) every turn.
    """
    mode: str = INVOLVEMENT_DEFAULT
    paused_until: float = 0.0  # epoch seconds; 0 means not paused
    participants: dict[str, str] = field(default_factory=dict)
    persona_label: str | None = None
    last_user_turn_end: float = 0.0
    force_next_reply: bool = False
    # last decision telemetry
    last_decision: str = ""


@dataclass
class ScreenVisionState:
    """Mutable shared state for screen-share vision, owned by the worker scope.

    The frame consumer task (``_consume_screen_frames``) writes ``latest_frame``;
    the data handler appends to ``annotations`` (pen strokes the user drew on the
    shared screen); the agent reads both in ``on_user_turn_completed`` and never
    writes. Only the LATEST frame is kept — no history — so per-turn token cost
    stays bounded.
    """
    enabled: bool = False
    latest_frame: "rtc.VideoFrame | None" = None
    frame_ts: float = 0.0  # epoch secs of last frame update
    presenter_identity: str | None = None  # who is sharing (single-presenter v1)
    # Pen-drawn strokes the user sketched on the shared screen. Each is
    # {"points": [{"x","y"}, ...], "ts": float}; normalized 0..1 coords.
    annotations: list = field(default_factory=list)

    def reset_share(self) -> None:
        """Clear all per-share state when a screen share ends (or the next
        presenter takes over). Single place to update so a new field can't be
        silently missed on teardown.
        """
        self.latest_frame = None
        self.frame_ts = 0.0
        self.presenter_identity = None
        self.annotations = []


def _screen_vision_enabled(ai_config: dict) -> bool:
    """Resolve whether screen vision is active for this session.

    Global env kill-switch wins; otherwise per-session ``ai_config.screen_vision``
    (default ON when the key is absent) decides — lets a privacy-sensitive call
    opt out without a redeploy.
    """
    if not SCREEN_VISION_ENABLED:
        return False
    val = (ai_config or {}).get("screen_vision")
    return True if val is None else bool(val)


def _recent_annotations(annotations: list, now: float | None = None) -> list:
    """Return strokes drawn within SCREEN_ANNOTATION_MAX_AGE seconds."""
    now = time.time() if now is None else now
    return [s for s in annotations if now - s.get("ts", 0.0) <= SCREEN_ANNOTATION_MAX_AGE]


def _render_annotated_frame(frame: "rtc.VideoFrame", strokes: list, long_edge: int) -> str | None:
    """Composite pen strokes onto the screen frame → a downsampled JPEG data URL.

    Returns a ``data:image/jpeg;base64,...`` URL suitable for ``ImageContent``,
    or None if compositing fails (caller falls back to the raw frame). PIL is
    imported lazily so a missing/broken install degrades to plain vision rather
    than crashing the agent.
    """
    try:
        import base64
        import io

        from PIL import Image, ImageDraw

        # Screen frames arrive as YUV (I420); convert to RGBA. Guard the
        # already-RGBA case — convert() rejects a same-format request.
        rgba = frame if frame.type == rtc.VideoBufferType.RGBA else frame.convert(rtc.VideoBufferType.RGBA)
        img = Image.frombytes("RGBA", (rgba.width, rgba.height), bytes(rgba.data)).convert("RGB")
        draw = ImageDraw.Draw(img)
        w, h = img.size
        color = (255, 64, 64)
        line_w = max(3, round(w * 0.005))
        dot_r = max(6, round(w * 0.012))
        for stroke in strokes:
            pts = [(p["x"] * w, p["y"] * h) for p in (stroke.get("points") or []) if "x" in p and "y" in p]
            if not pts:
                continue
            if len(pts) == 1:
                x, y = pts[0]
                draw.ellipse([x - dot_r, y - dot_r, x + dot_r, y + dot_r], outline=color, width=line_w)
            else:
                draw.line(pts, fill=color, width=line_w, joint="curve")
        img.thumbnail((long_edge, long_edge))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        logger.exception("Screen vision: failed to composite annotations")
        return None


async def _consume_screen_frames(track: "rtc.VideoTrack", state: "ScreenVisionState") -> None:
    """Drain a screen-share video track, keeping ONLY the latest frame.

    Does zero per-frame work beyond a reference swap — the JPEG/base64 encode
    happens lazily, once per answered turn, inside ImageContent serialization.
    That's what keeps a high-bitrate screen track cheap.
    """
    stream = rtc.VideoStream(track)
    try:
        async for event in stream:
            state.latest_frame = event.frame
            state.frame_ts = time.time()
    except asyncio.CancelledError:
        # Clean teardown (stop-share / detach / shutdown) — propagate.
        raise
    except Exception:
        # A real decode/SDK error: drop the now-orphaned frame so the agent
        # stops "seeing" a stale screenshot, and surface it above DEBUG.
        logger.warning("Screen frame consumer died on decode error", exc_info=True)
        state.latest_frame = None
        state.frame_ts = 0.0
    finally:
        try:
            await stream.aclose()
        except Exception:
            pass

# Map voice selector names to ElevenLabs voice IDs
# These are pre-made ElevenLabs voices that match the character of each name
VOICE_ID_MAP = {
    "alloy": "EXAVITQu4vr4xnSDxMaL",     # Sarah — warm, neutral female
    "ash": "pFZP5JQG7iQjIQuC4Bku",        # Lily — soft British female
    "ballad": "nPczCjzI2devNBz1zQrb",      # Brian — deep male narrator
    "coral": "FGY2WhTYpPnrIDTdsKH5",       # Laura — friendly female
    "echo": "IKne3meq5aSn9XLyUdCD",        # Charlie — Australian male
    "sage": "cjVigY5qzO86Huf0OWal",        # Eric — calm male
    "shimmer": "XB0fDUnXU5powFXDhCwa",     # Charlotte — elegant British female
    "verse": "bIHbv24MWmeRgasZH58o",       # Will — young American male
}
DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Sarah (alloy)

LANGUAGE_NAMES = {
    "en": "English", "ar": "Egyptian Arabic dialect (العامية المصرية)", "zh": "Chinese", "nl": "Dutch",
    "fr": "French", "de": "German", "hi": "Hindi", "it": "Italian",
    "ja": "Japanese", "ko": "Korean", "pl": "Polish", "pt": "Portuguese",
    "ru": "Russian", "es": "Spanish", "tr": "Turkish", "uk": "Ukrainian",
}


async def _handle_steering(
    event: dict,
    session,
    involvement_state: "InvolvementState",
    post_steer_note,
) -> None:
    """Dispatch a chip-sourced steering action into agent behavior.

    `post_steer_note(text)` is awaited to record the action in the transcript.
    Errors from livekit session calls are swallowed and logged so a misfire
    doesn't take the agent down — chips need to be best-effort.
    """
    action = event.get("type", "")
    if action == "interrupt":
        try:
            await session.interrupt(force=True)
        except Exception as e:
            logger.debug("session.interrupt failed (likely no active speech): %s", e)
        await post_steer_note("User interrupted the agent.")
    elif action == "wait":
        # Set the pause first so any concurrent generation paths (e.g. _consume_one_shot)
        # that check paused_until see the new value before we even attempt the interrupt.
        involvement_state.paused_until = time.time() + 15
        try:
            await session.interrupt(force=True)
        except Exception as e:
            logger.debug("session.interrupt failed during /wait: %s", e)
        await post_steer_note("User asked the agent to wait.")
    elif action == "dig":
        try:
            await session.interrupt(force=True)
        except Exception as e:
            logger.debug("session.interrupt failed during /dig: %s", e)
        involvement_state.force_next_reply = True
        try:
            session.generate_reply(
                user_input=(
                    "The user asked you to go deeper on the most recent topic. "
                    "Drop one more specific question or pull on the most concrete "
                    "thread from the last 60 seconds."
                ),
                allow_interruptions=True,
            )
        except Exception as e:
            logger.warning("session.generate_reply failed during /dig: %s", e)
            involvement_state.force_next_reply = False
        await post_steer_note("User asked to go deeper.")
    else:
        logger.debug("Unknown steering action: %s", action)


async def _handle_hand(
    event: dict,
    session,
    involvement_state: "InvolvementState",
) -> None:
    """Yield the floor when a participant raises their hand.

    Lowering the hand is a no-op verbally — the UI handles the visual update.
    If the agent is currently speaking, await the SpeechHandle so we don't cut
    off mid-sentence. Then acknowledge by name and pause for ~5s so the user
    can take the floor without the agent re-interrupting.
    """
    payload = event.get("payload") or {}
    if not bool(payload.get("raised")):
        return
    name = (payload.get("name") or "").strip() or "go ahead"
    speech = getattr(session, "current_speech", None)
    if speech is not None:
        try:
            done = speech.done() if callable(getattr(speech, "done", None)) else False
        except Exception:
            done = False
        if not done:
            try:
                await speech
            except Exception as e:
                logger.debug("Awaiting current_speech during hand-yield failed: %s", e)
    try:
        await session.say(f"Yes {name}, go ahead.", allow_interruptions=True)
    except Exception as e:
        logger.warning("Hand-yield say failed: %s", e)
    involvement_state.paused_until = time.time() + 5


REACTION_ACK_THROTTLE_SECONDS = 30


async def _handle_reaction(
    event: dict,
    recent_reactions: deque,
    participants: dict[str, str],
    session=None,
    involvement_state: "InvolvementState | None" = None,
    ack_state: dict | None = None,
) -> None:
    """Append the reaction to a bounded buffer and trigger a brief verbal ack.

    The buffer feeds the next system-prompt rebuild so the agent sees who's been
    reacting. To make reactions visibly land in the conversation, we ALSO fire
    a short LLM-generated acknowledgement — but throttled so a flurry of emojis
    doesn't make the agent chatty:

      * skip if another ack fired within ``REACTION_ACK_THROTTLE_SECONDS``
      * skip while the agent is currently speaking (don't self-interrupt)
      * skip while the agent is paused (e.g. user clicked /wait)

    ``session`` / ``involvement_state`` / ``ack_state`` are optional so existing
    tests that cover the buffer behavior in isolation keep working.
    """
    payload = event.get("payload") or {}
    emoji = payload.get("emoji")
    if not emoji:
        return
    sender_id = event.get("from") or ""
    from_name = participants.get(sender_id) or sender_id or "someone"
    now = time.time()
    recent_reactions.append({"emoji": emoji, "from_name": from_name, "ts": now})

    if session is None or involvement_state is None or ack_state is None:
        return

    # Throttle window — last ack was recent enough that another would feel chatty.
    last_ts = float(ack_state.get("last_ts", 0.0) or 0.0)
    if now - last_ts < REACTION_ACK_THROTTLE_SECONDS:
        return

    # Agent paused (e.g. /wait) — honor the silence window.
    if involvement_state.paused_until and now < involvement_state.paused_until:
        return

    # Don't self-interrupt mid-sentence to acknowledge an emoji.
    speech = getattr(session, "current_speech", None)
    if speech is not None:
        try:
            done = speech.done() if callable(getattr(speech, "done", None)) else False
        except Exception:
            done = False
        if not done:
            return

    ack_state["last_ts"] = now
    involvement_state.force_next_reply = True
    try:
        session.generate_reply(
            user_input=(
                f"{from_name} just reacted with {emoji}. Acknowledge briefly "
                "in one short sentence (no question), then continue facilitating."
            ),
            allow_interruptions=True,
        )
    except Exception as e:
        logger.warning("Reaction-ack generate_reply failed: %s", e)
        involvement_state.force_next_reply = False


def _filter_reactions_for_prompt(reactions: list[dict], now: float | None = None) -> list[tuple[str, str]]:
    """Pick up to 3 unique (emoji, sender_name) pairs from the recent-reactions buffer.

    Filters anything older than 120s, dedupes by (emoji, sender), iterates newest-first.
    Pure function so the prompt-building logic is testable without LiveKit context.
    """
    now = now if now is not None else time.time()
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str]] = []
    for entry in reversed(reactions):
        ts = entry.get("ts", 0)
        if now - ts > 120:
            continue
        key = (entry.get("emoji", ""), entry.get("from_name", ""))
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
        if len(out) >= 3:
            break
    return out


def build_system_prompt(
    blueprint: dict[str, str],
    history: list[dict],
    ai_config: dict | None = None,
    vocabulary_terms: list[str] | None = None,
    participants: dict[str, str] | None = None,
    speaking_stats: dict[str, dict] | None = None,
    coverage: dict | None = None,
    reactions: "deque | list | None" = None,
    runtime_state: dict | None = None,
    screen_vision: bool = False,
) -> str:
    """Build the full system prompt with blueprint state and conversation context.

    Aligned with the chat agent's facilitation logic: coverage scoring,
    persona focus thresholds (95%/80%), and persona switching directives.

    `participants` (identity → display name) and `speaking_stats`
    (display name → {messages, words}) feed the multi-participant ROOM block
    so the LLM knows who's in the call and how air-time is split.
    """
    ai_config = ai_config or {}
    participants = participants or {}
    speaking_stats = speaking_stats or {}

    persona = ai_config.get("persona", "default")
    assertiveness = ai_config.get("assertiveness", "balanced")
    involvement = ai_config.get("involvement", INVOLVEMENT_DEFAULT)
    if involvement not in INVOLVEMENT_VALID:
        involvement = INVOLVEMENT_DEFAULT
    language_code = ai_config.get("language", "en")
    persona_text = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["default"])
    assertiveness_text = ASSERTIVENESS_PROMPTS.get(assertiveness, "")
    assertiveness_block = f"\n{assertiveness_text}\n" if assertiveness_text else ""
    language_name = LANGUAGE_NAMES.get(language_code, language_code)
    language_block = (
        f"\nLANGUAGE: You MUST speak and respond entirely in {language_name}. "
        f"All your responses, questions, and confirmations must be in {language_name}.\n"
        if language_code != "en" else ""
    )

    # Map emotion to speaking style instruction
    emotion = ai_config.get("emotion", "neutral")
    emotion_instructions = {
        "happy": (
            "\nSPEAKING TONE: Be upbeat, enthusiastic, and encouraging. "
            "Use positive language, show excitement about their ideas, "
            "and celebrate progress. Sound genuinely delighted."
        ),
        "excited": (
            "\nSPEAKING TONE: Be highly energetic and animated. "
            "Show strong enthusiasm, use exclamations naturally, "
            "and convey urgency and passion about the project."
        ),
        "serious": (
            "\nSPEAKING TONE: Be direct, measured, and professional. "
            "No small talk, no filler words. Get straight to the point. "
            "Sound authoritative and focused."
        ),
        "calm": (
            "\nSPEAKING TONE: Be relaxed, steady, and reassuring. "
            "Speak at a gentle pace, use softening language, "
            "and create a comfortable atmosphere. No rushing."
        ),
    }
    emotion_block = emotion_instructions.get(emotion, "")

    # ── Coverage radar (single source of truth: backend's assess_coverage) ──
    FOCUS_THRESHOLD = 95
    OTHER_THRESHOLD = 80
    if coverage is None:
        # Defensive fallback when called before coverage was fetched. Empty
        # dict yields all-zero scores and a "D" grade — the agent will read
        # this as "everything's a gap" and ask broadly, which is safer than
        # claiming false coverage.
        coverage = {"scores": {}, "grade": "D", "overall": 0, "sections": SECTION_KEYS}
    scores = coverage.get("scores", {})
    grade = coverage.get("grade", "D")
    overall = coverage.get("overall", 0)
    # Sections to consider — template-filtered when the coverage payload
    # specifies it, otherwise the full canonical list.
    radar_sections = coverage.get("sections") or SECTION_KEYS

    focus_sections = [s for s in PERSONA_FOCUS_SECTIONS.get(persona, []) if s in radar_sections]

    coverage_lines = [f"Blueprint coverage: {overall}% (grade {grade})"]

    # Focus section gaps (this persona's areas below 95%)
    focus_gaps = [s for s in focus_sections if scores.get(s, 0) < FOCUS_THRESHOLD]
    if focus_gaps:
        coverage_lines.append(f"YOUR focus areas (target {FOCUS_THRESHOLD}%+):")
        for s in focus_gaps:
            label = SECTION_LABELS.get(s, s)
            coverage_lines.append(f"  - {label} ({scores.get(s, 0)}%)")

    # Other gaps outside this persona's domain
    other_gaps = [s for s in radar_sections if s not in focus_sections and scores.get(s, 0) < OTHER_THRESHOLD]
    if other_gaps:
        coverage_lines.append("Other low-confidence sections:")
        other_hints = []
        for s in other_gaps:
            label = SECTION_LABELS.get(s, s)
            coverage_lines.append(f"  - {label} ({scores.get(s, 0)}%)")
            for p_id, p_secs in PERSONA_FOCUS_SECTIONS.items():
                if p_id != persona and s in p_secs:
                    p_label = PERSONA_LABELS.get(p_id, p_id)
                    other_hints.append(f"{label} → {p_label}")
                    break
        if other_hints:
            coverage_lines.append(
                "Hint: suggest the user switch personas to cover these: "
                + ", ".join(other_hints)
            )

    # Well-covered sections
    well_covered = [s for s in radar_sections if scores.get(s, 0) >= OTHER_THRESHOLD]
    if well_covered:
        covered_labels = ", ".join(SECTION_LABELS.get(s, s) for s in well_covered)
        coverage_lines.append(f"Well-covered (80%+): {covered_labels}")
        coverage_lines.append(
            f"Do NOT re-ask about: {covered_labels}. Move on to unfilled sections."
        )

    # ── Detect already-used personas ──
    # Prefer the persisted persona_history (written by services.pace whenever
    # the active persona changes); fall back to the legacy "Switched to X"
    # scan if no history has been recorded yet (older sessions, fresh worker
    # before the first transition).
    used_personas: set[str] = {persona}  # Current persona is always "used"
    history_from_state: list[str] = []
    if isinstance(runtime_state, dict):
        raw_history = runtime_state.get("persona_history")
        if isinstance(raw_history, list):
            history_from_state = [str(p) for p in raw_history if isinstance(p, str)]
    if history_from_state:
        used_personas.update(history_from_state)
    else:
        for msg in history:
            content = msg.get("content", "")
            if "Switched to" in content:
                for p_id, p_label in PERSONA_LABELS.items():
                    if p_label in content:
                        used_personas.add(p_id)

    # ── Hard directive (matches chat agent's three-tier logic) ──
    focus_done = focus_sections and not focus_gaps
    other_persona_gaps: dict[str, list[str]] = {}
    if focus_done:
        for p_id, p_secs in PERSONA_FOCUS_SECTIONS.items():
            # Exclude current persona AND already-used personas
            if p_id != persona and p_id not in used_personas and p_secs:
                p_g = [s for s in p_secs if scores.get(s, 0) < FOCUS_THRESHOLD]
                if p_g:
                    other_persona_gaps[p_id] = p_g

    if focus_gaps:
        gap_labels = [SECTION_LABELS.get(s, s) for s in focus_gaps[:3]]
        coverage_lines.append(
            f">>> DIRECTIVE: Your focus areas still need work. "
            f"Push these to {FOCUS_THRESHOLD}%+: {', '.join(gap_labels)}. "
            f"Do NOT suggest completing or say blueprint is solid."
        )
    elif other_persona_gaps:
        # Find best unused persona to suggest
        best_p = max(other_persona_gaps, key=lambda p: len(other_persona_gaps[p]))
        p_label = PERSONA_LABELS.get(best_p, best_p)
        best_gaps = other_persona_gaps[best_p]
        best_labels = [SECTION_LABELS.get(s, s) for s in best_gaps[:3]]
        coverage_lines.append(
            f">>> DIRECTIVE: Your focus areas are complete. "
            f"Suggest switching to {p_label} in Settings to cover: "
            f"{', '.join(best_labels)}. Do NOT say the blueprint is ready."
        )
    elif grade != "A":
        # All personas used but gaps remain — cover them directly
        all_gaps = [s for s in radar_sections if scores.get(s, 0) < OTHER_THRESHOLD]
        gap_labels = [SECTION_LABELS.get(s, s) for s in all_gaps[:3]]
        coverage_lines.append(
            f">>> DIRECTIVE: Grade is {grade} ({overall}%). NOT ready. "
            f"Ask about: {', '.join(gap_labels)}. "
            f"All personas have been used — cover these gaps directly."
        )

    coverage_block = "\n".join(coverage_lines)

    # ── Multi-participant ROOM block (roster + air-time + involvement mode) ──
    room_lines: list[str] = []
    name_list = [n for n in participants.values() if n]
    if name_list:
        # Air-time table
        total_words = sum((s.get("words") or 0) for s in speaking_stats.values()) or 0
        roster_lines = []
        for name in name_list:
            stats = speaking_stats.get(name) or {}
            msgs = stats.get("messages") or 0
            words = stats.get("words") or 0
            pct = round(100 * words / total_words) if total_words else 0
            roster_lines.append(f"  - {name}: {msgs} turns, ~{words} words ({pct}%)")
        room_lines.append("PARTICIPANTS (address them by first name):")
        room_lines.extend(roster_lines)
        # Quietest-participant nudge (only when more than one human + meaningful air-time)
        if len(name_list) > 1 and total_words > 30:
            mean_words = total_words / len(name_list)
            quiet = [
                name for name in name_list
                if (speaking_stats.get(name, {}).get("words") or 0) < 0.3 * mean_words
            ]
            if quiet and involvement in ("facilitator", "driver"):
                room_lines.append(
                    f"AIR-TIME IMBALANCE: {', '.join(quiet)} is significantly under-engaged. "
                    "Invite them in by name when the topic touches their domain."
                )
    room_lines.append(INVOLVEMENT_PROMPTS.get(involvement, INVOLVEMENT_PROMPTS[INVOLVEMENT_DEFAULT]))
    if len(name_list) > 1:
        room_lines.append(
            "Do NOT respond when an utterance is clearly directed at another participant "
            "(e.g. starts with their first name). The runtime gate will also enforce this."
        )
    room_block = "\n".join(room_lines)

    # ── Recent reactions (soft context — agent may acknowledge organically) ──
    reaction_block = ""
    if reactions:
        recent = _filter_reactions_for_prompt(list(reactions))
        if recent:
            line = ", ".join(f"{e} from {n}" for e, n in recent)
            reaction_block = (
                f"\nRECENT REACTIONS: {line}. "
                "Mention if it feels natural; do not fish.\n"
            )

    # ── Screen awareness (only when screen vision is enabled) ──
    screen_block = ""
    if screen_vision:
        screen_block = (
            "\nSCREEN AWARENESS: When the user shares their screen, an image of it is "
            "attached to their message. Reference what you actually see — read UI labels, "
            "code, diagrams. If they point at a region, a hint will say where. "
            "NEVER claim to see the screen when no image is attached.\n"
        )

    # ── Blueprint state ──
    # Render full bullets per section (capped per-section, not per-line) so
    # when the agent says "you mentioned X" it has the actual content in
    # front of it instead of a sentence-fragment preview that silently drops
    # later bullets and slices mid-word.
    SECTION_BUDGET = 800
    bp_status_lines = []
    for key, label, _ in BLUEPRINT_FLOW:
        content = (blueprint.get(key) or "").strip()
        score = scores.get(key, 0)
        if not content:
            bp_status_lines.append(f"- {label} ({score}%): EMPTY")
            continue
        # Split into bullet lines; if no bullets, treat as one line.
        raw_lines = [line.rstrip() for line in content.splitlines() if line.strip()]
        if not raw_lines:
            raw_lines = [content]
        bp_status_lines.append(f"- {label} ({score}%):")
        used = 0
        kept = 0
        skipped = 0
        for raw in raw_lines:
            if used + len(raw) + 1 > SECTION_BUDGET and kept >= 1:
                skipped = len(raw_lines) - kept
                break
            # Indent and ensure a leading "- " so the agent always reads
            # bulleted facts.
            stripped = raw.lstrip("-*• ").strip()
            bp_status_lines.append(f"    - {stripped}")
            used += len(raw) + 1
            kept += 1
        if skipped > 0:
            bp_status_lines.append(f"    ... ({skipped} more bullet{'s' if skipped > 1 else ''})")
    bp_status = "\n".join(bp_status_lines)

    # ── Pace block ── per-persona question budget (src.app.services.pace).
    # Mirrors the chat facilitator so video sessions respect the same
    # Fast / Balanced / Deep budgets the user picked in the session launcher.
    try:
        from app.services.pace import (
            build_pace_directive,
            get_persona_stats,
            next_persona_for_handoff,
        )

        pace_value = ai_config.get("pace")
        pace_persona_stats = get_persona_stats(runtime_state, persona)
        pace_persona_label = PERSONA_LABELS.get(persona, persona)
        pace_handoff = next_persona_for_handoff(
            scores=scores,
            current_persona=persona,
            persona_stats=pace_persona_stats,
            pace=pace_value,
            persona_focus_sections=PERSONA_FOCUS_SECTIONS,
            persona_labels=PERSONA_LABELS,
            section_labels=SECTION_LABELS,
            # Hard-exclude already-used personas — mirrors the chat path so
            # the voice chip can't re-pitch a persona who has already had
            # their turn in this session.
            used_personas=used_personas,
        )
        pace_block = build_pace_directive(
            pace=pace_value,
            persona_label=pace_persona_label,
            persona_stats=pace_persona_stats,
            next_persona_label=pace_handoff["label"] if pace_handoff else None,
            gap_section_labels=(
                [SECTION_LABELS.get(s, s) for s in pace_handoff["gap_sections"]]
                if pace_handoff else None
            ),
        )
    except Exception as e:
        logger.debug("pace block build failed: %s", e)
        pace_block = ""

    # Tell the LLM which personas have already been active so it doesn't
    # verbally re-pitch one. The chip is suppressed via used_personas above;
    # this is the verbal counterpart so the voice agent never says "let's
    # bring in the PM" when the PM already had a turn.
    used_personas_for_prompt = [p for p in used_personas if p != persona]
    if used_personas_for_prompt:
        used_labels = ", ".join(PERSONA_LABELS.get(p, p) for p in used_personas_for_prompt)
        used_personas_block = (
            f"PERSONAS ALREADY USED THIS SESSION: {used_labels}. "
            "Do NOT suggest switching to any of these — they've each had their turn. "
            "If all other personas are exhausted, finish remaining gaps yourself."
        )
    else:
        used_personas_block = ""

    # ── Conversation history ──
    history_block = ""
    if history:
        relevant = [
            m for m in history
            if not any(
                phrase in (m.get("content") or "")
                for phrase in [
                    "has left the session", "glad you could join",
                    "I'm your AI planning facilitator", "I'll guide you through",
                ]
            )
        ]
        if relevant:
            lines = []
            for msg in relevant[-30:]:
                speaker = msg.get("speaker_name") or (
                    "AI" if msg.get("message_type") in ("ai", "voice_ai") else "User"
                )
                lines.append(f"{speaker}: {msg.get('content', '')}")
            history_block = (
                "\n\n--- CONVERSATION SO FAR ---\n"
                + "\n".join(lines)
                + "\n--- END ---\n"
            )

    return f"""{persona_text}

You are an AI facilitator in a voice planning session. You DRIVE the conversation forward.
{assertiveness_block}{language_block}{emotion_block}
YOUR ROLE: Guide the team through building a complete project blueprint. Make decisions, state assumptions, and only ask when you genuinely can't infer the answer.

CRITICAL SPEAKING RULES — THIS IS A VOICE CALL, NOT A CHAT:
- MAX 2 sentences per response. Hard limit. Count before you speak.
- Exactly ONE question per response. Never two. Never zero (unless confirming).
- NO preamble. Do NOT recap what they said or what you know. Just ask the next question.
- BAD: "Great, so you're building a to-do app with React and you want auth. Now I need to understand your users. Who is the primary user and what are their pain points?"
- GOOD: "Who's the main user of this app?"
- If you have a recommendation AND a question, split them: state the recommendation, STOP. Wait for their response. Ask the question in your NEXT turn.
- NEVER list options in speech. Instead of "are you trying to reduce costs, improve speed, or cut tickets?" just ask "what's the main goal?"
- NEVER use markdown. Plain spoken sentences only.
- NEVER say "last question", "one more thing", "final thing", "just one more", or "before we wrap up" unless you are TRULY done and have NO more sections to cover. Check the Coverage Radar — if ANY section is below 80%, you are NOT done. Saying "last question" when you have more destroys credibility.

FACILITATION:
- GAUGE COMPLEXITY from the first message. Simple project = 3-5 questions. Complex SaaS = deep exploration.
- SIMPLE projects: ask briefly about each area, don't assume. Still cover all sections.
- COMPLEX projects: dig deep into data models, user roles, API boundaries, scaling, compliance.
- Be OPINIONATED. State your recommendation, let them push back.
- If someone says "figure it out" or "your call", state your recommendation first.
- NEVER suggest completing while ANY low-confidence sections or focus-area gaps exist.
- NEVER suggest completing if the overall grade is B, C, or D. Only at grade A (80%+).
- NEVER say "let me capture" or "let me document". Blueprint updates automatically.
- When multiple people talk, synthesize: "So Alice wants X, Bob prefers Y — I'd go with X because Z."

PERSONA FOCUS & SWITCHING:
- You have PRIMARY focus areas shown in the Coverage Radar below.
- Prioritize gaps in YOUR focus areas first. Push for {FOCUS_THRESHOLD}%+ on your own areas.
- When YOUR focus areas are all {FOCUS_THRESHOLD}%+ but other sections have gaps, you MUST suggest switching personas. This is MANDATORY — do NOT wrap up or suggest completing.
- Say something like: "I've covered the technical foundations — open Settings and switch to Product Manager to define your users, goals, and scope." Be specific about WHICH persona and WHAT it will cover.
- If the Coverage Radar shows a "Hint: suggest switching", you MUST relay that to the user.
- Follow-up depth and question budget are set by the PACE block below. Obey it strictly — when the budget is spent, hand off instead of asking another question.
- ALWAYS capture info for ANY section if the user mentions it, even outside your focus.
- Do NOT refuse to discuss sections outside your focus, but steer back to your strengths.
- NEVER re-ask about topics already captured. Check the blueprint state below first.
- Stay in YOUR lane unless all your focus areas are at {FOCUS_THRESHOLD}%+.

Key sections to cover:
- team_capacity: ask about team size, sprint length, velocity. For solo devs, note "1 developer" and move on.
- risks_unknowns: ask about blockers, technical risks, dependencies. Even "no major risks" is valid.
- out_of_scope: ask what's explicitly NOT included in this version.

{"VOCABULARY — use these EXACT spellings when referring to these names/terms:" + chr(10) + chr(10).join(f"- {t}" for t in vocabulary_terms) + chr(10) if vocabulary_terms else ""}COVERAGE RADAR:
{coverage_block}

{pace_block}

{used_personas_block}

ROOM:
{room_block}
{reaction_block}{screen_block}
BLUEPRINT STATE:
{bp_status}
{history_block}
Blueprint updates happen automatically — just focus on the conversation."""


# ── HTTP helpers ──────────────────────────────────────────────────────


# Shared HTTP client for agent → backend calls (avoids TCP setup per message)
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=10.0)
    return _http_client


async def post_message(
    session_id: str,
    content: str,
    message_type: str = "chat",
    speaker_name: str | None = None,
    original_content: str | None = None,
    is_enhanced: bool = False,
) -> None:
    try:
        client = _get_http_client()
        payload: dict = {
            "session_id": session_id,
            "content": content,
            "message_type": message_type,
            "speaker_name": speaker_name,
        }
        if original_content is not None:
            payload["original_content"] = original_content
            payload["is_enhanced"] = is_enhanced
        resp = await client.post(
            f"{BACKEND_URL}/api/internal/messages",
            json=payload,
            headers={"X-Internal-Secret": INTERNAL_SECRET},
        )
        if resp.status_code not in (200, 201):
                logger.warning("post_message returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning("post_message failed (non-fatal): %s", e)


async def post_persona_suggestion(
    session_id: str, persona: str, label: str, reason: str
) -> None:
    """Send a structured persona switch suggestion to the frontend."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{BACKEND_URL}/api/internal/suggest-persona",
                json={
                    "session_id": session_id,
                    "persona": persona,
                    "label": label,
                    "reason": reason,
                },
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
    except Exception as e:
        logger.warning("post_persona_suggestion failed: %s", e)


async def get_voice_config(session_id: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/ai-config",
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("get_voice_config failed: %s", e)
    return {}


async def get_message_history(session_id: str, limit: int = 200) -> list[dict]:
    """Fetch the most recent ``limit`` messages for the session.

    The endpoint is paginated server-side so loading a long session doesn't
    OOM the agent on boot. The agent only needs recent context for the LLM
    (the blueprint provides long-term context).
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/messages",
                params={"limit": limit},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("get_message_history failed: %s", e)
    return []


async def get_blueprint(session_id: str) -> dict[str, str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/blueprint",
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
            if resp.status_code == 200:
                return resp.json().get("content", {})
    except Exception as e:
        logger.warning("get_blueprint failed: %s", e)
    return {}


async def get_blueprint_meta(session_id: str) -> dict:
    """Return ``{"content": {...}, "version_number": int}`` so callers can use
    the version for optimistic-concurrency PATCH (`expected_version`)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/blueprint",
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("get_blueprint_meta failed: %s", e)
    return {"content": {}, "version_number": 0}


async def subscribe_blueprint_events(session_id: str, on_change) -> None:
    """Maintain a persistent WS connection to the backend's internal events
    feed and call ``on_change`` whenever the blueprint changes — whether the
    edit came from the agent's own PATCH or from a manual user edit in the
    UI. This is what closes the staleness window where the agent narrates a
    blueprint older than what the user is looking at.

    Reconnects with exponential backoff on transport errors. Cancel the
    asyncio task to stop.
    """
    import websockets

    url = f"{BACKEND_WS_URL}/api/internal/ws/sessions/{session_id}/events?secret={INTERNAL_SECRET}"
    backoff = 1.0
    while True:
        try:
            async with websockets.connect(url, ping_interval=30, ping_timeout=10) as ws:
                logger.info("Blueprint event subscriber connected for session %s", session_id)
                backoff = 1.0
                async for raw in ws:
                    try:
                        event = json.loads(raw)
                    except (TypeError, ValueError):
                        continue
                    if event.get("type") != "blueprint_update":
                        continue
                    payload = event.get("payload") or {}
                    try:
                        await on_change(payload)
                    except Exception as e:
                        logger.warning("Blueprint event handler failed: %s", e)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(
                "Blueprint event subscriber dropped for %s (%s); reconnecting in %.1fs",
                session_id,
                e,
                backoff,
            )
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)


async def get_agent_runtime_state(session_id: str) -> dict:
    """Load persisted runtime state so a restarted worker can rehydrate
    speaker diarization, used-persona history, and last-extracted-idx."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/agent-state",
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
            if resp.status_code == 200:
                return resp.json().get("state") or {}
    except Exception as e:
        logger.debug("get_agent_runtime_state failed: %s", e)
    return {}


async def save_agent_runtime_state(session_id: str, state: dict) -> None:
    """Best-effort PATCH of runtime state. Never raises — checkpointing must
    not interfere with the live conversation."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.patch(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/agent-state",
                json={"state": state},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
    except Exception as e:
        logger.debug("save_agent_runtime_state failed: %s", e)


async def get_coverage(session_id: str) -> dict:
    """Fetch coverage from the backend so the agent's spoken radar matches
    what the user sees in the UI exactly. Returns the dict from the
    /coverage endpoint; on error returns an empty shape that
    `build_system_prompt` reads as "everything's a gap"."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/coverage",
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("get_coverage failed: %s", e)
    return {"scores": {}, "overall": 0, "grade": "D", "gaps": [], "sections": list(SECTION_KEYS)}


async def get_vocabulary_terms(session_id: str) -> list[str]:
    """Fetch vocabulary canonical terms for this session's org."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/vocabulary",
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
            if resp.status_code == 200:
                data = resp.json()
                # Extract just the canonical terms from keywords like "term:1.5"
                return [kw.rsplit(":", 1)[0] for kw in data.get("keywords", [])]
    except Exception as e:
        logger.debug("get_vocabulary_terms failed: %s", e)
    return []


async def create_blueprint_suggestion(
    session_id: str,
    section: str,
    content: str,
    source_message_ids: list[str] | None = None,
    supersedes_bullet: str | None = None,
) -> dict | None:
    """POST a pending blueprint suggestion through the internal endpoint with retries.

    Suggestions are append-only (no optimistic concurrency needed) — they go
    into a queue for user review rather than mutating the live blueprint, so
    the prior 409-conflict handling on the agent side is gone.

    ``supersedes_bullet`` (optional): when the LLM flags the new fact as
    contradicting an existing bullet, pass the verbatim text here so the
    user can choose to replace it.
    """
    payload: dict = {"section": section, "content": content}
    if source_message_ids:
        payload["source_message_ids"] = source_message_ids
    if supersedes_bullet:
        payload["supersedes_bullet"] = supersedes_bullet

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{BACKEND_URL}/api/internal/sessions/{session_id}/blueprint-suggestions",
                    json=payload,
                    headers={"X-Internal-Secret": INTERNAL_SECRET},
                )
            if resp.status_code in (200, 201):
                logger.info("Blueprint suggestion queued: %s", section)
                try:
                    return resp.json()
                except Exception:
                    return None
            if 500 <= resp.status_code < 600:
                logger.warning(
                    "Blueprint suggestion %s failed (attempt %d/3): %s",
                    section,
                    attempt + 1,
                    resp.status_code,
                )
                await asyncio.sleep(0.5 * (2**attempt))
                continue
            logger.warning(
                "Blueprint suggestion rejected %s: %s %s",
                section,
                resp.status_code,
                resp.text[:200],
            )
            return None
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError) as e:
            last_exc = e
            logger.warning(
                "Blueprint suggestion transport error %s (attempt %d/3): %s",
                section,
                attempt + 1,
                e,
            )
            await asyncio.sleep(0.5 * (2**attempt))
        except Exception as e:
            logger.warning("Blueprint suggestion failed: %s", e)
            return None

    if last_exc is not None:
        logger.warning("Blueprint suggestion %s gave up after retries: %s", section, last_exc)
    return None


# ── Blueprint extraction (runs as background task) ────────────────────

EXTRACT_PROMPT = """You extract project-blueprint facts from a meeting transcript. Your output is grounded ONLY in what was literally said. You are NOT a consultant, advisor, or risk analyst — do not infer, suggest, or volunteer information that is not explicitly stated.

CONVERSATION:
{conversation}

ALREADY IN THE BLUEPRINT (do NOT re-emit any of these — the backend keeps them automatically):
{blueprint_state}

For each section where the conversation contains NEW information that isn't already in the blueprint, output a JSON object with ONLY the new bullets — one new fact per "- " line. The backend will union your bullets with the existing content; you do NOT need to repeat anything that's already there.

CONFLICT DETECTION: If a new fact CONTRADICTS or UPDATES a specific existing bullet in the same section (e.g., "team of 5 engineers" → "team of 3 engineers"), include a `supersedes` field in the JSON object containing the EXACT verbatim text of the existing bullet (including its leading "- " marker if present). The user will see the conflict and choose to replace or keep both. If the new fact merely adds information without conflicting with anything existing, omit `supersedes`.

If the conversation contains nothing new (or nothing that maps to a blueprint section), output an empty array `[]`. An empty array is ALWAYS the correct answer if you are unsure.

HARD RULES (these override everything else):
1. NEVER invent, infer, or extrapolate. If a bullet's content cannot be quoted or directly paraphrased from the conversation lines above, DO NOT emit it. When in doubt, skip it.
2. Do NOT emit "best practice" advice, security risks, mitigations, common patterns, or industry warnings unless the speaker said them in the conversation.
3. Do NOT generate Security & Compliance, Risks & Unknowns, Open Questions, or other sections from your general knowledge — only from explicit speaker statements.
4. Format each fact as a "- " bullet on its own line. Example: "- Solo developer\n- No fixed sprint length"
5. NEVER use prefixes like "RESOLVED:", "CONFIRMED:", "DECIDED:" — state the fact directly.
6. Keep each bullet concise — one clear statement per line, ideally <100 chars.
7. If the conversation only restates something already in the blueprint, output an empty array.
8. Self-check before outputting: for each bullet, point to the exact phrase in the conversation that supports it. If you cannot, drop it.
9. `supersedes` is OPTIONAL and only applies when the new fact directly contradicts ONE specific existing bullet. Do NOT use it for unrelated additions.

Output format — ONLY valid JSON, no markdown. `supersedes` is optional:
[
  {{"section": "tech_stack", "content": "- Redis cache"}},
  {{"section": "team_capacity", "content": "- Team of 3 engineers", "supersedes": "- Team of 5 engineers"}}
]

Valid sections: {sections}"""  # noqa: E501


async def extract_and_update_blueprint(
    session_id: str,
    new_messages: list[dict],
    current_blueprint: dict[str, str],
    base_version: int | None = None,
) -> None:
    """Extract blueprint info from a NEW slice of conversation and queue
    the bullets as pending suggestions for user review.

    ``new_messages`` should be only the messages that haven't been extracted
    yet (the caller tracks ``last_extracted_idx`` and slices accordingly).
    The LLM emits ONLY new bullets, and each (section, bullets) pair becomes
    one pending suggestion the user can accept, edit, or reject in the
    SuggestionsDrawer. The blueprint itself is no longer mutated by the
    agent.

    ``base_version`` is accepted for backwards compatibility with the caller
    but unused — suggestions are append-only, so there's no concurrency to
    track on the agent side.
    """
    del base_version  # No longer needed — suggestions don't race the blueprint.
    try:
        # Voice-only: blueprint suggestions must reflect what was *spoken*.
        # Typed chat messages flow through the facilitator path (sessions.py
        # `_run_facilitator()` → `update_section()` direct) and would
        # otherwise double-emit as pending suggestions here.
        voice_only = [
            m for m in new_messages
            if m.get("message_type") in ("voice_chat", "voice_ai")
        ]
        if not voice_only:
            return

        # Build conversation text from the new slice (cap at 30 messages so
        # a long-paused buffer doesn't blow up token budget on first flush).
        conv_lines = []
        source_ids: list[str] = []
        for msg in voice_only[-30:]:
            speaker = msg.get("speaker_name") or ("AI" if msg.get("message_type") in ("ai", "voice_ai") else "User")
            conv_lines.append(f"{speaker}: {msg.get('content', '')}")
            mid = msg.get("id")
            if mid:
                source_ids.append(mid)

        if not conv_lines:
            return

        # Build current blueprint state shown to the LLM as "already known"
        bp_lines = []
        for key, label, _ in BLUEPRINT_FLOW:
            val = current_blueprint.get(key, "").strip()
            bp_lines.append(f"{label}: {val if val else 'EMPTY'}")

        prompt = EXTRACT_PROMPT.format(
            conversation="\n".join(conv_lines),
            blueprint_state="\n".join(bp_lines),
            sections=", ".join(SECTION_KEYS),
        )

        from app.services.ai_provider import get_ai_client_for_role

        client = await get_ai_client_for_role(org_id=None, db=None, role="agent_extract")
        raw = await client.chat(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2048,
            # Temperature 0: extraction must be deterministic and grounded.
            # Any creativity here turns into hallucinated security risks /
            # mitigation advice the speaker never mentioned.
            temperature=0,
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        updates = json.loads(raw)
        if not isinstance(updates, list):
            return

        applied = 0
        for item in updates:
            section = item.get("section", "")
            content = item.get("content", "").strip()
            if not (section in SECTION_KEYS and content):
                continue

            raw_supersedes = item.get("supersedes")
            supersedes_bullet = (
                raw_supersedes.strip() if isinstance(raw_supersedes, str) and raw_supersedes.strip() else None
            )
            await create_blueprint_suggestion(
                session_id,
                section,
                content,
                source_message_ids=source_ids or None,
                supersedes_bullet=supersedes_bullet,
            )
            applied += 1

        if applied:
            logger.info("Blueprint extraction queued %s suggestions", applied)

    except Exception as e:
        logger.warning("Blueprint extraction failed (non-fatal): %s", e)


# ── Entrypoint ────────────────────────────────────────────────────────


class FatalConfigError(Exception):
    """Misconfiguration the retry loop cannot fix. Skip retries, post 'error' once."""


async def _notify_agent_status(session_id: str, status: str) -> None:
    """Notify backend of agent connection status change."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"{BACKEND_URL}/api/internal/agent-status",
                json={"session_id": session_id, "status": status},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
    except Exception as e:
        logger.debug("Failed to notify agent status: %s", e)


async def _create_llm(ai_config: dict | None = None):
    """Create the voice-agent LLM with fallback chain: Anthropic → Gemini.

    Checked once at session start. Mid-session swap isn't supported by
    LiveKit Agents — a session that joined under outage runs on the backup
    for its lifetime (usually a few minutes); a fresh session re-checks.

    Read the platform-anthropic health snapshot in Redis. If Anthropic was
    marked unhealthy by a recent AIClient call AND we have a Gemini key,
    use the `livekit-plugins-google` LLM instead so the call can complete.
    Records an active-failover snapshot so the frontend banner shows the
    degraded-but-working state.
    """
    # Fail-fast guard: if neither provider has a key configured, the worker
    # has no usable LLM. Raise a typed error the entrypoint can recognise
    # and skip the retry loop for — silently retrying a misconfig wastes
    # ~17s before surfacing "disconnected".
    if not os.getenv("ANTHROPIC_API_KEY") and not os.getenv("GOOGLE_API_KEY"):
        raise FatalConfigError(
            "voice agent has no usable LLM — set ANTHROPIC_API_KEY "
            "(and optionally GOOGLE_API_KEY for failover)"
        )

    # Reading the Redis provider-health snapshot is best-effort: a Redis
    # outage or a missing cross-package import must NOT crash the worker
    # before it joins the room. On any failure, treat anthropic as healthy
    # and proceed — the worker will still serve calls, just without the
    # platform-level failover signal.
    snap = None
    try:
        from app.services import provider_health

        snap = await provider_health.get("platform", "anthropic")
    except Exception:
        logger.warning("voice_agent_provider_health_unavailable", exc_info=True)
    anthropic_unhealthy = snap is not None and snap.get("status") == "unhealthy"

    if anthropic_unhealthy and os.getenv("GOOGLE_API_KEY"):
        try:
            from livekit.plugins import google as google_plugin

            llm = google_plugin.LLM(model="gemini-2.5-flash")
            logger.warning(
                "voice_agent_llm_failover",
                extra={
                    "from_provider": "anthropic",
                    "to_provider": "gemini",
                    "from_error_code": snap.get("error_code") if snap else None,
                },
            )
            # Surface this to the frontend banner via the same path the
            # HTTP-side AIClient uses for chat/etc failovers.
            try:
                from app.services import provider_health

                await provider_health.record_active_failover(
                    role="voice_agent_llm",
                    from_provider="anthropic",
                    to_provider="gemini",
                )
            except Exception:
                logger.warning("voice_agent_record_failover_failed", exc_info=True)
            return llm
        except Exception as e:
            logger.warning("Gemini LLM fallback failed (%s), falling back to anthropic", e)

    # Default to Haiku 4.5 (vision-capable, fast, cheap). A session can opt into
    # Sonnet 4.6 for richer reasoning over complex screen content (architecture
    # diagrams, dense UIs) via ai_config.visual_reasoning == "high".
    model = "claude-haiku-4-5-20251001"
    if (ai_config or {}).get("visual_reasoning") == "high":
        model = "claude-sonnet-4-6"
    logger.info("voice_agent_llm_provider provider=anthropic model=%s", model)
    return anthropic.LLM(model=model)


def _create_stt(language: str = "en", keyterms: list[str] | None = None):
    """Create STT with fallback chain: Deepgram → Google Cloud Speech."""
    # Google STT uses locale format (e.g., "pl-PL") while Deepgram uses short codes ("pl")
    google_locale = f"{language}-{language.upper()}" if len(language) == 2 else language

    # Try Deepgram first (best accuracy, diarization support)
    if os.getenv("DEEPGRAM_API_KEY"):
        try:
            stt_kwargs: dict = {"model": "nova-3", "language": language}
            if keyterms:
                stt_kwargs["keyterm"] = keyterms
                logger.info("Deepgram STT with %d keyterms", len(keyterms))
            stt = deepgram.STT(**stt_kwargs)
            logger.info("Using Deepgram Nova 3 STT (language=%s)", language)
            return stt
        except Exception as e:
            logger.warning("Deepgram STT failed (%s), trying Google", e)

    # Google Cloud Speech fallback
    if HAS_GOOGLE_STT:
        try:
            stt = google_plugin.STT(model="latest_long", language=google_locale)
            logger.info("Using Google Cloud Speech STT (fallback, language=%s)", google_locale)
            return stt
        except Exception as e:
            logger.warning("Google STT failed: %s", e)

    # Last resort — Deepgram with defaults (may fail at runtime if no API key)
    logger.warning("No STT API keys configured — using Deepgram defaults (may fail)")
    return deepgram.STT(model="nova-3", language=language)


def _create_tts(voice_id: str, speed: float = 1.0, emotion: str | None = None):
    """Create TTS with fallback chain: Cartesia → ElevenLabs."""
    # Try Cartesia first (lower latency)
    if HAS_CARTESIA:
        tts_kwargs: dict = {
            "model": "sonic-3",
            "voice": voice_id or "f114a467-c40a-4db8-964d-aaba89cd08fa",
        }
        if speed and speed != 1.0:
            tts_kwargs["speed"] = speed
        if emotion and emotion != "neutral":
            tts_kwargs["emotion"] = emotion
        try:
            tts = cartesia_plugin.TTS(**tts_kwargs)
            logger.info("Using Cartesia Sonic 3 (~40ms latency)")
            return tts
        except Exception as e:
            logger.warning("Cartesia TTS failed (%s), falling back to ElevenLabs", e)

    # ElevenLabs fallback
    try:
        tts = elevenlabs.TTS(voice_id=voice_id, model="eleven_multilingual_v2")
        logger.info("Using ElevenLabs TTS (voice_id=%s)", voice_id)
        return tts
    except Exception as e:
        logger.error("ElevenLabs TTS failed: %s — using defaults", e)
        return elevenlabs.TTS()


MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]  # seconds

# Sessions that requested a deliberate detach. Prevents the entrypoint retry loop
# from relaunching the agent if ctx.shutdown raises after a clean detach.
_DETACHED_SESSIONS: set[str] = set()


async def entrypoint(ctx: JobContext):
    if PERSONAPLEX_ENABLED:
        from .personaplex_worker import run_personaplex_agent

        await run_personaplex_agent(ctx)
        return  # PersonaPlex only — no fallback

    room_name = ctx.room.name
    session_id = room_name.replace("session-", "", 1) if room_name.startswith("session-") else room_name

    try:
        for attempt in range(MAX_RETRIES + 1):
            try:
                await _run_agent(ctx, session_id)
                break  # Clean exit
            except FatalConfigError as e:
                logger.error("voice_agent_fatal_config session=%s reason=%s", session_id, e)
                await _notify_agent_status(session_id, "error")
                break  # No retry — the misconfig won't fix itself in 2 seconds
            except Exception as e:
                if session_id in _DETACHED_SESSIONS:
                    logger.info("Detach in progress for %s — not retrying", session_id)
                    break
                logger.error("Agent crashed (attempt %d/%d): %s", attempt + 1, MAX_RETRIES + 1, e, exc_info=True)
                await _notify_agent_status(session_id, "error")

                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                    logger.info("Retrying in %ds...", delay)
                    await asyncio.sleep(delay)
                else:
                    logger.error("Agent exhausted all retries for session %s", session_id)
                    await _notify_agent_status(session_id, "disconnected")
    finally:
        _DETACHED_SESSIONS.discard(session_id)


async def _run_agent(ctx: JobContext, session_id: str):
    """Core agent logic — separated so entrypoint can retry on failure."""
    logger.info("Agent connecting to room: session-%s", session_id)
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    # "joining": agent has joined the room but is not yet ready for input.
    # The frontend keeps the ringtone playing until "ready" fires post-greeting,
    # so the user can't accidentally interrupt the greeting mid-sentence.
    await _notify_agent_status(session_id, "joining")

    # Screen-share vision state + per-track consumer tasks. Created before the
    # track handlers so the closures capture it; `.enabled` is resolved once
    # ai_config arrives (below). Screen-share tracks only appear after a user
    # starts sharing, which is well after that, so the flag is set in time.
    screen_vision_state = ScreenVisionState()
    _vision_tasks: dict[str, asyncio.Task] = {}

    @ctx.room.on("track_subscribed")
    def on_track_subscribed(
        track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant
    ):
        logger.info(
            "Track subscribed: kind=%s, source=%s, participant=%s", track.kind, publication.source, participant.identity
        )
        if not screen_vision_state.enabled:
            return
        if publication.source != rtc.TrackSource.SOURCE_SCREENSHARE:
            return
        # Single-presenter v1: ignore a second simultaneous sharer.
        if screen_vision_state.presenter_identity and screen_vision_state.presenter_identity != participant.identity:
            logger.info("Screen vision: ignoring second presenter %s", participant.identity)
            return
        if track.sid in _vision_tasks:
            return
        screen_vision_state.presenter_identity = participant.identity
        task = asyncio.create_task(_consume_screen_frames(track, screen_vision_state))
        _vision_tasks[track.sid] = task

        def _on_vision_done(t: asyncio.Task, sid: str = track.sid) -> None:
            # Pop so the registry never leaks dead entries, and surface any
            # escaped exception (the consumer catches its own, so this is a
            # belt-and-suspenders against "Task exception was never retrieved").
            _vision_tasks.pop(sid, None)
            if t.cancelled():
                return
            exc = t.exception()
            if exc is not None:
                logger.error("Screen frame consumer task crashed", exc_info=exc)

        task.add_done_callback(_on_vision_done)
        logger.info("Screen vision: consuming screen share from %s", participant.identity)

    @ctx.room.on("track_published")
    def on_track_published(publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        logger.info(
            "Track published: source=%s, mime=%s, participant=%s",
            publication.source,
            publication.mime_type,
            participant.identity,
        )
        # AUDIO_ONLY auto-subscribe never grabs video — subscribe to the screen
        # share explicitly so we don't pull every camera/avatar track too.
        if (
            screen_vision_state.enabled
            and publication.source == rtc.TrackSource.SOURCE_SCREENSHARE
            and publication.kind == rtc.TrackKind.KIND_VIDEO
        ):
            try:
                publication.set_subscribed(True)
            except Exception as e:
                logger.warning("Screen vision: set_subscribed failed: %s", e)

    def _stop_screen_consumer(track_sid: str) -> None:
        task = _vision_tasks.pop(track_sid, None)
        if task:
            task.cancel()

    def _cancel_vision_tasks() -> None:
        """Cancel every screen-frame consumer. MUST be called on EVERY teardown
        path (graceful detach AND room-empty shutdown), or a VideoStream leaks
        across room teardown.
        """
        for t in list(_vision_tasks.values()):
            t.cancel()
        _vision_tasks.clear()

    @ctx.room.on("track_unsubscribed")
    def on_track_unsubscribed(
        track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant
    ):
        if publication.source != rtc.TrackSource.SOURCE_SCREENSHARE:
            return
        _stop_screen_consumer(track.sid)
        # Reset so the agent stops referencing a screen that's no longer shared,
        # and the next presenter can take over.
        screen_vision_state.reset_share()

    # Fetch everything in parallel
    ai_config, history, blueprint, vocab_terms, coverage = await asyncio.gather(
        get_voice_config(session_id),
        get_message_history(session_id),
        get_blueprint(session_id),
        get_vocabulary_terms(session_id),
        get_coverage(session_id),
    )

    # Resolve screen vision now that ai_config is available. From here on the
    # track handlers will subscribe to and consume any screen share.
    screen_vision_state.enabled = _screen_vision_enabled(ai_config)
    logger.info("Screen vision enabled=%s", screen_vision_state.enabled)

    # Auto-extract keyterms from blueprint + common planning/engineering terms
    auto_terms: set[str] = set(vocab_terms or [])
    # Always boost common software planning terms that STT often misses
    auto_terms.update([
        "auth", "OAuth", "API", "REST", "GraphQL", "WebSocket", "CRUD",
        "MVP", "CI/CD", "DevOps", "Kubernetes", "Docker", "PostgreSQL",
        "Redis", "MongoDB", "TypeScript", "Next.js", "React", "FastAPI",
        "microservice", "monolith", "serverless", "endpoint", "middleware",
        "webhook", "cron", "schema", "migration", "rollback", "deploy",
        "staging", "production", "sprint", "standup", "backlog", "kanban",
        "OKR", "KPI", "SLA", "SSO", "RBAC", "JWT", "CORS", "HTTPS",
    ])
    for key in ("vision", "project_overview"):
        bp_text = (blueprint.get(key) or "").strip()
        if bp_text:
            for word in bp_text.split():
                clean = word.strip(".,;:!?()[]\"'")
                if clean and clean[0].isupper() and len(clean) > 2 and clean not in {"The", "This", "That", "And", "For", "But", "Not", "With", "From"}:
                    auto_terms.add(clean)
    vocab_terms = list(auto_terms)[:100]
    if vocab_terms:
        logger.info("Auto-extracted %d keyterms for STT", len(vocab_terms))

    # Resolve persona display name for transcript attribution
    persona_slug = ai_config.get("persona", "default")
    speaker_label = PERSONA_LABELS.get(persona_slug, "AI Facilitator")

    # Resolve ElevenLabs voice ID. The character's explicit voice_id (set on
    # the video_avatar row) is the source of truth. realtime_voice is a
    # retired field — only consulted as a last-resort fallback in case some
    # legacy persona didn't set voice_id.
    realtime_voice = ai_config.get("realtime_voice")
    voice_id = (
        ai_config.get("voice_id")
        or VOICE_ID_MAP.get(realtime_voice, None)
        or os.getenv("ELEVENLABS_VOICE_ID")
        or DEFAULT_VOICE_ID
    )
    logger.info(
        "Voice config: realtime_voice=%s → voice_id=%s, speed=%s, emotion=%s, language=%s",
        realtime_voice, voice_id, ai_config.get("speed"),
        ai_config.get("emotion"), ai_config.get("language"),
    )
    filled_count = sum(1 for v in blueprint.values() if v and v.strip())
    logger.info("Loaded %s messages, blueprint %s/%s filled", len(history), filled_count, len(SECTION_KEYS))

    # Live, mutable involvement state — read by the agent's gate every turn,
    # written here whenever ai_config refreshes or participants change.
    involvement_state = InvolvementState(
        mode=ai_config.get("involvement", INVOLVEMENT_DEFAULT),
        paused_until=_parse_paused_until(ai_config.get("paused_until")),
        persona_label=speaker_label,
    )

    # Bounded buffer of recent emoji reactions. Surfaced as a soft hint in
    # build_system_prompt so the agent can acknowledge organically without
    # being forced to speak on every reaction.
    recent_reactions: deque = deque(maxlen=8)
    # Throttle for verbal reaction acknowledgements (see _handle_reaction).
    reaction_ack_state: dict = {"last_ts": 0.0}

    has_history = len(history) > 1

    filled_sections = [SECTION_LABELS[k] for k, v in blueprint.items() if v and v.strip() and k in SECTION_LABELS]
    next_section_label = None
    next_section_question = None
    for key, label, question in BLUEPRINT_FLOW:
        if not blueprint.get(key, "").strip():
            next_section_label = label
            next_section_question = question
            break

    participant = await ctx.wait_for_participant()
    logger.info("Participant joined: %s", participant.identity)

    # Track all participants for speaker attribution. The InvolvementState dict
    # shares this object by reference so mutations are visible to the gate.
    participants: dict[str, str] = involvement_state.participants
    participants[participant.identity] = participant.name or participant.identity or "Participant"

    # Catch a screen share that was already publishing before our handlers were
    # registered (e.g. the user shared, then the agent joined). track_published
    # only fires for NEW publications, so sweep existing ones once.
    # Screen vision is a non-critical enhancement and must never crash agent
    # startup. Guard each subscribe individually so one bad publication doesn't
    # skip the rest, and so nothing here aborts _run_agent ("AI unavailable").
    if screen_vision_state.enabled:
        for remote in ctx.room.remote_participants.values():
            for pub in remote.track_publications.values():
                if pub.source == rtc.TrackSource.SOURCE_SCREENSHARE and pub.kind == rtc.TrackKind.KIND_VIDEO:
                    try:
                        pub.set_subscribed(True)
                        logger.info("Screen vision: subscribing to pre-existing share from %s", remote.identity)
                    except Exception as e:
                        logger.warning("Screen vision: pre-existing-share subscribe failed: %s", e)

    # Map Deepgram diarization speaker IDs (0, 1, 2...) to participant identities
    # Built by assigning IDs in the order participants join. Restored from the
    # backend's persisted runtime state so a worker restart doesn't reshuffle
    # who's who mid-call (which would mis-attribute speech to the wrong human).
    persisted_state = await get_agent_runtime_state(session_id)
    speaker_id_map: dict[str, str] = dict(persisted_state.get("speaker_id_map") or {})
    saved_order = persisted_state.get("participant_order") or []

    # Pace runtime state — per-persona question counters mirrored from the
    # chat path. Mutated in on_conversation_item_added after every agent
    # reply and folded into the periodic snapshot so a worker restart
    # doesn't reset the budget mid-call.
    pace_runtime_state: dict = {
        "persona_stats": dict(persisted_state.get("persona_stats") or {}),
        "active_persona": persisted_state.get("active_persona") or ai_config.get("persona", "default"),
    }
    # If the worker boots into a persona different from the one whose stats
    # were last persisted, zero out the new persona's counter so we don't
    # inherit a stale budget from a previous active period.
    try:
        from app.services.pace import reset_persona_stats as _reset_pace_stats

        _boot_persona = ai_config.get("persona", "default")
        if pace_runtime_state.get("active_persona") != _boot_persona:
            pace_runtime_state = _reset_pace_stats(pace_runtime_state, _boot_persona)
            pace_runtime_state["active_persona"] = _boot_persona
    except Exception as e:
        logger.debug("pace boot-reset skipped: %s", e)
    # Always seed with this connection's participant first; merge prior order
    # only for identities that are still meaningful.
    participant_order: list[str] = [participant.identity]
    for ident in saved_order:
        if ident and ident != participant.identity and ident not in participant_order:
            participant_order.append(ident)

    # Read speed and emotion from ai_config
    speed = ai_config.get("speed", 1.0)
    emotion = ai_config.get("emotion")

    # Validate emotion — fallback to None for unrecognised values
    VALID_EMOTIONS = {"neutral", "happy", "serious", "excited", "calm"}
    if emotion and emotion not in VALID_EMOTIONS:
        logger.warning("Unrecognised emotion %r, falling back to neutral", emotion)
        emotion = None

    logger.info("TTS config — speed: %s, emotion: %s", speed, emotion)

    # Build TTS with fallback chain: Cartesia → ElevenLabs
    tts = _create_tts(voice_id, speed, emotion)

    # Build STT with fallback chain: Deepgram → Google (with vocabulary keyterms for Nova-3)
    language = ai_config.get("language", "en")
    stt = _create_stt(language, keyterms=vocab_terms if vocab_terms else None)
    llm = await _create_llm(ai_config)

    session = AgentSession(
        vad=silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=0.3,
            activation_threshold=0.4,
        ),
        stt=stt,
        llm=llm,
        tts=tts,
        turn_detection="stt",
        preemptive_generation=True,
        allow_interruptions=True,
        min_endpointing_delay=0.8,
        max_endpointing_delay=3.0,
    )

    # Listen for agent session errors
    tts_failure_notified = False

    @session.on("error")
    def on_session_error(error: Exception):
        nonlocal tts_failure_notified
        error_msg = str(error)
        logger.warning("Agent session error: %s", error_msg)

        # Detect TTS quota/credit exhaustion
        is_tts_error = "TTSError" in error_msg or "tts_error" in error_msg
        is_quota = "no audio frames" in error_msg or "quota" in error_msg.lower() or "credit" in error_msg.lower()

        if is_tts_error and not tts_failure_notified:
            tts_failure_notified = True
            if is_quota:
                logger.error("ElevenLabs credits exhausted — TTS will not work")
            else:
                logger.error("TTS synthesis error — agent cannot speak")
            asyncio.create_task(_notify_agent_status(session_id, "tts_error"))
        else:
            asyncio.create_task(_notify_agent_status(session_id, "error"))

    # Track interruptions
    @session.on("agent_speech_interrupted")
    def on_agent_interrupted():
        nonlocal interruption_count
        interruption_count += 1
        interrupter = next(iter(participants.values()), "Someone")
        logger.info("Agent interrupted by %s (total: %d)", interrupter, interruption_count)
        asyncio.create_task(
            post_message(
                session_id,
                f"{interrupter} interrupted AI Facilitator",
                message_type="voice_ai",
                speaker_name=speaker_label,
            )
        )

    # Track speaking stats per participant. Built up by on_user_input_transcribed.
    speaking_stats: dict[str, dict] = {}  # speaker_name → {messages, words}

    full_prompt = build_system_prompt(
        blueprint, history, ai_config, vocabulary_terms=vocab_terms,
        participants=participants, speaking_stats=speaking_stats,
        coverage=coverage, reactions=recent_reactions,
        runtime_state=pace_runtime_state,
        screen_vision=screen_vision_state.enabled,
    )
    agent = FacilitatorAgent(
        instructions=full_prompt,
        involvement_state=involvement_state,
        screen_vision_state=screen_vision_state,
    )

    # Track conversation for blueprint extraction
    conversation_buffer: list[dict] = list(history)  # Start with existing history
    extraction_debounce: asyncio.Task | None = None
    ai_response_count = 0
    interruption_count = 0
    call_start = asyncio.get_event_loop().time()

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(ev: UserInputTranscribedEvent):
        if not ev.is_final:
            return
        transcript = ev.transcript.strip()
        if not transcript:
            return

        speaker = _resolve_speaker(ev.speaker_id)
        logger.info("User speech: %r from %s (speaker_id=%s)", transcript, speaker, ev.speaker_id)

        # Post immediately — no LLM enhancement for live calls (latency-sensitive)
        # STT keyterm boosting and vocabulary corrections handle accuracy at the STT level
        asyncio.create_task(
            _append_to_buffer({"message_type": "chat", "speaker_name": speaker, "content": transcript})
        )
        asyncio.create_task(post_message(session_id, transcript, message_type="voice_chat", speaker_name=speaker))

        # Track speaking stats
        if speaker not in speaking_stats:
            speaking_stats[speaker] = {"messages": 0, "words": 0}
        speaking_stats[speaker]["messages"] += 1
        speaking_stats[speaker]["words"] += len(transcript.split())

    def _resolve_speaker(speaker_id: str | None) -> str:
        """Map Deepgram speaker_id to participant name."""
        # If only one participant, always use their name
        if len(participants) == 1:
            return next(iter(participants.values()))

        if not speaker_id:
            # No diarization — fall back to first participant
            return next(iter(participants.values()), "Participant")

        # Check if we've already mapped this speaker_id
        if speaker_id in speaker_id_map:
            identity = speaker_id_map[speaker_id]
            return participants.get(identity, identity)

        # Map speaker_id to participant by join order (speaker 0 = first joiner, etc.)
        try:
            idx = int(speaker_id)
            if 0 <= idx < len(participant_order):
                identity = participant_order[idx]
                speaker_id_map[speaker_id] = identity
                logger.info("Mapped speaker_id %s → %s (%s)", speaker_id, identity, participants.get(identity))
                return participants.get(identity, identity)
        except (ValueError, IndexError):
            pass

        # Fallback: assign to next unmapped participant
        mapped_identities = set(speaker_id_map.values())
        for identity in participant_order:
            if identity not in mapped_identities:
                speaker_id_map[speaker_id] = identity
                logger.info("Mapped speaker_id %s → %s (fallback)", speaker_id, participants.get(identity))
                return participants.get(identity, identity)

        return next(iter(participants.values()), "Participant")

    # Posted-text dedup, restored from persisted runtime state so a restart
    # doesn't cause the agent to re-post earlier replies as if new.
    posted_texts: set[str] = set(persisted_state.get("posted_texts") or [])

    @session.on("conversation_item_added")
    def on_conversation_item_added(ev: ConversationItemAddedEvent):
        nonlocal extraction_debounce
        item = ev.item
        logger.info(">>> conversation_item_added fired: role=%s type=%s", getattr(item, "role", "?"), type(item).__name__)
        if not hasattr(item, "role") or item.role != "assistant":
            return
        # Prefer item.transcript when present (Agents 1.x sets this on truncated/interrupted items
        # to reflect what was actually spoken) and fall back to the raw LLM text fields.
        text = (
            getattr(item, "transcript", None)
            or getattr(item, "text_content", None)
            or getattr(item, "text", None)
            or getattr(item, "content", None)
            or ""
        )
        if isinstance(text, list):
            text = " ".join(str(t) for t in text)
        text = strip_markdown(str(text)).strip()
        logger.info(">>> Assistant text (len=%d): %r", len(text), text[:200])
        if not text or text in posted_texts:
            logger.info(">>> Skipping: empty=%s, duplicate=%s", not text, text in posted_texts)
            return
        posted_texts.add(text)
        logger.info("Agent response: %r", text[:120])
        asyncio.create_task(
            _append_to_buffer({"message_type": "ai", "speaker_name": speaker_label, "content": text})
        )
        asyncio.create_task(post_message(session_id, text, message_type="voice_ai", speaker_name=speaker_label))
        nonlocal ai_response_count, suggestion_sent_for, pace_runtime_state
        ai_response_count += 1

        # Pace counter: increment for the currently-active persona. The next
        # prompt refresh (extraction / blueprint event / roster change) picks
        # up the new count via build_system_prompt and surfaces the pace block.
        try:
            from app.services.pace import record_agent_reply as _record_pace_reply

            pace_runtime_state = _record_pace_reply(
                pace_runtime_state, ai_config.get("persona", "default"), text
            )
        except Exception as e:
            logger.debug("pace counter update skipped: %s", e)

        # Detect persona switch recommendation — if the agent mentions another
        # persona by name, fire a suggestion popup for the user to accept
        text_lower = text.lower()
        current_persona = ai_config.get("persona", "default")
        # Hard-exclude personas that have already been active this session.
        # persona_history is the canonical source (written by services.pace
        # whenever active_persona flips); falls back to {} for fresh sessions.
        history_used = set(pace_runtime_state.get("persona_history") or [])
        logger.info(
            ">>> Checking persona mention: current=%s, suggestion_sent_for=%s, history_used=%s",
            current_persona, suggestion_sent_for, history_used,
        )
        logger.info(">>> Text to scan: %r", text_lower[:200])
        for p_id, p_label in PERSONA_LABELS.items():
            label_lower = p_label.lower()
            in_text = label_lower in text_lower
            already_used = p_id in history_used
            logger.info(
                ">>>   %s (%s): in_text=%s, is_current=%s, already_suggested=%s, in_history=%s",
                p_label, p_id, in_text, p_id == current_persona, suggestion_sent_for == p_id, already_used,
            )
            if (
                p_id != current_persona
                and in_text
                and suggestion_sent_for != p_id
                and not already_used
            ):
                suggestion_sent_for = p_id
                p_gaps = PERSONA_FOCUS_SECTIONS.get(p_id, [])
                gap_labels = [SECTION_LABELS.get(s, s) for s in p_gaps[:3]]
                logger.info(">>> FIRING persona suggestion: %s (%s) reason=%s", p_label, p_id, gap_labels)
                asyncio.create_task(post_persona_suggestion(
                    session_id,
                    persona=p_id,
                    label=p_label,
                    reason=f"to cover {', '.join(gap_labels)}",
                ))
                break
            elif p_id != current_persona and in_text and already_used:
                logger.info(">>> Persona %s already used this session — chip suppressed", p_label)
            elif p_id != current_persona and in_text and suggestion_sent_for == p_id:
                logger.info(">>> Persona %s already suggested, skipping", p_label)

        # Debounced extraction — wait 3s after last agent response before extracting
        if extraction_debounce and not extraction_debounce.done():
            extraction_debounce.cancel()
        extraction_debounce = asyncio.create_task(_debounced_extraction())

    async def _debounced_extraction():
        """Wait 3s then run extraction — cancelled if new response arrives."""
        await asyncio.sleep(3)
        await _run_extraction()

    suggestion_sent_for: str | None = None  # Track which persona we already suggested
    current_persona = ai_config.get("persona", "default")

    # Serialize extractions: two debounced extractions in flight could
    # otherwise produce out-of-order writes (older completes second and
    # clobbers newer). Combined with `last_extracted_idx`, each extraction
    # only processes the new conversation slice — no double-extracting the
    # same snippet across runs.
    extraction_lock = asyncio.Lock()
    # Restore from persisted state so a restart doesn't re-extract messages
    # that were already processed before the worker died. Clamp to the
    # current buffer length in case the buffer ended up shorter.
    _persisted_idx = persisted_state.get("last_extracted_idx")
    if isinstance(_persisted_idx, int) and 0 <= _persisted_idx <= len(conversation_buffer):
        last_extracted_idx = _persisted_idx
    else:
        last_extracted_idx = len(conversation_buffer)

    # Cap the buffer so a multi-hour session can't grow it unbounded. Before
    # evicting old messages we force a final extraction on the slice about
    # to be dropped — anything the user said early in the call still ends
    # up in the blueprint instead of vanishing once it scrolls out.
    BUFFER_CAP = 500
    BUFFER_TRIM_TO = 300
    buffer_trim_lock = asyncio.Lock()

    async def _append_to_buffer(entry: dict) -> None:
        nonlocal last_extracted_idx
        conversation_buffer.append(entry)
        if len(conversation_buffer) <= BUFFER_CAP:
            return
        # Serialize trim attempts so concurrent appends crossing the cap
        # don't double-evict.
        async with buffer_trim_lock:
            if len(conversation_buffer) <= BUFFER_CAP:
                return  # someone else trimmed already
            # Flush anything not yet extracted before we trim.
            if last_extracted_idx < len(conversation_buffer):
                try:
                    await _run_extraction()
                except Exception as e:
                    logger.warning("Flush-before-evict extraction failed: %s", e)
            excess = len(conversation_buffer) - BUFFER_TRIM_TO
            if excess > 0:
                del conversation_buffer[:excess]
                last_extracted_idx = max(0, last_extracted_idx - excess)
                logger.info(
                    "Conversation buffer trimmed by %d (now %d, last_extracted_idx=%d)",
                    excess,
                    len(conversation_buffer),
                    last_extracted_idx,
                )

    async def _run_extraction():
        """Fetch current blueprint, extract new info, detect persona changes, refresh instructions."""
        nonlocal current_persona, speaker_label, last_extracted_idx, pace_runtime_state, suggestion_sent_for
        async with extraction_lock:
            try:
                await _notify_agent_status(session_id, "extracting")
                meta = await get_blueprint_meta(session_id)
                current_bp = meta.get("content") or {}
                base_version = meta.get("version_number")

                # Slice from last_extracted_idx to the current end of the
                # buffer. Subsequent extractions only see new messages.
                buffer_end = len(conversation_buffer)
                slice_ = conversation_buffer[last_extracted_idx:buffer_end]
                if slice_:
                    await extract_and_update_blueprint(
                        session_id, slice_, current_bp, base_version=base_version,
                    )
                last_extracted_idx = buffer_end

                # Re-fetch config — persona/assertiveness/voice/involvement may have changed
                fresh_config = await get_voice_config(session_id)
                new_persona = fresh_config.get("persona", "default")

                # Detect persona switch mid-call
                if new_persona != current_persona:
                    old_label = PERSONA_LABELS.get(current_persona, current_persona)
                    new_label = PERSONA_LABELS.get(new_persona, new_persona)
                    logger.info("Persona changed mid-call: %s → %s", old_label, new_label)
                    current_persona = new_persona
                    ai_config.update(fresh_config)
                    speaker_label = new_label
                    involvement_state.persona_label = new_label

                    # Pace counters: zero out the incoming persona so they get
                    # their full question budget instead of starting partway in.
                    # record_active_persona also appends to persona_history so
                    # the next handoff suggestion (chat or voice) won't
                    # re-pitch the persona we're leaving.
                    try:
                        from app.services.pace import (
                            record_active_persona as _record_active_switch,
                        )
                        from app.services.pace import (
                            reset_persona_stats as _reset_pace_stats_switch,
                        )

                        pace_runtime_state = _reset_pace_stats_switch(pace_runtime_state, new_persona)
                        pace_runtime_state = _record_active_switch(pace_runtime_state, new_persona)
                        # Mid-call persona swap — reset the "we already
                        # suggested X" guard so the new persona can earn
                        # its own future suggestion legitimately.
                        suggestion_sent_for = None
                    except Exception as e:
                        logger.debug("pace reset on persona switch skipped: %s", e)

                    # Update instructions FIRST so the agent is already the new persona
                    updated_bp, fresh_cov = await asyncio.gather(
                        get_blueprint(session_id),
                        get_coverage(session_id),
                    )
                    fresh_prompt = build_system_prompt(
                        updated_bp, conversation_buffer[-30:], ai_config, vocabulary_terms=vocab_terms,
                        participants=participants, speaking_stats=speaking_stats,
                        coverage=fresh_cov, reactions=recent_reactions,
                        runtime_state=pace_runtime_state,
                        screen_vision=screen_vision_state.enabled,
                    )
                    agent.update_instructions(fresh_prompt)

                    # Let the LLM generate its own greeting in the correct language
                    try:
                        session.generate_reply(
                            user_input=f"You just switched from {old_label} to {new_label}. Introduce yourself briefly as the {new_label} in 1 sentence and ask what to focus on.",
                            allow_interruptions=True,
                        )
                    except Exception as e:
                        logger.warning("Handover greeting failed: %s", e)
                else:
                    ai_config.update(fresh_config)

                # Sync involvement_state with the latest config so the gate sees fresh values.
                new_mode = ai_config.get("involvement", INVOLVEMENT_DEFAULT)
                if new_mode not in INVOLVEMENT_VALID:
                    new_mode = INVOLVEMENT_DEFAULT
                if new_mode != involvement_state.mode:
                    logger.info("Involvement mode changed: %s → %s", involvement_state.mode, new_mode)
                    involvement_state.mode = new_mode
                involvement_state.paused_until = _parse_paused_until(ai_config.get("paused_until"))

                # One-shot summon: if the user clicked "Ask Agent" or ran /ask, the
                # backend writes pending_one_shot into ai_config. We trigger an
                # explicit reply that bypasses the involvement gate.
                pending = ai_config.get("pending_one_shot")
                if pending:
                    await _consume_one_shot(pending)

                # Refresh agent instructions with latest coverage + config
                updated_bp, fresh_cov = await asyncio.gather(
                    get_blueprint(session_id),
                    get_coverage(session_id),
                )
                fresh_prompt = build_system_prompt(
                    updated_bp, conversation_buffer[-30:], ai_config, vocabulary_terms=vocab_terms,
                    participants=participants, speaking_stats=speaking_stats,
                    coverage=fresh_cov, reactions=recent_reactions,
                    runtime_state=pace_runtime_state,
                    screen_vision=screen_vision_state.enabled,
                )
                agent.update_instructions(fresh_prompt)
                logger.info("Agent instructions refreshed with latest coverage")

                await _notify_agent_status(session_id, "connected")
            except Exception as e:
                logger.warning("Extraction task failed: %s", e)
                await _notify_agent_status(session_id, "connected")

    consumed_one_shots: set[str] = set()

    async def _consume_one_shot(pending: dict) -> None:
        """Trigger a single agent reply that bypasses the involvement gate."""
        if not isinstance(pending, dict):
            return
        # Honor /wait pause uniformly — if a user has explicitly paused the
        # agent (chip or slash), don't fire a queued one-shot until expiry.
        if involvement_state.paused_until and time.time() < involvement_state.paused_until:
            logger.info("Skipping one-shot summon — agent is paused")
            return
        prompt = (pending.get("prompt") or "").strip()
        token = pending.get("id") or prompt
        if not prompt or token in consumed_one_shots:
            return
        # Best-effort expiry check — if the backend wrote an `expires` epoch, ignore stale.
        expires = pending.get("expires")
        if isinstance(expires, (int, float)) and expires and time.time() > float(expires):
            return
        consumed_one_shots.add(token)
        involvement_state.force_next_reply = True
        try:
            session.generate_reply(user_input=prompt, allow_interruptions=True)
            logger.info("One-shot summon fired (mode=%s)", involvement_state.mode)
        except Exception as e:
            logger.warning("One-shot summon failed: %s", e)
            involvement_state.force_next_reply = False

    async def _refresh_prompt_for_roster_change():
        """Rebuild instructions when participants join/leave so ROOM block is current."""
        try:
            updated_bp, fresh_cov = await asyncio.gather(
                get_blueprint(session_id),
                get_coverage(session_id),
            )
            fresh_prompt = build_system_prompt(
                updated_bp, conversation_buffer[-30:], ai_config, vocabulary_terms=vocab_terms,
                participants=participants, speaking_stats=speaking_stats,
                coverage=fresh_cov, reactions=recent_reactions,
                runtime_state=pace_runtime_state,
                screen_vision=screen_vision_state.enabled,
            )
            agent.update_instructions(fresh_prompt)
        except Exception as e:
            logger.warning("Roster-change prompt refresh failed: %s", e)

    # Coalesce rapid blueprint events so a burst of saves only triggers one
    # re-fetch instead of N. The first event sets the flag, the handler
    # debounces ~200ms then refreshes once.
    _bp_refresh_pending: asyncio.Task | None = None

    async def _on_blueprint_event(payload: dict) -> None:
        """Called on every backend ``blueprint_update`` (own writes + user edits).

        The agent now sees the user's manual section edits the moment they
        save, so it stops contradicting the UI by claiming sections are
        empty when they're not.
        """
        nonlocal _bp_refresh_pending
        if _bp_refresh_pending and not _bp_refresh_pending.done():
            return  # already scheduled

        async def _do_refresh():
            try:
                await asyncio.sleep(0.2)
                updated_bp, fresh_cov = await asyncio.gather(
                    get_blueprint(session_id),
                    get_coverage(session_id),
                )
                fresh_prompt = build_system_prompt(
                    updated_bp,
                    conversation_buffer[-30:],
                    ai_config,
                    vocabulary_terms=vocab_terms,
                    participants=participants,
                    speaking_stats=speaking_stats,
                    coverage=fresh_cov,
                    reactions=recent_reactions,
                    runtime_state=pace_runtime_state,
                    screen_vision=screen_vision_state.enabled,
                )
                agent.update_instructions(fresh_prompt)
                logger.info(
                    "Prompt refreshed from blueprint event (section=%s, source=%s, v=%s)",
                    payload.get("section"),
                    payload.get("source", "agent"),
                    payload.get("version"),
                )
            except Exception as e:
                logger.warning("Blueprint-event prompt refresh failed: %s", e)

        _bp_refresh_pending = asyncio.create_task(_do_refresh())

    blueprint_subscriber_task = asyncio.create_task(
        subscribe_blueprint_events(session_id, _on_blueprint_event)
    )

    def _snapshot_runtime_state() -> dict:
        """Capture the bits of in-memory state that don't survive a restart."""
        # posted_texts can grow unbounded; cap the persisted slice so the
        # state column doesn't bloat. The dedup goal is just "don't double-
        # post the agent's last few responses", so the most recent N suffice.
        recent_posted = list(posted_texts)[-200:] if posted_texts else []
        return {
            "speaker_id_map": dict(speaker_id_map),
            "participant_order": list(participant_order),
            "posted_texts": recent_posted,
            "last_extracted_idx": last_extracted_idx,
            "current_persona": current_persona,
            # Pace counters (src.app.services.pace) — preserve so a worker
            # restart doesn't reset the budget mid-call.
            "persona_stats": dict(pace_runtime_state.get("persona_stats") or {}),
            "active_persona": pace_runtime_state.get("active_persona"),
        }

    async def _persist_runtime_state() -> None:
        await save_agent_runtime_state(session_id, _snapshot_runtime_state())

    async def _runtime_state_loop() -> None:
        """Checkpoint every 30s while the agent is alive."""
        try:
            while True:
                await asyncio.sleep(30)
                await _persist_runtime_state()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.debug("Runtime state loop ended: %s", e)

    runtime_state_task = asyncio.create_task(_runtime_state_loop())

    detach_started = False

    async def _handle_detach(say_goodbye: bool) -> None:
        """Graceful agent detach: flush pending state, speak goodbye, then shut down.

        Triggered by an `agent_control` data message from the backend. Each step
        is wrapped so a single failure can't block the rest — the agent must end
        up disconnected even if TTS or the backend is unreachable.
        """
        nonlocal extraction_debounce
        _DETACHED_SESSIONS.add(session_id)
        logger.info("Detach signal received (say_goodbye=%s)", say_goodbye)

        try:
            await _notify_agent_status(session_id, "detaching")
        except Exception as e:
            logger.debug("notify detaching failed: %s", e)

        # Flush any pending blueprint extraction so the tail of the conversation
        # isn't lost. Cancel the debounce sleep, then run extraction directly.
        try:
            if extraction_debounce and not extraction_debounce.done():
                extraction_debounce.cancel()
                try:
                    await extraction_debounce
                except (asyncio.CancelledError, Exception):
                    pass
            await _run_extraction()
        except Exception as e:
            logger.warning("Final extraction during detach failed: %s", e)

        # Stop the blueprint event subscriber so the WS connection closes cleanly.
        try:
            if not blueprint_subscriber_task.done():
                blueprint_subscriber_task.cancel()
                try:
                    await blueprint_subscriber_task
                except (asyncio.CancelledError, Exception):
                    pass
        except Exception as e:
            logger.debug("Subscriber cancel failed: %s", e)

        # Final runtime-state save before the worker exits — the periodic
        # loop only fires every 30s, so we'd otherwise lose the last window.
        try:
            if not runtime_state_task.done():
                runtime_state_task.cancel()
                try:
                    await runtime_state_task
                except (asyncio.CancelledError, Exception):
                    pass
            await _persist_runtime_state()
        except Exception as e:
            logger.debug("Final runtime-state save failed: %s", e)

        if say_goodbye:
            farewell = "Stepping out — call me back any time."
            if language != "en":
                lang_name = LANGUAGE_NAMES.get(language, language)
                try:
                    from app.services.ai_provider import get_ai_client_for_role

                    translate_client = await get_ai_client_for_role(
                        org_id=None, db=None, role="agent_translate"
                    )
                    translated = await translate_client.chat(
                        messages=[{
                            "role": "user",
                            "content": (
                                f"Translate to {lang_name}. Return ONLY the translated "
                                f"text, nothing else:\n\n{farewell}"
                            ),
                        }],
                        max_tokens=80,
                    )
                    translated = translated.strip()
                    if translated:
                        farewell = translated
                except Exception as e:
                    logger.warning("Failed to translate goodbye to %s: %s", language, e)
            # Pre-add to dedup set so the conversation_item_added listener
            # doesn't re-post the same line via its own asyncio.create_task.
            # Mirrors the greeting flow at the post-greeting site.
            posted_texts.add(farewell)
            try:
                await asyncio.wait_for(
                    session.say(farewell, allow_interruptions=False),
                    timeout=4.0,
                )
                await post_message(
                    session_id, farewell, message_type="voice_ai", speaker_name=speaker_label
                )
            except Exception as e:
                logger.warning("Goodbye TTS failed (continuing detach): %s", e)

        try:
            await _notify_agent_status(session_id, "detached")
        except Exception as e:
            logger.debug("notify detached failed: %s", e)

        # Stop screen-frame consumers — same cancel as room-empty shutdown, or
        # a VideoStream leaks across the detach.
        _cancel_vision_tasks()

        # Tear down the Tavus avatar session so we stop billing on detach.
        try:
            avatar_session = avatar_state.get("session")
            if avatar_session is not None:
                await avatar_session.aclose()
                avatar_state["session"] = None
                logger.info("Tavus avatar session closed during detach")
        except Exception as e:
            logger.warning("Tavus avatar teardown failed: %s", e)

        try:
            ctx.shutdown(reason="detached")
        except Exception as e:
            logger.warning("ctx.shutdown raised during detach: %s", e)

    # ── Tavus video avatar wiring ────────────────────────────────────────
    # The avatar plugin intercepts the agent's TTS audio and publishes a
    # lip-synced video track into this LiveKit room. Per-session toggles
    # (set_camera) start/stop the Tavus session entirely so we don't burn
    # credits while the camera is off.
    avatar_cfg = ai_config.get("video_avatar") if isinstance(ai_config, dict) else None
    avatar_state: dict[str, object | None] = {"session": None, "cfg": avatar_cfg}

    async def _start_avatar() -> None:
        if avatar_state.get("session") is not None:
            return
        cfg = avatar_state.get("cfg")
        if not (cfg and isinstance(cfg, dict) and cfg.get("provider") == "tavus" and cfg.get("replica_id")):
            return
        if not HAS_TAVUS or tavus_plugin is None:
            logger.warning("Tavus plugin unavailable — skipping avatar (TAVUS_API_KEY missing?)")
            return
        try:
            session_kwargs: dict = {"replica_id": cfg["replica_id"]}
            # Pin to a Tavus persona that has tts_engine=elevenlabs + our voice
            # so the audio Tavus produces (or echoes) matches studio renders.
            if cfg.get("tavus_persona_id"):
                session_kwargs["persona_id"] = cfg["tavus_persona_id"]
            avatar_session = tavus_plugin.AvatarSession(**session_kwargs)
            await avatar_session.start(session, room=ctx.room)
            avatar_state["session"] = avatar_session
            logger.info(
                "Tavus avatar started replica=%s video_avatar_id=%s",
                cfg.get("replica_id"),
                cfg.get("id"),
            )
        except Exception as e:
            logger.warning("Tavus avatar start failed: %s", e)

    async def _stop_avatar() -> None:
        avatar_session = avatar_state.get("session")
        if avatar_session is None:
            return
        try:
            await avatar_session.aclose()
            logger.info("Tavus avatar stopped (camera off)")
        except Exception as e:
            logger.warning("Tavus avatar stop failed: %s", e)
        finally:
            avatar_state["session"] = None

    async def _swap_avatar() -> None:
        """Re-resolve ai_config and rebuild BOTH the Tavus avatar AND the
        agent's TTS so the next utterance speaks in the new character's voice.

        Tavus runs in echo mode — the audio you hear in the call is whatever
        our worker's TTS produces, with Tavus only providing lip-synced video
        on top. So changing the avatar without changing the TTS leaves the
        old voice playing through new lips. We swap both together.
        """
        try:
            fresh = await get_voice_config(session_id)
        except Exception as e:
            logger.warning("swap_avatar: failed to refetch ai_config: %s", e)
            return
        if not isinstance(fresh, dict):
            return

        # 1. Rebuild the agent's TTS with the new character's voice. The
        #    framework reads agent_session.tts per utterance, so mutating
        #    the private attribute here cleanly hands the next utterance off
        #    to the new voice. In-flight speech keeps the old voice until it
        #    finishes (~1-2s).
        new_voice_id = fresh.get("voice_id")
        new_speed = float(fresh.get("speed") or 1.0)
        new_emotion = fresh.get("emotion")
        if new_voice_id:
            try:
                new_tts = _create_tts(new_voice_id, new_speed, new_emotion)
                session._tts = new_tts  # noqa: SLF001 — framework lacks a public setter
                logger.info("Agent TTS swapped: voice_id=%s", new_voice_id)
            except Exception as e:
                logger.warning("TTS swap failed: %s", e)
        else:
            # ai-config returned no voice_id — TTS is NOT swapped, so the
            # call audio will keep using whatever was set at session start.
            # Surface this loudly because it almost always means the
            # character/persona row in the DB is missing voice_id.
            logger.warning(
                "swap_avatar: ai-config returned no voice_id; TTS NOT swapped "
                "(audio will not match the new avatar). video_avatar=%s",
                fresh.get("video_avatar"),
            )

        # 2. Rebuild the Tavus avatar (lip-synced video) with the new replica
        #    + persona_id pinning the matching ElevenLabs voice.
        new_cfg = fresh.get("video_avatar")
        avatar_state["cfg"] = new_cfg
        await _stop_avatar()
        if not bool(fresh.get("agent_camera_off", True)):
            await _start_avatar()
        logger.info(
            "Avatar swapped: replica=%s persona_id=%s",
            (new_cfg or {}).get("replica_id") if isinstance(new_cfg, dict) else None,
            (new_cfg or {}).get("tavus_persona_id") if isinstance(new_cfg, dict) else None,
        )

    async def _post_steer_note(text: str) -> None:
        try:
            await post_message(session_id, text, message_type="system", speaker_name="System")
        except Exception as e:
            logger.warning("post_steer_note failed: %s", e)

    @ctx.room.on("data_received")
    def _on_room_data(packet: rtc.DataPacket):
        nonlocal detach_started
        topic = packet.topic
        # Agent's own identity — used to skip echoes of our own publishes.
        try:
            agent_identity = ctx.room.local_participant.identity
        except Exception:
            agent_identity = None
        if topic == "agent_control":
            try:
                msg = json.loads(packet.data.decode())
            except Exception:
                return
            action = msg.get("action")
            if action == "detach" and not detach_started:
                detach_started = True
                say_goodbye = bool(msg.get("say_goodbye", True))
                asyncio.create_task(_handle_detach(say_goodbye))
                return
            if action == "set_camera":
                if bool(msg.get("enabled", True)):
                    asyncio.create_task(_start_avatar())
                else:
                    asyncio.create_task(_stop_avatar())
            if action == "swap_avatar":
                asyncio.create_task(_swap_avatar())
            return

        if topic == "screen_draw":
            # The user drew a pen stroke on the shared-screen tile. Store recent
            # strokes; the agent composites them onto the next frame it sends to
            # Claude so the model sees exactly what was highlighted.
            try:
                event = json.loads(packet.data.decode())
            except Exception as e:
                logger.warning("Failed to decode screen_draw packet: %s", e)
                return
            if agent_identity and event.get("from") == agent_identity:
                return
            payload = event.get("payload") or {}
            raw_points = (payload.get("points") or [])[:SCREEN_MAX_STROKE_POINTS]
            now = time.time()
            points = [
                {"x": max(0.0, min(1.0, float(p["x"]))), "y": max(0.0, min(1.0, float(p["y"])))}
                for p in raw_points
                if isinstance(p, dict) and isinstance(p.get("x"), (int, float)) and isinstance(p.get("y"), (int, float))
            ]
            if points:
                screen_vision_state.annotations.append({"points": points, "ts": now})
                # Bound memory: keep only recent strokes.
                screen_vision_state.annotations = _recent_annotations(screen_vision_state.annotations, now)
                logger.info("Screen draw from %s (%d points)", event.get("from"), len(points))
            return

        if topic in ("agent_steering", "hands", "reactions"):
            try:
                event = json.loads(packet.data.decode())
            except Exception as e:
                logger.warning("Failed to decode %s packet: %s", topic, e)
                return
            # Defensive: skip echoes of the agent's own publishes. Compare
            # against the agent's local participant identity (computed above),
            # NOT the first remote user — `participant` would be the human who
            # joined first, so matching against it would silently drop every
            # event that human sends.
            if agent_identity and event.get("from") == agent_identity:
                return
            logger.info(
                "Room data received: topic=%s type=%s from=%s",
                topic, event.get("type"), event.get("from"),
            )
            if topic == "agent_steering":
                asyncio.create_task(
                    _handle_steering(event, session, involvement_state, _post_steer_note)
                )
            elif topic == "hands":
                asyncio.create_task(_handle_hand(event, session, involvement_state))
            elif topic == "reactions":
                asyncio.create_task(
                    _handle_reaction(
                        event,
                        recent_reactions,
                        participants,
                        session=session,
                        involvement_state=involvement_state,
                        ack_state=reaction_ack_state,
                    )
                )
            return

    # NOTE: do NOT pass `audio_enabled=False` via the deprecated
    # RoomInputOptions. In livekit-agents 1.4.x, `_create_from_legacy`
    # translates audio_enabled=False to `opts.audio_input = False`
    # (literal bool, not an AudioInputOptions instance), which means
    # no AudioInput is ever wired up at all — subsequent calls to
    # `session.input.set_audio_enabled(True)` warn "Cannot enable
    # audio input when it's not set" and STT silently never receives
    # mic audio. Symptom: user hears greeting, then nothing the user
    # says is ever transcribed. Use RoomOptions (defaults to a real
    # AudioInputOptions) and toggle via set_audio_enabled below.
    await session.start(
        agent,
        room=ctx.room,
        room_options=RoomOptions(close_on_disconnect=False),
    )
    # Gate the user mic until the greeting finishes — works because
    # AudioInput is now properly initialized. Re-enabled below once
    # session.say(greeting) playout completes. Track success so we don't
    # (a) log a misleading "audio gated" message when the call actually
    # raised, leaving the user free to talk over the greeting with no
    # diagnostic, or (b) call set_audio_enabled(True) later on an input
    # that was never gated in the first place.
    audio_input_gated = False
    try:
        session.input.set_audio_enabled(False)
        audio_input_gated = True
    except Exception:
        logger.warning("voice_agent_audio_gate_failed", exc_info=True)
    if audio_input_gated:
        logger.info("Agent started — greeting first, user audio gated until greeting ends")
    else:
        logger.info("Agent started — greeting first (user audio NOT gated — gating failed)")

    # Start the Tavus avatar after the agent session is live so the audio
    # subscription captures TTS output. Default OFF — Tavus first-frame
    # latency (~500ms) makes the avatar visibly trail audio + transcript on
    # join. Users opt in via the in-call camera toggle.
    if not bool(ai_config.get("agent_camera_off", True)):
        await _start_avatar()

    # Context-aware greeting
    first_name = participant.name or participant.identity or "there"
    if has_history and filled_sections:
        filled_str = ", ".join(filled_sections[:3])
        more = f" and {len(filled_sections) - 3} more" if len(filled_sections) > 3 else ""
        if next_section_label:
            greeting = (
                f"Welcome back {first_name}. So far we've covered {filled_str}{more}. "
                f"Next up is {next_section_label} — {next_section_question}"
            )
        else:
            greeting = (
                f"Welcome back {first_name}. All blueprint sections are filled. "
                f"Review the blueprint panel and click Complete and Generate Board when you're ready."
            )
    elif has_history:
        if next_section_label:
            greeting = (
                f"Welcome back {first_name}. Let's continue — "
                f"I need to capture {next_section_label}. {next_section_question}"
            )
        else:
            greeting = f"Welcome back {first_name}. Let's continue where we left off."
    else:
        greeting = (
            f"Hi {first_name}, I'm your AI planning facilitator. "
            f"I'll guide you through 10 key areas to build a complete project blueprint. "
            f"Let's start — what are you building?"
        )

    # Translate greeting if language is not English
    if language != "en":
        language_name = LANGUAGE_NAMES.get(language, language)
        try:
            from app.services.ai_provider import get_ai_client_for_role

            translate_client = await get_ai_client_for_role(
                org_id=None, db=None, role="agent_translate"
            )
            translated = await translate_client.chat(
                messages=[{
                    "role": "user",
                    "content": (
                        f"Translate the following greeting to {language_name}. "
                        f"Return ONLY the translated text, nothing else:\n\n{greeting}"
                    ),
                }],
                max_tokens=200,
            )
            translated = translated.strip()
            if translated:
                greeting = translated
                logger.info("Greeting translated to %s", language_name)
        except Exception as e:
            logger.warning("Failed to translate greeting to %s: %s", language_name, e)

    # Skip voice greeting if chat already has a recent AI message (avoid duplicate welcome)
    from datetime import UTC, datetime

    recent_ai = False
    for msg in reversed(history):
        if msg.get("message_type") in ("ai", "voice_ai"):
            created = msg.get("created_at", "")
            try:
                msg_time = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if (datetime.now(UTC) - msg_time).total_seconds() < 15:
                    recent_ai = True
            except (ValueError, TypeError):
                pass
            break

    speech_handle = None
    if not recent_ai:
        posted_texts.add(greeting)
        try:
            # Schedule the greeting (returns immediately; playback runs async).
            speech_handle = session.say(greeting, allow_interruptions=True)
        except Exception as e:
            logger.warning("TTS greeting failed (agent stays connected): %s", e)
            speech_handle = None
            # Still post the text so the user knows the agent tried
            await post_message(session_id, greeting, message_type="voice_ai", speaker_name=speaker_label)
    else:
        logger.info("Skipping voice greeting — recent AI message in chat")

    # Notify "ready" as soon as the greeting is in flight — this stops the
    # ringtone on the FE without waiting for the full ~5-15s playout. The
    # user-mic gate (audio_enabled=False) still prevents interruptions until
    # playback completes, so the UX guarantee holds.
    await _notify_agent_status(session_id, "ready")
    await _notify_agent_status(session_id, "connected")

    # Wait for the greeting to fully play out, then post the transcript
    # (lands with audio rather than ahead of TTS) and unmute the user.
    if speech_handle is not None:
        try:
            await speech_handle.wait_for_playout()
        except Exception as e:
            logger.warning("Greeting playout wait failed: %s", e)
        await post_message(session_id, greeting, message_type="voice_ai", speaker_name=speaker_label)
    # Only re-enable if we actually gated it earlier — otherwise we'd be
    # toggling an input the library left untouched, which is at best a
    # no-op and at worst the same "Cannot enable audio input when it's
    # not set" no-op-with-warning that this PR's RoomOptions fix exists
    # to avoid in the first place.
    if audio_input_gated:
        try:
            session.input.set_audio_enabled(True)
        except Exception as e:
            logger.warning("Failed to re-enable user audio input: %s", e)

    async def _shutdown_now():
        logger.info("Room empty — closing agent session immediately")
        _cancel_vision_tasks()
        try:
            await session.aclose()
        except Exception as e:
            logger.warning("session.aclose() failed: %s", e)
        try:
            ctx.shutdown(reason="all_participants_left")
        except Exception as e:
            logger.warning("ctx.shutdown() failed: %s", e)

    @ctx.room.on("participant_connected")
    def on_participant_connected(new_participant: rtc.RemoteParticipant):
        # Skip agent participants (don't greet ourselves or other agents)
        if new_participant.identity.startswith("agent") or new_participant.kind == 1:
            return
        name = new_participant.name or new_participant.identity or "someone"
        participants[new_participant.identity] = name
        if new_participant.identity not in participant_order:
            participant_order.append(new_participant.identity)
        logger.info("New participant connected: %s (total: %s)", name, len(participants))
        asyncio.create_task(_refresh_prompt_for_roster_change())

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(left_participant: rtc.RemoteParticipant):
        name = left_participant.name or left_participant.identity or "someone"
        participants.pop(left_participant.identity, None)
        logger.info("Participant disconnected: %s (remaining: %s)", name, len(participants))

        # Post session summary when all participants leave
        if len(participants) == 0 and speaking_stats:
            asyncio.create_task(_post_call_summary())
        elif len(participants) > 0:
            asyncio.create_task(_refresh_prompt_for_roster_change())

        # Once the last human leaves, shut the agent down immediately — no
        # grace period. A brief refresh + rejoin would otherwise land inside
        # the grace window and reuse the same stale AgentSession, which is
        # what produced "agent still speaking after I left" reports. If the
        # user reconnects, LiveKit will dispatch a fresh agent for the new
        # session.
        if len(participants) == 0:
            asyncio.create_task(_shutdown_now())

    async def _post_call_summary():
        """Post speaking stats summary to chat when the call ends."""
        elapsed = asyncio.get_event_loop().time() - call_start
        mins = int(elapsed // 60)
        secs = int(elapsed % 60)

        lines = [f"Call ended ({mins}m {secs}s)"]
        for speaker, stats in sorted(speaking_stats.items(), key=lambda x: x[1]["words"], reverse=True):
            lines.append(f"  {speaker}: {stats['messages']} messages, ~{stats['words']} words")
        lines.append(f"  AI Facilitator: {ai_response_count} responses")
        if interruption_count:
            lines.append(f"  Interruptions: {interruption_count}")

        summary = "\n".join(lines)
        logger.info("Call summary:\n%s", summary)
        await post_message(session_id, summary, message_type="system", speaker_name="System")


def _agent_name() -> str:
    """Per-worktree agent identity. scripts/worktree/setup.sh writes
    AGENT_NAME=planning-facilitator-<slug> so multiple worktrees never compete
    for the same LiveKit dispatches (LiveKit round-robins across workers
    sharing a name). Main repo / prod inherit the default."""
    return os.getenv("AGENT_NAME", "planning-facilitator")


async def _request_fnc(req):
    """Only accept jobs explicitly dispatched with our agent name."""
    expected = _agent_name()
    if req.agent_name == expected:
        logger.info("voice_agent_accepted_job room=%s", req.room.name)
        await req.accept()
    else:
        logger.info(
            "voice_agent_rejected_job agent_name=%s expected=%s",
            req.agent_name,
            expected,
        )
        await req.reject()


_REQUIRED_ENV = {
    "LIVEKIT_URL": "LiveKit server URL (local dev default: ws://localhost:7880)",
    "LIVEKIT_API_KEY": "LiveKit API key (local dev default: devkey)",
    "LIVEKIT_API_SECRET": "LiveKit API secret (local dev default: devsecret)",
    "ANTHROPIC_API_KEY": "Claude LLM key — https://console.anthropic.com",
    "DEEPGRAM_API_KEY": "Speech-to-text — https://console.deepgram.com",
    "ELEVENLABS_API_KEY": "Text-to-speech — https://elevenlabs.io",
    "BACKEND_URL": "Backend service URL (local dev default: http://localhost:8000)",
    "INTERNAL_API_SECRET": "Shared backend↔agent secret (set in .env)",
    # REDIS_URL is intentionally NOT required — _create_llm tolerates its
    # absence and falls back to Anthropic without the failover signal.
    # Treating it as required would force agents to share Redis with the
    # backend even in deployments that don't run a provider-health pipeline.
}


def _assert_required_env() -> None:
    missing = [(k, hint) for k, hint in _REQUIRED_ENV.items() if not os.getenv(k)]
    if not missing:
        return
    print()
    print("✗ Voice agent cannot start — missing required env vars:")
    print()
    for k, hint in missing:
        print(f"    {k:<22} {hint}")
    print()
    print("Add them to .env (copy missing keys from .env.example), then re-run `make agent`.")
    print()
    raise SystemExit(1)


def _log_startup_banner(ws_url: str | None, api_key: str | None, port: int) -> None:
    """One redacted line a future `tail | grep voice_agent_` can diagnose from.

    The LiveKit agents library logs its own connection retries against the
    URL but does NOT echo which URL it's using at INFO — so when a session
    fails to dispatch we used to have no way to tell whether the worker was
    even pointed at the right project.
    """
    key_short = (api_key[:4] + "…") if api_key else "<unset>"
    logger.info(
        "voice_agent_starting livekit_url=%s livekit_key=%s agent_name=%s port=%d",
        ws_url or "<unset>",
        key_short,
        _agent_name(),
        port,
    )


def main():
    _assert_required_env()

    _dsn = os.getenv("SENTRY_DSN", "")
    if _dsn:
        sentry_sdk.init(
            dsn=_dsn,
            environment=os.getenv("SENTRY_ENVIRONMENT", "development"),
            traces_sample_rate=0.1,
            send_default_pii=False,
        )
        sentry_sdk.set_tag("service", "livekit-agent")
        logger.info("Sentry initialized for agent worker")

    port = int(os.getenv("PORT", "8081"))
    ws_url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    _log_startup_banner(ws_url, api_key, port)

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            request_fnc=_request_fnc,
            agent_name=_agent_name(),
            api_key=api_key,
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
            ws_url=ws_url,
            port=port,
        ),
    )


if __name__ == "__main__":
    main()
