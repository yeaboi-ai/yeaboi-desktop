"""Tests for services/facilitator.process_message.

The facilitator routes through ``get_ai_client`` + ``ai.chat()``; tests
mock that surface rather than the raw Anthropic SDK.
"""

from unittest.mock import AsyncMock, patch

from src.app.services.facilitator import process_message


def _make_ai_client(response_text: str) -> AsyncMock:
    """Build a mock AIClient whose chat() returns ``response_text``."""
    client = AsyncMock()
    client.provider = "platform"
    client.model = "claude-opus-4-7"
    client.chat = AsyncMock(return_value=response_text)
    return client


async def test_facilitator_returns_response():
    ai_client = _make_ai_client("Great idea! Let's define the core features first.")

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "Let's build a todo app", "message_type": "chat", "user_name": "User"}],
            current_blueprint={"project_overview": "", "tech_stack": ""},
            initial_idea="Build a todo app",
        )

    assert result["response"] == "Great idea! Let's define the core features first."
    assert result["blueprint_updates"] == []


async def test_facilitator_extracts_blueprint_update():
    response_text = """Good point about the tech stack.
```blueprint_update
{"section": "tech_stack", "content": "Next.js + FastAPI + PostgreSQL"}
```"""
    ai_client = _make_ai_client(response_text)

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "We should use Next.js", "message_type": "chat", "user_name": "User"}],
            current_blueprint={"tech_stack": ""},
        )

    assert result["response"] == "Good point about the tech stack."
    assert len(result["blueprint_updates"]) == 1
    assert result["blueprint_updates"][0]["section"] == "tech_stack"
    assert "Next.js" in result["blueprint_updates"][0]["content"]


async def test_facilitator_no_response():
    ai_client = _make_ai_client('{"no_response": true}')

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "User"}],
            current_blueprint={},
        )

    assert result["response"] is None
    assert result["blueprint_updates"] == []


async def test_facilitator_returns_none_when_ai_client_fails():
    """If get_ai_client raises (e.g. misconfigured provider), the call is
    caught and we return a structured empty response rather than blowing up."""
    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(side_effect=RuntimeError("no api key configured")),
    ):
        result = await process_message(
            messages_history=[{"content": "hello", "message_type": "chat", "user_name": "User"}],
            current_blueprint={},
        )

    assert result["response"] is None
    assert result["blueprint_updates"] == []


async def test_facilitator_includes_bullet_focus_in_prompt():
    """When the coverage-aware launcher hands the facilitator specific bullets
    to deep-dive into, they must show up in the system prompt so the model
    grounds its next turn on those bullets instead of broad section discovery."""
    ai_client = _make_ai_client("Got it.")

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"tech_stack": "- Postgres\n- Redis"},
            bullet_focus=["Postgres for primary store", "Redis for cache layer"],
        )

    sent_system = ai_client.chat.call_args.kwargs["system"]
    assert "DEEP DIVE" in sent_system
    assert "Postgres for primary store" in sent_system
    assert "Redis for cache layer" in sent_system


async def test_facilitator_injects_pace_block_into_prompt():
    """The pace directive must appear in the LLM system prompt so the model
    sees the question budget BEFORE generating its next turn. Without this,
    the chat path would silently regress to the old prose-only "max 2
    follow-ups" rule."""
    ai_client = _make_ai_client("Got it.")

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"tech_stack": ""},
            pace="fast",
            persona="pm",
        )

    sent_system = ai_client.chat.call_args.kwargs["system"]
    assert "PACE: Fast" in sent_system
    # Persona label + budget format match build_pace_directive's output.
    assert "0/3 questions used as Product Manager" in sent_system


async def test_facilitator_returns_incremented_runtime_state():
    """Each agent reply containing a '?' must bump the persona's counter
    so the chat path can persist it back to session.agent_runtime_state.
    Without this, the budget would reset every turn and the chip would
    never fire."""
    ai_client = _make_ai_client("Who's the primary user?")

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"tech_stack": ""},
            pace="fast",
            persona="pm",
            runtime_state={"persona_stats": {"pm": {"questions_asked": 1}}},
        )

    assert result["runtime_state"]["persona_stats"]["pm"]["questions_asked"] == 2


async def test_facilitator_pace_overrides_coverage_persona_suggestion():
    """When the budget is spent, process_message must surface the pace-driven
    handoff as persona_suggestion — bypassing the 95%-coverage gate that
    normally keeps compute_persona_suggestion silent."""
    ai_client = _make_ai_client("Got it.")

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"tech_stack": ""},
            pace="fast",
            persona="pm",
            # 3 questions = at-cap in fast mode; pace must fire even though
            # PM's focus coverage isn't at 95%.
            runtime_state={"persona_stats": {"pm": {"questions_asked": 3}}},
        )

    suggestion = result["persona_suggestion"]
    assert suggestion is not None
    assert suggestion.get("trigger") == "pace_budget"
    assert suggestion["persona"] != "pm"


async def test_facilitator_injects_used_personas_into_prompt():
    """The system prompt must list personas that have already been active so
    the LLM doesn't verbally re-pitch them. Without this, the model could
    say "let's bring in the Architect" even when the chip is suppressed."""
    ai_client = _make_ai_client("Got it.")

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"tech_stack": ""},
            pace="fast",
            persona="default",
            runtime_state={"persona_history": ["pm", "architect", "default"]},
        )

    sent_system = ai_client.chat.call_args.kwargs["system"]
    assert "PERSONAS ALREADY USED THIS SESSION" in sent_system
    # Current persona excluded from the "already used" list — they are still
    # active. Only the prior personas should appear.
    assert "Product Manager" in sent_system
    assert "System Architect" in sent_system


async def test_facilitator_suppresses_suggestion_for_used_persona():
    """Pace handoff must not pick a persona who has already been active —
    even when the budget is spent and their focus areas have gaps."""
    ai_client = _make_ai_client("Got it.")

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"tech_stack": ""},
            pace="fast",
            persona="pm",
            runtime_state={
                "persona_history": ["pm", "default", "architect", "challenger", "mentor"],
                "persona_stats": {"pm": {"questions_asked": 3}},
            },
        )

    # All five personas have been used → no candidate left → silent.
    assert result["persona_suggestion"] is None


async def test_facilitator_cooldown_blocks_same_chip_back_to_back():
    """The cooldown stamps last_suggested_persona on the runtime state. A
    second process_message call with the same state (within the cooldown)
    must NOT re-emit the same suggestion."""
    ai_client = _make_ai_client("Got it.")

    runtime_state = {
        "persona_stats": {"pm": {"questions_asked": 3}},
        # Stamp set 1s ago — well inside the 30s cooldown.
        "last_suggested_persona": "default",
        "last_suggested_at": __import__("time").time() - 1,
    }

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"tech_stack": ""},
            pace="fast",
            persona="pm",
            runtime_state=runtime_state,
        )

    # The handoff target would naturally be "default" (most gaps), but the
    # cooldown blocks re-emitting it within 30s. Result: silent chip even
    # though the budget is spent.
    suggestion = result["persona_suggestion"]
    if suggestion is not None:
        # If something fires, it must NOT be the persona we just suggested.
        assert suggestion["persona"] != "default"


async def test_facilitator_omits_deep_dive_block_when_no_bullets():
    """Sanity check: free-form / gaps / resume modes don't pass bullet_focus,
    so the DEEP DIVE prefix should not show up in the prompt."""
    ai_client = _make_ai_client("Got it.")

    with patch(
        "src.app.services.facilitator.get_ai_client_for_role",
        AsyncMock(return_value=ai_client),
    ):
        await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"tech_stack": ""},
        )

    sent_system = ai_client.chat.call_args.kwargs["system"]
    assert "DEEP DIVE" not in sent_system


async def test_facilitator_returns_meta_with_model_and_latency():
    """process_message must return meta={model, latency_ms} so the chat path
    can stash it under attachments[?]._ai_meta for the reasoning peek."""
    ai_client = _make_ai_client("Sure thing.")

    with patch(
        "src.app.services.facilitator.get_ai_client",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "hi", "message_type": "chat", "user_name": "U"}],
            current_blueprint={},
        )

    assert result["meta"] is not None
    assert result["meta"]["model"] == "claude-opus-4-7"
    assert isinstance(result["meta"]["latency_ms"], int)
    assert result["meta"]["latency_ms"] >= 0


async def test_facilitator_returns_none_meta_on_api_error():
    """When the AI client itself fails, meta should be None so the chat
    write path can skip the attachments sidecar."""
    with patch(
        "src.app.services.facilitator.get_ai_client",
        AsyncMock(side_effect=RuntimeError("no api key")),
    ):
        result = await process_message(
            messages_history=[{"content": "hi", "message_type": "chat", "user_name": "U"}],
            current_blueprint={},
        )

    assert result["response"] is None
    assert result["meta"] is None


def test_compute_persona_suggestion_silent_until_focus_areas_done():
    """While the current persona still has focus-area gaps, no suggestion fires.
    Voice and chat both read this — it gates the toast popup."""
    from src.app.services.facilitator import compute_persona_suggestion

    # PM persona's focus is project_overview/goals_constraints/users_personas/ui_ux/out_of_scope.
    # If goals_constraints is below threshold, suggestion stays None.
    scores = {
        "project_overview": 100,
        "goals_constraints": 50,
        "users_personas": 100,
        "ui_ux": 100,
        "out_of_scope": 100,
    }
    assert compute_persona_suggestion(scores, current_persona="pm") is None


def test_compute_persona_suggestion_picks_persona_with_most_gaps():
    """When the current persona's focus areas are full but other personas
    still have gaps, suggest the one with the most gaps."""
    from src.app.services.facilitator import compute_persona_suggestion

    # PM's focus areas all 100. Engineer's focus (tech_stack/architecture/
    # infrastructure/api_integrations) has 3 gaps. Architect's focus
    # (architecture/tech_stack/api_integrations/infrastructure/security_compliance)
    # has 4 gaps — should win.
    scores = {
        "project_overview": 100,
        "goals_constraints": 100,
        "users_personas": 100,
        "ui_ux": 100,
        "out_of_scope": 100,
        "tech_stack": 50,
        "architecture": 50,
        "infrastructure": 50,
        "api_integrations": 50,
        "security_compliance": 50,
    }
    suggestion = compute_persona_suggestion(scores, current_persona="pm")
    assert suggestion is not None
    assert suggestion["persona"] == "architect"
    assert suggestion["label"] == "System Architect"
    assert "Architecture" in suggestion["reason"] or "Tech Stack" in suggestion["reason"]
    assert len(suggestion["gap_sections"]) <= 5


def test_compute_persona_suggestion_returns_none_when_everything_full():
    """When every persona's focus areas are at threshold, no suggestion fires."""
    from src.app.services.facilitator import (
        BLUEPRINT_SECTIONS,
        compute_persona_suggestion,
    )

    scores = {s: 100 for s in BLUEPRINT_SECTIONS}
    assert compute_persona_suggestion(scores, current_persona="default") is None


async def test_facilitator_threads_persona_suggestion_through_result():
    """process_message must include `persona_suggestion` in its return shape
    so the chat router can decide whether to broadcast a `suggest_persona`
    event. The value comes from compute_persona_suggestion — covered by its
    own unit tests; here we just lock the wiring."""
    ai_client = _make_ai_client("Sounds good.")

    with patch(
        "src.app.services.facilitator.get_ai_client",
        AsyncMock(return_value=ai_client),
    ):
        result = await process_message(
            messages_history=[{"content": "ok", "message_type": "chat", "user_name": "U"}],
            current_blueprint={"project_overview": ""},
            persona="default",
        )

    assert "persona_suggestion" in result
    # Empty blueprint, default persona — current focus areas have gaps, so
    # no suggestion fires (compute_persona_suggestion enforces this).
    assert result["persona_suggestion"] is None


def test_technical_comfort_directive_only_on_explicit_levels():
    """The TECHNICAL DEPTH block is injected only for non_technical / expert.
    "comfortable" is the silent default; unknown values fall back to silent."""
    from src.app.services.facilitator import _build_system_prompt, normalise_technical_comfort

    plain = _build_system_prompt(persona="default")
    non_tech = _build_system_prompt(persona="default", technical_comfort="non_technical")
    expert = _build_system_prompt(persona="default", technical_comfort="expert")
    bogus = _build_system_prompt(persona="default", technical_comfort="ninja-grade")

    assert "TECHNICAL DEPTH" not in plain
    assert "TECHNICAL DEPTH" in non_tech
    assert "NOT technical" in non_tech
    assert "TECHNICAL DEPTH" in expert
    assert "senior engineer" in expert
    # Unknown values are silently coerced upstream; the raw arg shouldn't crash here.
    assert "TECHNICAL DEPTH" not in bogus
    assert normalise_technical_comfort("ninja-grade") == "comfortable"
    assert normalise_technical_comfort(None) == "comfortable"
    assert normalise_technical_comfort("expert") == "expert"


def test_emotion_appears_only_when_set():
    """The emotion block lifts directly from the voice worker's prompt; chat
    must drop in the same TONE line when ai_config.emotion is set, and stay
    silent otherwise."""
    from src.app.services.facilitator import _build_system_prompt

    plain = _build_system_prompt(persona="default")
    excited = _build_system_prompt(persona="default", emotion="excited")
    bogus = _build_system_prompt(persona="default", emotion="not-a-real-emotion")

    assert "TONE" not in plain
    assert "TONE" in excited
    assert "energetic" in excited.lower()
    assert "TONE" not in bogus  # silently ignore unknown emotion values


def test_rules_diagrams_allows_auto_wireframe_at_low_fidelity():
    """Facilitator prompt must auto-gen low-fi wireframes on ui_ux substantive update,
    keep high-fi gated behind explicit enhance, and expose the fidelity field in the
    WIREFRAME schema example."""
    from src.app.services.facilitator import _RULES_DIAGRAMS

    # Old "never auto-gen" rule must be gone
    assert "NEVER auto-generate wireframes" not in _RULES_DIAGRAMS

    # New auto-gen rule present, scoped to ui_ux + low fidelity
    assert "Auto-generate a LOW-fidelity wireframe" in _RULES_DIAGRAMS
    assert "ui_ux" in _RULES_DIAGRAMS
    assert "HIGH-fidelity" in _RULES_DIAGRAMS
    assert "enhance" in _RULES_DIAGRAMS.lower()

    # WIREFRAME schema example now carries fidelity
    assert '"fidelity"' in _RULES_DIAGRAMS
    assert '"low"' in _RULES_DIAGRAMS

    # Tie-breaker guidance present to resolve the "ONE diagram per response" conflict
    assert "prefer the wireframe" in _RULES_DIAGRAMS

    # Operational threshold for "substantive" — avoid ambiguity for the LLM
    assert "~80 characters" in _RULES_DIAGRAMS

    # CSS variable instruction present so the renderer can live-restyle
    assert "CSS variables" in _RULES_DIAGRAMS
    assert "var(--color-" in _RULES_DIAGRAMS


def test_response_style_enforces_scan_friendly_format():
    """The chat reply rules must enforce a hard length cap and the multi-bubble
    [ack]/[next] tag format so messages are skimmable. Without these, replies
    drift back to wall-of-text paragraphs."""
    from src.app.services.facilitator import _RULES_ABSOLUTE

    # Hard cap is named with a specific number — soft 'be brief' guidance
    # has historically been ignored by the model.
    assert "40" in _RULES_ABSOLUTE and "words" in _RULES_ABSOLUTE
    # Multi-bubble segment tags must be documented.
    assert "[ack]" in _RULES_ABSOLUTE
    assert "[next]" in _RULES_ABSOLUTE
    # Old contradictory rules must be gone — they banned the very format
    # the user picked.
    assert "1-2 sentences max" not in _RULES_ABSOLUTE
    assert "NEVER output summaries, lists, or bullet points" not in _RULES_ABSOLUTE


def test_persona_switch_recommendation_no_longer_duplicated_in_chat_prose():
    """The persona-switch chip is a structured surface (suggest_persona WS
    event → PersonaSuggestionPopup). The chat prompt must NOT also instruct
    the LLM to rephrase the switch in chat — that's the bulky-message bug."""
    from src.app.services.facilitator import _RULES_FACILITATION, _RULES_STEERING

    # The old prescriptive examples must be gone from both blocks.
    assert "try switching to Product Manager" not in _RULES_FACILITATION
    assert "open AI Settings and switch to Product Manager" not in _RULES_STEERING
    assert "Say something like" not in _RULES_STEERING

    # And both blocks must explicitly tell the model the chip handles it.
    assert "chip" in _RULES_FACILITATION.lower()
    assert "chip" in _RULES_STEERING.lower()


def test_parse_segments_splits_tagged_response():
    from src.app.services.facilitator import parse_segments

    out = parse_segments("[ack] Got it — exports in scope.\n[next] Click a tag → filter?")
    assert out == [
        {"type": "ack", "content": "Got it — exports in scope."},
        {"type": "next", "content": "Click a tag → filter?"},
    ]


def test_parse_segments_fallback_when_untagged():
    """Legacy LLM output (no tags) must still produce a renderable bubble —
    otherwise we'd go silent and the chat would freeze."""
    from src.app.services.facilitator import parse_segments

    out = parse_segments("Just a plain sentence without tags.")
    assert out == [{"type": "next", "content": "Just a plain sentence without tags."}]


def test_parse_segments_handles_only_next():
    from src.app.services.facilitator import parse_segments

    out = parse_segments("[next] What about the tech stack?")
    assert out == [{"type": "next", "content": "What about the tech stack?"}]


def test_parse_segments_strips_pre_tag_whitespace():
    from src.app.services.facilitator import parse_segments

    out = parse_segments("\n\n[ack] First.\n\n[next] Second.\n")
    assert out == [
        {"type": "ack", "content": "First."},
        {"type": "next", "content": "Second."},
    ]


def test_parse_segments_empty_input_returns_empty_list():
    from src.app.services.facilitator import parse_segments

    assert parse_segments("") == []
    assert parse_segments("   \n  ") == []


def test_parse_segments_case_insensitive():
    """The model occasionally uppercases tags. Don't fail on that."""
    from src.app.services.facilitator import parse_segments

    out = parse_segments("[ACK] ok.\n[Next] then.")
    assert out == [
        {"type": "ack", "content": "ok."},
        {"type": "next", "content": "then."},
    ]


def test_response_style_block_documents_segments_format():
    """The prompt must teach the LLM the [ack] / [next] tag format. Without
    this, the LLM falls back to single-paragraph prose — exactly the
    wall-of-text bug we're fixing."""
    from src.app.services.facilitator import _RULES_ABSOLUTE

    assert "[ack]" in _RULES_ABSOLUTE
    assert "[next]" in _RULES_ABSOLUTE
    # Tags must be required at start-of-line
    assert "own line" in _RULES_ABSOLUTE.lower() or "first character" in _RULES_ABSOLUTE.lower()


def test_outputs_block_no_longer_recites_four_artifact_examples():
    """The old _RULES_OUTPUTS block had four worked examples ('If you're ready,
    you could generate X') — collectively they nudged the model toward verbose
    multi-clause closings. The trimmed version allows a single short clause."""
    from src.app.services.facilitator import _RULES_OUTPUTS

    # The four bulleted examples should no longer all be present.
    examples = [
        "you could generate a code scaffold now",
        "design bundle if you want",
        "Terraform stack from this",
        "decision doc handoff",
    ]
    present = sum(1 for ex in examples if ex in _RULES_OUTPUTS)
    assert present <= 1, (
        f"_RULES_OUTPUTS still recites {present} of the old artifact examples; "
        "trim them so the model doesn't list all four in chat."
    )

    # Retired phrase guard stays in place.
    assert "Complete and Generate Board" in _RULES_OUTPUTS
