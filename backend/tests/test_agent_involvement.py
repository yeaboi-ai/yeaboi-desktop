"""Tests for the involvement gate and addressing detection in agent/worker.py.

These cover the multi-participant collaboration logic: the ``InvolvementState``
dataclass, the ``_is_addressed`` regex layer, and the ``should_respond``
decision function. They are pure-Python and need no LiveKit runtime.
"""

import time

import pytest

from agent.worker import (
    INVOLVEMENT_DEFAULT,
    InvolvementState,
    _addresses_other_participant,
    _is_addressed,
    build_system_prompt,
    should_respond,
)

# ── _is_addressed ────────────────────────────────────────────────────


def test_wake_word_agent():
    assert _is_addressed("Agent, what do you think?", {}, None) is True


def test_wake_word_at_ai():
    assert _is_addressed("@ai can you summarise?", {}, None) is True


def test_wake_word_facilitator():
    assert _is_addressed("Facilitator, jump in here.", {}, None) is True


def test_persona_label_match():
    assert _is_addressed("Senior engineer, what's the trade-off?", {}, "Senior Engineer") is True


def test_question_mark_addresses_room():
    assert _is_addressed("What about Postgres?", {"u1": "Alice", "u2": "Bob"}, None) is True


def test_question_directed_at_other_participant():
    # Leading "Bob," directs the question at Bob, not the agent.
    assert _is_addressed("Bob, what about Postgres?", {"u1": "Alice", "u2": "Bob"}, None) is False


def test_declarative_statement_not_addressed():
    assert _is_addressed("I think we should use Postgres.", {"u1": "Alice", "u2": "Bob"}, None) is False


def test_substring_ai_does_not_match_loosely():
    # "fine" should not trip the loose AI matcher (no punctuation/position trigger).
    assert _is_addressed("the system is fine", {}, None) is False


def test_addresses_other_participant_helper():
    p = {"u1": "Alice", "u2": "Bob"}
    assert _addresses_other_participant("Bob, what's your take", p) is True
    assert _addresses_other_participant("Alice — over to you", p) is True
    assert _addresses_other_participant("we should ship it", p) is False


# ── should_respond ───────────────────────────────────────────────────


def _state(**kw):
    cfg = InvolvementState(persona_label="AI Facilitator")
    for k, v in kw.items():
        setattr(cfg, k, v)
    return cfg


def test_paused_blocks_all_modes():
    cfg = _state(mode="driver", paused_until=time.time() + 60)
    assert should_respond("Agent, hello", cfg) == "paused"


def test_paused_expired_does_not_block():
    cfg = _state(mode="driver", paused_until=time.time() - 60)
    assert should_respond("anything", cfg) == "allow"


def test_force_next_reply_bypasses_observer():
    cfg = _state(mode="observer", force_next_reply=True)
    assert should_respond("hello there", cfg) == "allow"
    # Flag is consumed exactly once.
    assert cfg.force_next_reply is False
    assert should_respond("hello there", cfg) == "observer"


def test_observer_always_suppresses():
    cfg = _state(mode="observer")
    assert should_respond("Agent, what do you think?", cfg) == "observer"


def test_responsive_allows_addressed():
    cfg = _state(mode="responsive", participants={"u": "Alice"})
    assert should_respond("Agent, summarise", cfg) == "allow"


def test_responsive_suppresses_not_addressed():
    cfg = _state(mode="responsive", participants={"u": "Alice", "v": "Bob"})
    assert should_respond("we should use Postgres", cfg) == "not_addressed"


def test_facilitator_solo_call_allows_everything():
    cfg = _state(mode="facilitator", participants={"u": "Alice"})
    assert should_respond("we should use Postgres", cfg) == "allow"


def test_facilitator_multiparticipant_allows_question():
    cfg = _state(mode="facilitator", participants={"u": "Alice", "v": "Bob"})
    assert should_respond("What stack should we pick?", cfg) == "allow"


def test_facilitator_suppresses_cross_talk():
    cfg = _state(mode="facilitator", participants={"u": "Alice", "v": "Bob"})
    assert should_respond("Bob, what's your take?", cfg) == "addresses_other"


def test_facilitator_suppresses_declarative_in_multiparty():
    cfg = _state(mode="facilitator", participants={"u": "Alice", "v": "Bob"})
    # No question, no addressing — assume cross-talk between humans.
    assert should_respond("we should ship next week", cfg) == "addresses_other"


def test_driver_always_allows():
    cfg = _state(mode="driver", participants={"u": "Alice", "v": "Bob"})
    assert should_respond("we should ship next week", cfg) == "allow"


def test_unknown_mode_falls_back_to_default():
    cfg = _state(mode="bogus", participants={"u": "Alice"})
    # default is "facilitator" → allows in solo call
    assert should_respond("hello", cfg) == "allow"
    assert INVOLVEMENT_DEFAULT == "facilitator"


# ── build_system_prompt ROOM block ──────────────────────────────────


def test_prompt_includes_participants_block():
    bp = {}
    participants = {"u1": "Alice", "u2": "Bob"}
    speaking_stats = {"Alice": {"messages": 10, "words": 240}, "Bob": {"messages": 1, "words": 8}}
    prompt = build_system_prompt(
        bp,
        [],
        {"persona": "default", "involvement": "facilitator"},
        participants=participants,
        speaking_stats=speaking_stats,
    )
    assert "PARTICIPANTS" in prompt
    assert "Alice" in prompt
    assert "Bob" in prompt
    # Air-time imbalance hint should fire (Bob ≪ mean).
    assert "AIR-TIME IMBALANCE" in prompt
    assert "Bob" in prompt
    # Involvement directive should be present.
    assert "Facilitator mode" in prompt


def test_prompt_observer_directive():
    bp = {}
    prompt = build_system_prompt(
        bp,
        [],
        {"involvement": "observer"},
        participants={"u": "Alice"},
        speaking_stats={},
    )
    assert "Observer mode" in prompt


def test_prompt_invalid_involvement_falls_back_to_default():
    bp = {}
    prompt = build_system_prompt(
        bp,
        [],
        {"involvement": "rogue"},
        participants={"u": "Alice"},
        speaking_stats={},
    )
    assert "Facilitator mode" in prompt


@pytest.mark.parametrize("mode", ["observer", "responsive", "facilitator", "driver"])
def test_all_modes_render_prompt_block(mode):
    bp = {}
    prompt = build_system_prompt(
        bp,
        [],
        {"involvement": mode},
        participants={"u": "Alice", "v": "Bob"},
        speaking_stats={"Alice": {"messages": 5, "words": 100}, "Bob": {"messages": 5, "words": 100}},
    )
    # Every mode emits an INVOLVEMENT directive line.
    assert "INVOLVEMENT" in prompt
