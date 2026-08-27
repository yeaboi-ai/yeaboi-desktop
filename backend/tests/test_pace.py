"""Unit tests for services.pace — per-session question budgets and the
budget-aware persona handoff override."""

from src.app.services.pace import (
    DEFAULT_PACE,
    PACE_BUDGETS,
    build_pace_directive,
    get_budgets,
    get_persona_history,
    get_persona_stats,
    next_persona_for_handoff,
    normalise_pace,
    record_active_persona,
    record_agent_reply,
    record_suggestion_fired,
    reset_persona_stats,
    should_resurface_suggestion,
)


def test_get_budgets_returns_known_levels():
    assert get_budgets("fast")["questions_per_persona"] == 3
    assert get_budgets("fast")["max_followups"] == 1
    assert get_budgets("fast")["suggest_handoff_at"] == 2
    assert get_budgets("balanced")["questions_per_persona"] == 5
    assert get_budgets("deep")["questions_per_persona"] == 8


def test_get_budgets_falls_back_to_balanced_for_unknown():
    """Any invalid input must not raise — the chat path silently treats it
    as the default. This preserves session creation when an old client sends
    a deprecated pace value."""
    assert get_budgets(None) == PACE_BUDGETS[DEFAULT_PACE]
    assert get_budgets("") == PACE_BUDGETS[DEFAULT_PACE]
    assert get_budgets("turbo") == PACE_BUDGETS[DEFAULT_PACE]


def test_normalise_pace_canonicalises_input():
    assert normalise_pace("fast") == "fast"
    assert normalise_pace("balanced") == "balanced"
    assert normalise_pace("deep") == "deep"
    assert normalise_pace(None) == "balanced"
    assert normalise_pace("ultra") == "balanced"
    assert normalise_pace(123) == "balanced"  # type: ignore[arg-type]


def test_get_persona_stats_returns_zero_defaults():
    assert get_persona_stats(None, "pm") == {"questions_asked": 0, "last_active_at": 0.0}
    assert get_persona_stats({}, "pm") == {"questions_asked": 0, "last_active_at": 0.0}
    assert get_persona_stats({"persona_stats": {}}, "pm") == {
        "questions_asked": 0,
        "last_active_at": 0.0,
    }


def test_record_agent_reply_increments_only_when_question_present():
    state: dict = {}
    state = record_agent_reply(state, "pm", "What's the primary user persona?")
    assert state["persona_stats"]["pm"]["questions_asked"] == 1

    # Statement-only reply must not count — preserves budget for actual asks.
    state = record_agent_reply(state, "pm", "Got it — solo dev.")
    assert state["persona_stats"]["pm"]["questions_asked"] == 1

    # Another question advances the counter.
    state = record_agent_reply(state, "pm", "When are you launching?")
    assert state["persona_stats"]["pm"]["questions_asked"] == 2


def test_record_agent_reply_caps_one_per_reply():
    """Replies containing multiple '?' still count as one question — the
    existing prompt enforces ONE question per response, so we don't want
    a list of nested clarifications to over-charge the budget."""
    state = record_agent_reply({}, "pm", "Why React? Why Postgres? Why now?")
    assert state["persona_stats"]["pm"]["questions_asked"] == 1


def test_record_agent_reply_isolates_personas():
    """PM's counter must not leak into Architect's — each persona has their
    own budget bucket so a switch starts from zero (after reset_persona_stats)."""
    state: dict = {}
    state = record_agent_reply(state, "pm", "Who's the user?")
    state = record_agent_reply(state, "pm", "What's the goal?")
    state = record_agent_reply(state, "architect", "What's the API surface?")

    assert state["persona_stats"]["pm"]["questions_asked"] == 2
    assert state["persona_stats"]["architect"]["questions_asked"] == 1


def test_reset_persona_stats_zeroes_target_only():
    state = record_agent_reply({}, "pm", "Who?")
    state = record_agent_reply(state, "pm", "What?")
    state = record_agent_reply(state, "architect", "How?")

    state = reset_persona_stats(state, "pm")
    assert state["persona_stats"]["pm"]["questions_asked"] == 0
    # Other personas untouched.
    assert state["persona_stats"]["architect"]["questions_asked"] == 1


def test_record_agent_reply_preserves_other_runtime_keys():
    """Voice agent writes its own keys (speaker_id_map, posted_texts, ...) into
    the same runtime_state JSON. We must not stomp on those."""
    state = {
        "speaker_id_map": {"alice": "uid-1"},
        "posted_texts": ["hi"],
        "active_persona": "pm",
    }
    state = record_agent_reply(state, "pm", "What's the goal?")
    assert state["speaker_id_map"] == {"alice": "uid-1"}
    assert state["posted_texts"] == ["hi"]
    assert state["active_persona"] == "pm"
    assert state["persona_stats"]["pm"]["questions_asked"] == 1


def test_build_pace_directive_under_budget_has_no_handoff_line():
    block = build_pace_directive(
        pace="fast",
        persona_label="Product Manager",
        persona_stats={"questions_asked": 0},
    )
    assert "PACE: Fast" in block
    assert "0/3" in block
    assert "BUDGET EXHAUSTED" not in block
    assert "STRONGLY consider handing off" not in block


def test_build_pace_directive_suggests_handoff_at_threshold():
    """At suggest_handoff_at (2 in fast mode) the directive should nudge —
    not yet block — the agent toward another persona."""
    block = build_pace_directive(
        pace="fast",
        persona_label="Product Manager",
        persona_stats={"questions_asked": 2},
        next_persona_label="Senior Engineer",
        gap_section_labels=["Tech Stack", "Architecture"],
    )
    assert "STRONGLY consider handing off" in block
    assert "Senior Engineer" in block
    assert "Tech Stack" in block


def test_build_pace_directive_blocks_at_cap():
    """At questions_per_persona (3 in fast mode) the directive must explicitly
    forbid another question — this is the hard cap that replaces today's
    prose-only rule."""
    block = build_pace_directive(
        pace="fast",
        persona_label="Product Manager",
        persona_stats={"questions_asked": 3},
        next_persona_label="Senior Engineer",
        gap_section_labels=["Tech Stack"],
    )
    assert "BUDGET EXHAUSTED" in block
    assert "Do NOT ask another question" in block
    assert "Senior Engineer" in block


def test_next_persona_for_handoff_quiet_under_threshold():
    """Under suggest_handoff_at, we don't override the coverage-only path —
    process_message falls back to compute_persona_suggestion."""
    result = next_persona_for_handoff(
        scores={"tech_stack": 10, "ui_ux": 10},
        current_persona="pm",
        persona_stats={"questions_asked": 1},
        pace="fast",
        persona_focus_sections={
            "pm": ["ui_ux"],
            "default": ["tech_stack"],
        },
        persona_labels={"pm": "PM", "default": "Engineer"},
        section_labels={"tech_stack": "Tech Stack", "ui_ux": "UI/UX"},
    )
    assert result is None


def test_next_persona_for_handoff_fires_when_budget_spent():
    """At the suggest_handoff_at threshold the function returns a target
    persona even if focus coverage hasn't hit 95% — that's the whole point
    of pace overriding the coverage gate."""
    result = next_persona_for_handoff(
        scores={"tech_stack": 10, "ui_ux": 60},
        current_persona="pm",
        persona_stats={"questions_asked": 2},
        pace="fast",
        persona_focus_sections={
            "pm": ["ui_ux"],
            "default": ["tech_stack"],
            "architect": ["tech_stack"],
        },
        persona_labels={"pm": "PM", "default": "Engineer", "architect": "Architect"},
        section_labels={"tech_stack": "Tech Stack", "ui_ux": "UI/UX"},
    )
    assert result is not None
    assert result["trigger"] == "pace_budget"
    # Both Engineer and Architect have a single gap; either is acceptable —
    # we just need a non-current persona with a gap.
    assert result["persona"] in {"default", "architect"}
    assert result["gap_sections"] == ["tech_stack"]


def test_record_active_persona_appends_to_history():
    """Switching to a new persona must append them to history so the
    smart-handoff guard knows not to re-recommend them later."""
    state: dict = {}
    state = record_active_persona(state, "pm")
    assert get_persona_history(state) == ["pm"]
    assert state["active_persona"] == "pm"

    state = record_active_persona(state, "default")
    assert get_persona_history(state) == ["pm", "default"]
    assert state["active_persona"] == "default"


def test_record_active_persona_idempotent_for_same_persona():
    """Calling record_active_persona twice with the same slug is a no-op
    for history (no dup entries) — re-entering a persona doesn't add them
    a second time."""
    state = record_active_persona({}, "pm")
    state = record_active_persona(state, "pm")
    assert get_persona_history(state) == ["pm"]


def test_record_active_persona_preserves_history_order_on_return():
    """If the user goes PM → Architect → PM, the history stays [pm, architect]
    — order reflects FIRST activation, not the current one. This matters for
    the 'each persona has had their turn' guarantee."""
    state = record_active_persona({}, "pm")
    state = record_active_persona(state, "architect")
    state = record_active_persona(state, "pm")
    assert get_persona_history(state) == ["pm", "architect"]


def test_next_persona_for_handoff_excludes_used_personas():
    """Once a persona has been active, the chip must never re-pitch them —
    even if their focus areas still have gaps. This is the credibility-
    killing loop the user explicitly flagged."""
    result = next_persona_for_handoff(
        scores={"tech_stack": 10, "ui_ux": 60, "architecture": 10},
        current_persona="pm",
        persona_stats={"questions_asked": 3},  # at-cap in fast mode
        pace="fast",
        persona_focus_sections={
            "pm": ["ui_ux"],
            "default": ["tech_stack"],
            "architect": ["architecture"],
        },
        persona_labels={"pm": "PM", "default": "Engineer", "architect": "Architect"},
        section_labels={"tech_stack": "Tech Stack", "ui_ux": "UI/UX", "architecture": "Architecture"},
        # Engineer already had their turn — only Architect should be a
        # candidate now.
        used_personas={"pm", "default"},
    )
    assert result is not None
    assert result["persona"] == "architect"


def test_next_persona_for_handoff_returns_none_when_all_others_used():
    """When every other persona has been used, the chip must stay silent —
    re-pitching anyone would re-open the loop."""
    result = next_persona_for_handoff(
        scores={"tech_stack": 10, "ui_ux": 60, "architecture": 10},
        current_persona="pm",
        persona_stats={"questions_asked": 5},
        pace="fast",
        persona_focus_sections={
            "pm": ["ui_ux"],
            "default": ["tech_stack"],
            "architect": ["architecture"],
        },
        persona_labels={"pm": "PM", "default": "Engineer", "architect": "Architect"},
        section_labels={"tech_stack": "Tech Stack", "ui_ux": "UI/UX", "architecture": "Architecture"},
        used_personas={"pm", "default", "architect"},
    )
    assert result is None


def test_should_resurface_suggestion_blocks_same_persona_in_cooldown():
    """Re-suggesting the same persona within the cooldown window is the
    spam case — must return False. A different persona is always allowed
    through (cooldown is per-target, not global)."""
    state = record_suggestion_fired({}, "default")
    # Same persona inside the cooldown — blocked.
    assert should_resurface_suggestion(state, "default", now=state["last_suggested_at"] + 5) is False
    # Different persona — always allowed.
    assert should_resurface_suggestion(state, "architect", now=state["last_suggested_at"] + 5) is True
    # Same persona AFTER the cooldown elapses — re-allowed.
    assert should_resurface_suggestion(state, "default", now=state["last_suggested_at"] + 60) is True


def test_should_resurface_suggestion_allows_first_fire():
    """No prior suggestion stamp → anything is fair game."""
    assert should_resurface_suggestion(None, "pm") is True
    assert should_resurface_suggestion({}, "pm") is True


def test_record_suggestion_fired_with_none_clears_stamp():
    """Passing None must clear the stamp so the next legitimate suggestion
    can fire immediately rather than waiting out a cooldown for a chip we
    never actually broadcast."""
    state = record_suggestion_fired({}, "pm")
    assert "last_suggested_persona" in state
    state = record_suggestion_fired(state, None)
    assert "last_suggested_persona" not in state


def test_next_persona_for_handoff_returns_none_when_all_others_well_covered():
    """If every other persona's focus sections are already ≥80%, there's
    nothing to hand off TO — better to keep going than to suggest a switch
    that achieves nothing."""
    result = next_persona_for_handoff(
        scores={"tech_stack": 90, "ui_ux": 10, "architecture": 90},
        current_persona="pm",
        persona_stats={"questions_asked": 5},
        pace="fast",
        persona_focus_sections={
            "pm": ["ui_ux"],
            "default": ["tech_stack"],
            "architect": ["tech_stack", "architecture"],
        },
        persona_labels={"pm": "PM", "default": "Engineer", "architect": "Architect"},
        section_labels={"tech_stack": "Tech Stack", "ui_ux": "UI/UX", "architecture": "Architecture"},
    )
    assert result is None
