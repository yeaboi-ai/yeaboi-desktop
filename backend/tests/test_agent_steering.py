"""Tests for the agent_steering / hands / reactions data-channel handlers in agent/worker.py.

The handlers are extracted as module-level async/sync functions so they can be
exercised without spinning up LiveKit. We mock AgentSession with AsyncMock for
the I/O methods (`interrupt`, `say`, `generate_reply`) and stub `current_speech`
as needed.
"""

import time
from collections import deque
from unittest.mock import AsyncMock, MagicMock

import pytest

from agent.worker import (
    InvolvementState,
    _filter_reactions_for_prompt,
    _handle_hand,
    _handle_reaction,
    _handle_steering,
)


def _make_session(*, current_speech=None):
    s = MagicMock()
    s.interrupt = AsyncMock(return_value=None)
    s.say = AsyncMock(return_value=None)
    # generate_reply is fire-and-forget in the worker; sync MagicMock is fine.
    s.generate_reply = MagicMock(return_value=None)
    s.current_speech = current_speech
    return s


@pytest.fixture
def post_note():
    return AsyncMock(return_value=None)


# ── _handle_steering ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_interrupt_calls_session_interrupt(post_note):
    state = InvolvementState()
    session = _make_session()
    await _handle_steering({"type": "interrupt"}, session, state, post_note)
    session.interrupt.assert_awaited_once_with(force=True)
    post_note.assert_awaited_once()
    assert "interrupted" in post_note.await_args.args[0].lower()


@pytest.mark.asyncio
async def test_wait_interrupts_and_pauses(post_note):
    state = InvolvementState()
    session = _make_session()
    before = time.time()
    await _handle_steering({"type": "wait"}, session, state, post_note)
    after = time.time()
    session.interrupt.assert_awaited_once_with(force=True)
    # Pause window ~15s in the future, allowing for a tiny scheduling drift.
    assert before + 14.5 <= state.paused_until <= after + 15.5
    post_note.assert_awaited_once()


@pytest.mark.asyncio
async def test_dig_force_flag_and_generate_reply(post_note):
    state = InvolvementState()
    session = _make_session()
    await _handle_steering({"type": "dig"}, session, state, post_note)
    session.interrupt.assert_awaited_once_with(force=True)
    session.generate_reply.assert_called_once()
    assert state.force_next_reply is True
    post_note.assert_awaited_once()


@pytest.mark.asyncio
async def test_unknown_steering_action_is_noop(post_note):
    state = InvolvementState()
    session = _make_session()
    await _handle_steering({"type": "bogus"}, session, state, post_note)
    session.interrupt.assert_not_awaited()
    session.generate_reply.assert_not_called()
    post_note.assert_not_awaited()


@pytest.mark.asyncio
async def test_interrupt_swallows_runtime_errors(post_note):
    """If session isn't running, interrupt raises — handler must still post the note."""
    state = InvolvementState()
    session = _make_session()
    session.interrupt.side_effect = RuntimeError("not running")
    await _handle_steering({"type": "interrupt"}, session, state, post_note)
    post_note.assert_awaited_once()


# ── _handle_hand ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_hand_raised_silent_agent_speaks_immediately():
    state = InvolvementState()
    session = _make_session(current_speech=None)
    await _handle_hand(
        {"type": "hand", "payload": {"raised": True, "name": "Alice"}},
        session,
        state,
    )
    session.say.assert_awaited_once()
    assert "Alice" in session.say.await_args.args[0]
    assert state.paused_until > time.time()


@pytest.mark.asyncio
async def test_hand_raised_with_active_speech_awaits_first():
    """If there's an active SpeechHandle, we await it before saying go-ahead."""
    state = InvolvementState()

    class _FakeSpeech:
        def __init__(self):
            self.awaited = False
            self.say_called_when_awaited = False

        def done(self):
            return False

        def __await__(self):
            self.awaited = True

            async def _noop():
                return None

            return _noop().__await__()

    speech = _FakeSpeech()
    session = _make_session(current_speech=speech)
    # Snapshot: was say() called BEFORE we awaited the speech?
    original_say = session.say

    async def _say_spy(*args, **kwargs):
        speech.say_called_when_awaited = speech.awaited
        return await original_say(*args, **kwargs)

    session.say = _say_spy
    await _handle_hand(
        {"type": "hand", "payload": {"raised": True, "name": "Bob"}},
        session,
        state,
    )
    assert speech.awaited is True
    assert speech.say_called_when_awaited is True, "say() must run AFTER awaiting current_speech"
    original_say.assert_awaited_once()
    assert "Bob" in original_say.await_args.args[0]


@pytest.mark.asyncio
async def test_hand_lowered_no_action():
    state = InvolvementState()
    session = _make_session()
    await _handle_hand(
        {"type": "hand", "payload": {"raised": False, "name": "Alice"}},
        session,
        state,
    )
    session.say.assert_not_awaited()
    assert state.paused_until == 0.0


@pytest.mark.asyncio
async def test_hand_raised_without_name_falls_back():
    state = InvolvementState()
    session = _make_session(current_speech=None)
    await _handle_hand(
        {"type": "hand", "payload": {"raised": True}},
        session,
        state,
    )
    session.say.assert_awaited_once()
    # Falls back to a generic acknowledgement instead of "Yes None".
    assert "None" not in session.say.await_args.args[0]


# ── _handle_reaction ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reaction_appends_to_buffer():
    buf: deque = deque(maxlen=8)
    participants = {"u1": "Sarah"}
    await _handle_reaction(
        {"type": "reaction", "payload": {"emoji": "👍"}, "from": "u1"},
        buf,
        participants,
    )
    assert len(buf) == 1
    entry = buf[-1]
    assert entry["emoji"] == "👍"
    assert entry["from_name"] == "Sarah"


@pytest.mark.asyncio
async def test_reaction_without_emoji_ignored():
    buf: deque = deque(maxlen=8)
    await _handle_reaction({"type": "reaction", "payload": {}, "from": "u1"}, buf, {})
    assert len(buf) == 0


@pytest.mark.asyncio
async def test_reaction_unknown_sender_falls_back_to_identity():
    buf: deque = deque(maxlen=8)
    await _handle_reaction(
        {"type": "reaction", "payload": {"emoji": "🔥"}, "from": "ghost"},
        buf,
        {},  # no display name for "ghost"
    )
    assert buf[-1]["from_name"] == "ghost"


@pytest.mark.asyncio
async def test_reaction_buffer_bounded_at_eight():
    buf: deque = deque(maxlen=8)
    for i in range(20):
        await _handle_reaction(
            {"type": "reaction", "payload": {"emoji": "👍"}, "from": f"u{i}"},
            buf,
            {f"u{i}": f"User{i}"},
        )
    assert len(buf) == 8


# ── _handle_reaction verbal-ack throttling ──────────────────────────────


@pytest.mark.asyncio
async def test_reaction_triggers_verbal_ack_when_silent():
    buf: deque = deque(maxlen=8)
    state = InvolvementState()
    ack_state = {"last_ts": 0.0}
    session = _make_session(current_speech=None)
    await _handle_reaction(
        {"type": "reaction", "payload": {"emoji": "👍"}, "from": "u1"},
        buf,
        {"u1": "Sarah"},
        session=session,
        involvement_state=state,
        ack_state=ack_state,
    )
    session.generate_reply.assert_called_once()
    assert state.force_next_reply is True
    assert ack_state["last_ts"] > 0


@pytest.mark.asyncio
async def test_reaction_throttled_within_window():
    buf: deque = deque(maxlen=8)
    state = InvolvementState()
    ack_state = {"last_ts": time.time()}  # ack just fired
    session = _make_session(current_speech=None)
    await _handle_reaction(
        {"type": "reaction", "payload": {"emoji": "❤️"}, "from": "u1"},
        buf,
        {"u1": "Sarah"},
        session=session,
        involvement_state=state,
        ack_state=ack_state,
    )
    # Buffer still grows so the soft-context hint stays accurate...
    assert len(buf) == 1
    # ...but no verbal ack fired (we're inside the throttle window).
    session.generate_reply.assert_not_called()


@pytest.mark.asyncio
async def test_reaction_skipped_while_agent_speaking():
    buf: deque = deque(maxlen=8)
    state = InvolvementState()
    ack_state = {"last_ts": 0.0}

    class _ActiveSpeech:
        def done(self):
            return False

    session = _make_session(current_speech=_ActiveSpeech())
    await _handle_reaction(
        {"type": "reaction", "payload": {"emoji": "🔥"}, "from": "u1"},
        buf,
        {"u1": "Sarah"},
        session=session,
        involvement_state=state,
        ack_state=ack_state,
    )
    session.generate_reply.assert_not_called()


@pytest.mark.asyncio
async def test_reaction_skipped_while_paused():
    buf: deque = deque(maxlen=8)
    state = InvolvementState(paused_until=time.time() + 30)
    ack_state = {"last_ts": 0.0}
    session = _make_session(current_speech=None)
    await _handle_reaction(
        {"type": "reaction", "payload": {"emoji": "🎉"}, "from": "u1"},
        buf,
        {"u1": "Sarah"},
        session=session,
        involvement_state=state,
        ack_state=ack_state,
    )
    session.generate_reply.assert_not_called()


# ── _filter_reactions_for_prompt ──────────────────────────────────────


def test_filter_dedupes_within_window():
    """Reactions are stored chronologically (oldest first); filter walks newest-first."""
    now = 1000.0
    reactions = [
        {"emoji": "🔥", "from_name": "Mike", "ts": now - 15},  # oldest
        {"emoji": "👍", "from_name": "Sarah", "ts": now - 10},
        {"emoji": "👍", "from_name": "Sarah", "ts": now - 5},  # newest
    ]
    out = _filter_reactions_for_prompt(reactions, now=now)
    # Newest 👍 from Sarah kept; older duplicate dropped; 🔥 from Mike kept.
    assert out == [("👍", "Sarah"), ("🔥", "Mike")]


def test_filter_drops_old_reactions():
    now = 1000.0
    reactions = [
        {"emoji": "🎉", "from_name": "Old", "ts": now - 200},  # > 120s
        {"emoji": "👍", "from_name": "Fresh", "ts": now - 5},
    ]
    out = _filter_reactions_for_prompt(reactions, now=now)
    assert out == [("👍", "Fresh")]


def test_filter_caps_at_three():
    """Five distinct reactions stored chronologically — only the 3 newest are emitted."""
    now = 1000.0
    reactions = [
        # Oldest at index 0, newest at the end. 5 seconds apart for clarity.
        {"emoji": "🙏", "from_name": "E", "ts": now - 25},
        {"emoji": "🔥", "from_name": "D", "ts": now - 20},
        {"emoji": "🎉", "from_name": "C", "ts": now - 15},
        {"emoji": "❤️", "from_name": "B", "ts": now - 10},
        {"emoji": "👍", "from_name": "A", "ts": now - 5},
    ]
    out = _filter_reactions_for_prompt(reactions, now=now)
    assert out == [("👍", "A"), ("❤️", "B"), ("🎉", "C")]
