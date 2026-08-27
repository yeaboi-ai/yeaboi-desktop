"""Tests for screen-share vision in agent/worker.py.

Covers what the agent "sees" of a shared screen: the feature-flag resolver,
pen-stroke annotation pruning + compositing, the per-turn frame injection in
``FacilitatorAgent.on_user_turn_completed``, and the system-prompt awareness
block. Mostly pure-Python — no LiveKit room runtime — except the compositor
test, which builds a real (tiny) ``rtc.VideoFrame``.

When no annotations are present the agent attaches the raw ``rtc.VideoFrame``;
``ImageContent`` also accepts a string/data-URL, so those tests use a sentinel
data-URL as the "frame" to avoid constructing a video buffer.
"""

import time

import pytest
from livekit import rtc
from livekit.agents import StopResponse
from livekit.agents.llm import ImageContent

from agent.worker import (
    SCREEN_ANNOTATION_MAX_AGE,
    SCREEN_FRAME_MAX_AGE,
    SCREEN_INFERENCE_LONG_EDGE,
    FacilitatorAgent,
    InvolvementState,
    ScreenVisionState,
    _recent_annotations,
    _render_annotated_frame,
    _screen_vision_enabled,
    build_system_prompt,
)

FAKE_FRAME = "data:image/jpeg;base64,AAAA"


class _FakeMessage:
    """Minimal stand-in for the livekit ChatMessage passed to on_user_turn_completed."""

    def __init__(self, text: str = "what's on my screen?"):
        self.text_content = text
        self.content: list = []


def _make_agent(state: ScreenVisionState, mode: str = "driver") -> FacilitatorAgent:
    return FacilitatorAgent(
        instructions="test",
        involvement_state=InvolvementState(mode=mode),
        screen_vision_state=state,
    )


def _images(msg: _FakeMessage) -> list:
    return [c for c in msg.content if isinstance(c, ImageContent)]


def _stroke(ts: float) -> dict:
    return {"points": [{"x": 0.2, "y": 0.2}, {"x": 0.8, "y": 0.8}], "ts": ts}


# ── rtc API contract (regression guard) ──────────────────────────────
# The screen-share handlers reference these rtc members directly. A wrong name
# raises AttributeError only at runtime when a screen track appears — crashing
# the agent ("AI unavailable"). These asserts fail loudly at test time instead.


def test_rtc_screenshare_enum_exists():
    assert hasattr(rtc.TrackSource, "SOURCE_SCREENSHARE")
    assert hasattr(rtc.TrackKind, "KIND_VIDEO")
    assert hasattr(rtc.VideoBufferType, "RGBA")


def test_video_frame_event_has_frame_attr():
    from livekit.rtc.video_stream import VideoFrameEvent

    assert "frame" in VideoFrameEvent.__dataclass_fields__


# ── _screen_vision_enabled ───────────────────────────────────────────


def test_enabled_default_when_key_absent():
    assert _screen_vision_enabled({}) is True


def test_enabled_respects_per_session_opt_out():
    assert _screen_vision_enabled({"screen_vision": False}) is False
    assert _screen_vision_enabled({"screen_vision": True}) is True


def test_global_kill_switch_overrides_per_session(monkeypatch):
    # SCREEN_VISION_ENABLED=false must disable the feature regardless of the
    # per-session opt-in — otherwise the privacy kill-switch is a no-op.
    monkeypatch.setattr("agent.worker.SCREEN_VISION_ENABLED", False)
    assert _screen_vision_enabled({}) is False
    assert _screen_vision_enabled({"screen_vision": True}) is False


# ── _create_llm: visual_reasoning escalation ─────────────────────────


@pytest.mark.asyncio
async def test_visual_reasoning_high_escalates_to_sonnet(monkeypatch):
    from agent import worker

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    async def _no_snapshot(*a, **k):
        return None

    monkeypatch.setattr("src.app.services.provider_health.get", _no_snapshot, raising=False)
    captured: dict = {}
    monkeypatch.setattr(worker.anthropic, "LLM", lambda model: captured.__setitem__("model", model) or object())

    await worker._create_llm({"visual_reasoning": "high"})
    assert captured["model"] == "claude-sonnet-4-6"


@pytest.mark.asyncio
async def test_default_visual_reasoning_stays_on_haiku(monkeypatch):
    from agent import worker

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    async def _no_snapshot(*a, **k):
        return None

    monkeypatch.setattr("src.app.services.provider_health.get", _no_snapshot, raising=False)
    captured: dict = {}
    monkeypatch.setattr(worker.anthropic, "LLM", lambda model: captured.__setitem__("model", model) or object())

    await worker._create_llm({})
    assert captured["model"].startswith("claude-haiku-4-5")


# ── _recent_annotations ──────────────────────────────────────────────


def test_recent_annotations_keeps_fresh_drops_stale():
    now = 1000.0
    fresh = _stroke(now - 1)
    stale = _stroke(now - SCREEN_ANNOTATION_MAX_AGE - 1)
    kept = _recent_annotations([fresh, stale], now)
    assert kept == [fresh]


# ── _render_annotated_frame ──────────────────────────────────────────


def test_render_annotated_frame_real_frame_returns_data_url():
    frame = rtc.VideoFrame(8, 8, rtc.VideoBufferType.RGBA, bytearray(8 * 8 * 4))
    url = _render_annotated_frame(frame, [_stroke(0.0)], SCREEN_INFERENCE_LONG_EDGE)
    assert url is not None
    assert url.startswith("data:image/jpeg;base64,")


def test_render_annotated_frame_bad_frame_returns_none():
    # A non-frame object must degrade gracefully (caller falls back to raw frame).
    assert _render_annotated_frame("not-a-frame", [_stroke(0.0)], SCREEN_INFERENCE_LONG_EDGE) is None


# ── on_user_turn_completed: frame injection ──────────────────────────


@pytest.mark.asyncio
async def test_image_attached_when_sharing_and_allowed():
    state = ScreenVisionState(enabled=True, latest_frame=FAKE_FRAME, frame_ts=time.time())
    agent = _make_agent(state, mode="driver")
    msg = _FakeMessage()

    await agent.on_user_turn_completed(turn_ctx=None, new_message=msg)

    imgs = _images(msg)
    assert len(imgs) == 1
    # No annotations → raw frame attached with downsample hint.
    assert imgs[0].image == FAKE_FRAME
    assert imgs[0].inference_width == SCREEN_INFERENCE_LONG_EDGE


@pytest.mark.asyncio
async def test_annotated_image_attached_when_drawn():
    frame = rtc.VideoFrame(8, 8, rtc.VideoBufferType.RGBA, bytearray(8 * 8 * 4))
    state = ScreenVisionState(
        enabled=True,
        latest_frame=frame,
        frame_ts=time.time(),
        annotations=[_stroke(time.time())],
    )
    agent = _make_agent(state, mode="driver")
    msg = _FakeMessage()

    await agent.on_user_turn_completed(turn_ctx=None, new_message=msg)

    imgs = _images(msg)
    assert len(imgs) == 1
    # The composited frame is a JPEG data URL, not the raw VideoFrame.
    assert isinstance(imgs[0].image, str) and imgs[0].image.startswith("data:image/jpeg;base64,")
    assert any(isinstance(c, str) and "drawn on the shared screen" in c for c in msg.content)


@pytest.mark.asyncio
async def test_no_image_when_no_frame():
    state = ScreenVisionState(enabled=True, latest_frame=None)
    agent = _make_agent(state, mode="driver")
    msg = _FakeMessage()

    await agent.on_user_turn_completed(turn_ctx=None, new_message=msg)

    assert _images(msg) == []


@pytest.mark.asyncio
async def test_no_image_when_disabled():
    state = ScreenVisionState(enabled=False, latest_frame=FAKE_FRAME, frame_ts=time.time())
    agent = _make_agent(state, mode="driver")
    msg = _FakeMessage()

    await agent.on_user_turn_completed(turn_ctx=None, new_message=msg)

    assert _images(msg) == []


@pytest.mark.asyncio
async def test_no_image_in_observer_mode():
    # Observer mode suppresses the turn entirely — the gate must run BEFORE
    # injection, so no vision tokens are spent.
    state = ScreenVisionState(enabled=True, latest_frame=FAKE_FRAME, frame_ts=time.time())
    agent = _make_agent(state, mode="observer")
    msg = _FakeMessage()

    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(turn_ctx=None, new_message=msg)

    assert msg.content == []


@pytest.mark.asyncio
async def test_stale_frame_dropped():
    state = ScreenVisionState(
        enabled=True,
        latest_frame=FAKE_FRAME,
        frame_ts=time.time() - SCREEN_FRAME_MAX_AGE - 1,
    )
    agent = _make_agent(state, mode="driver")
    msg = _FakeMessage()

    await agent.on_user_turn_completed(turn_ctx=None, new_message=msg)

    assert _images(msg) == []


# ── build_system_prompt: SCREEN AWARENESS block ──────────────────────


def test_system_prompt_screen_block_present():
    prompt = build_system_prompt({}, [], None, screen_vision=True)
    assert "SCREEN AWARENESS" in prompt


def test_system_prompt_screen_block_absent_by_default():
    prompt = build_system_prompt({}, [], None)
    assert "SCREEN AWARENESS" not in prompt
