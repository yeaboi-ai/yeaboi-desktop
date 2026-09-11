"""Tests for agent/worker.py — system prompt, TTS/STT creation, speaker resolution."""

from unittest.mock import AsyncMock, patch

import pytest

from agent.worker import (
    BLUEPRINT_FLOW,
    SECTION_KEYS,
    SECTION_LABELS,
    FacilitatorAgent,
    build_system_prompt,
    extract_and_update_blueprint,
    strip_markdown,
)

# ── build_system_prompt ──────────────────────────────────────────────


def test_build_system_prompt_empty():
    bp = {k: "" for k in SECTION_KEYS}
    prompt = build_system_prompt(bp, [], None)
    assert "DRIVE the conversation" in prompt
    assert len(prompt) > 100


def test_build_system_prompt_with_filled_sections():
    bp = {k: "" for k in SECTION_KEYS}
    bp["project_overview"] = "A todo app for managing daily tasks"
    bp["tech_stack"] = "React, Node.js, PostgreSQL"
    prompt = build_system_prompt(bp, [], None)
    assert "todo app" in prompt.lower() or "A todo app" in prompt


def test_build_system_prompt_with_history():
    bp = {k: "" for k in SECTION_KEYS}
    history = [
        {"message_type": "chat", "speaker_name": "Omar", "content": "I want to build a task manager"},
        {"message_type": "ai", "speaker_name": "AI Facilitator", "content": "Great idea!"},
    ]
    prompt = build_system_prompt(bp, history, None)
    assert len(prompt) > 100


def test_build_system_prompt_with_persona():
    bp = {k: "" for k in SECTION_KEYS}
    prompt = build_system_prompt(bp, [], {"persona": "pm"})
    assert "product manager" in prompt.lower()


def test_build_system_prompt_with_assertiveness():
    bp = {k: "" for k in SECTION_KEYS}
    prompt_active = build_system_prompt(bp, [], {"assertiveness": "active"})
    prompt_passive = build_system_prompt(bp, [], {"assertiveness": "passive"})
    assert prompt_active != prompt_passive


def test_build_system_prompt_renders_full_bullets_not_truncated_preview():
    """Regression: the agent used to see only ``preview[:120]`` per section,
    so it would narrate partial facts and miss bullets that fell after the
    cutoff. Now it sees the full bulleted content."""
    bp = {k: "" for k in SECTION_KEYS}
    bullets = [
        "- React frontend",
        "- Node.js backend with Express",
        "- PostgreSQL with Drizzle ORM",
        "- Redis cache for session store",
        "- Tailwind for styling",
    ]
    bp["tech_stack"] = "\n".join(bullets)
    prompt = build_system_prompt(bp, [], None)
    # Every bullet must appear verbatim — no mid-sentence truncation.
    for b in bullets:
        body = b.lstrip("- ")
        assert body in prompt, f"bullet missing from prompt: {body!r}"


def test_build_system_prompt_uses_backend_coverage_when_provided():
    """Coverage scores in the radar must come from the supplied dict (the
    backend's ``assess_coverage`` output), not a parallel agent calculation."""
    bp = {k: "" for k in SECTION_KEYS}
    bp["tech_stack"] = "- Postgres\n- Redis"
    coverage = {
        "scores": {k: 0 for k in SECTION_KEYS} | {"tech_stack": 73},
        "overall": 73,
        "grade": "B",
        "gaps": [k for k in SECTION_KEYS if k != "tech_stack"],
        "sections": list(SECTION_KEYS),
    }
    prompt = build_system_prompt(bp, [], None, coverage=coverage)
    assert "73%" in prompt  # the supplied score, verbatim
    assert "(grade B)" in prompt


# ── SECTION_KEYS / SECTION_LABELS / BLUEPRINT_FLOW ───────────────────


def test_section_keys_not_empty():
    assert len(SECTION_KEYS) >= 10


def test_section_labels_match_keys():
    for key in SECTION_KEYS:
        assert key in SECTION_LABELS, f"{key} missing from SECTION_LABELS"


def test_blueprint_flow_has_questions():
    for key, label, question in BLUEPRINT_FLOW:
        assert key in SECTION_KEYS
        assert len(label) > 0
        assert len(question) > 0


# ── _create_tts ──────────────────────────────────────────────────────


def test_create_tts_elevenlabs_fallback():
    """When Cartesia is not available, should use ElevenLabs."""
    mock_tts = object()
    with (
        patch("agent.worker.HAS_CARTESIA", False),
        patch("agent.worker.elevenlabs.TTS", return_value=mock_tts),
    ):
        from agent.worker import _create_tts

        tts = _create_tts("test-voice-id")
        assert tts is mock_tts


def test_create_tts_emotion_validation():
    """_create_tts should not crash with any emotion value."""
    mock_tts = object()
    with (
        patch("agent.worker.HAS_CARTESIA", False),
        patch("agent.worker.elevenlabs.TTS", return_value=mock_tts),
    ):
        from agent.worker import _create_tts

        tts = _create_tts("test-voice-id", emotion="happy")
        assert tts is mock_tts


# ── _create_stt ──────────────────────────────────────────────────────


def test_create_stt_deepgram():
    """With DEEPGRAM_API_KEY set, should use Deepgram."""
    mock_stt = object()
    with (
        patch.dict("os.environ", {"DEEPGRAM_API_KEY": "test-key"}),
        patch("agent.worker.deepgram.STT", return_value=mock_stt),
    ):
        from agent.worker import _create_stt

        stt = _create_stt()
        assert stt is mock_stt


def test_create_stt_fallback_no_deepgram_key():
    """Without DEEPGRAM_API_KEY but with Google, should fall back to Google."""
    from agent import worker

    if worker.google_plugin is None:
        pytest.skip("livekit.plugins.google not installed in this environment")

    mock_stt = object()
    with (
        patch.dict("os.environ", {"DEEPGRAM_API_KEY": ""}, clear=False),
        patch("agent.worker.HAS_GOOGLE_STT", True),
        patch("agent.worker.google_plugin.STT", return_value=mock_stt),
    ):
        from agent.worker import _create_stt

        stt = _create_stt()
        assert stt is mock_stt


# ── _create_llm ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_llm_survives_provider_health_connection_error(caplog):
    """Regression for #89: a Redis outage must NOT crash the worker before it joins.

    `_create_llm` reads a Redis provider-health snapshot to decide whether
    to fail over to Gemini. If that read raises, we want the worker to
    proceed with Anthropic (the default path), not bubble out of the
    entrypoint retry loop and disconnect.
    """
    import logging

    # Importing the agent package first runs its layout shim, so the `app`
    # spelling below (the one worker.py actually imports) resolves.
    import agent.worker  # noqa: F401

    mock_llm = object()

    with (
        patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key", "GOOGLE_API_KEY": ""}, clear=False),
        patch(
            "app.services.provider_health.get",
            new=AsyncMock(side_effect=ConnectionError("simulated redis outage")),
        ),
        patch("agent.worker.anthropic.LLM", return_value=mock_llm),
        caplog.at_level(logging.WARNING),
    ):
        from agent.worker import _create_llm

        llm = await _create_llm()

    assert llm is mock_llm
    assert any("voice_agent_provider_health_unavailable" in rec.message for rec in caplog.records), (
        f"expected provider_health warning, got: {[r.message for r in caplog.records]}"
    )


@pytest.mark.asyncio
async def test_create_llm_survives_provider_health_import_error():
    """The cross-package `from src.app.services import provider_health` only
    resolves when the agent runs with `backend/` on PYTHONPATH. If a future
    deploy ever loses that path the import raises ModuleNotFoundError — the
    worker must still come up serving Anthropic, not crash silently."""
    import builtins

    mock_llm = object()
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "src.app.services" or name.startswith("src.app.services."):
            raise ModuleNotFoundError("simulated missing PYTHONPATH")
        return real_import(name, *args, **kwargs)

    with (
        patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key", "GOOGLE_API_KEY": ""}, clear=False),
        patch("builtins.__import__", side_effect=fake_import),
        patch("agent.worker.anthropic.LLM", return_value=mock_llm),
    ):
        from agent.worker import _create_llm

        llm = await _create_llm()

    assert llm is mock_llm


@pytest.mark.asyncio
async def test_create_llm_fatal_config_when_no_keys():
    """Fail-fast: no Anthropic key AND no Google key ⇒ FatalConfigError.

    Without this, the entrypoint retry loop wastes ~17s before posting
    "disconnected", and the frontend just shows "AI Facilitator unavailable"
    with no hint that the agent runtime is misconfigured.
    """
    from agent.worker import FatalConfigError, _create_llm

    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "", "GOOGLE_API_KEY": ""}, clear=False):
        with pytest.raises(FatalConfigError, match="no usable LLM"):
            await _create_llm()


# ── Agent status endpoint ────────────────────────────────────────────


async def test_agent_status_endpoint(client, auth_headers):
    """GET /api/sessions/{id}/agent-status should return agent connection info."""
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Test"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    with patch(
        "src.app.routers.livekit_routes.check_agent_in_room",
        new_callable=AsyncMock,
        return_value={"room_exists": False, "agent_connected": False, "participants": 0},
    ):
        resp = await client.get(f"/api/sessions/{session_id}/agent-status", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "agent_connected" in data
    assert data["agent_connected"] is False


async def test_agent_status_with_agent_connected(client, auth_headers):
    """When agent is in the room, agent_connected should be True."""
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Test"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    with patch(
        "src.app.routers.livekit_routes.check_agent_in_room",
        new_callable=AsyncMock,
        return_value={"room_exists": True, "agent_connected": True, "participants": 2},
    ):
        resp = await client.get(f"/api/sessions/{session_id}/agent-status", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["agent_connected"] is True


async def test_agent_status_session_not_found(client, auth_headers):
    """Should return 404 for non-existent session."""
    with patch(
        "src.app.routers.livekit_routes.check_agent_in_room",
        new_callable=AsyncMock,
    ):
        resp = await client.get("/api/sessions/nonexistent/agent-status", headers=auth_headers)

    assert resp.status_code == 404


# ── strip_markdown / FacilitatorAgent ───────────────────────────────


def test_strip_markdown_emphasis():
    assert strip_markdown("**Hello**, _world_!") == "Hello, world!"


def test_strip_markdown_headers_and_lists():
    assert strip_markdown("# Heading\n\n- bullet\n1. numbered") == "Heading. bullet numbered"


def test_strip_markdown_partial_chunk_is_safe():
    # Streaming chunks may split a paired marker — the strip must be safe per-chunk.
    assert strip_markdown("**") == ""
    assert strip_markdown("*bold") == "bold"
    # A double-asterisk split across two chunks reassembles correctly.
    assert strip_markdown("Hello **") + strip_markdown("world**") == "Hello world"


def test_strip_markdown_empty():
    assert strip_markdown("") == ""


async def _consume(aiter):
    out = []
    async for x in aiter:
        out.append(x)
    return out


@pytest.mark.asyncio
async def test_facilitator_transcription_node_strips_markdown():
    agent = FacilitatorAgent(instructions="test")

    async def chunks():
        for c in ["**Hello**, ", "_world_", "!"]:
            yield c

    out = await _consume(agent.transcription_node(chunks(), model_settings=None))
    assert "".join(out) == "Hello, world!"


@pytest.mark.asyncio
async def test_facilitator_transcription_node_skips_empty_chunks():
    agent = FacilitatorAgent(instructions="test")

    async def chunks():
        # `**` alone strips to empty string — must not yield empty entries.
        for c in ["**", "kept"]:
            yield c

    out = await _consume(agent.transcription_node(chunks(), model_settings=None))
    assert out == ["kept"]


# ── extract_and_update_blueprint queues pending suggestions ──────────


@pytest.mark.asyncio
async def test_extract_queues_pending_suggestions():
    """Extraction must POST each (section, content) pair as a pending
    suggestion — the agent no longer mutates the blueprint directly."""
    captured: list[dict] = []

    async def fake_messages_create(**kwargs):
        from types import SimpleNamespace

        return SimpleNamespace(
            content=[
                SimpleNamespace(
                    text='[{"section": "tech_stack", "content": "- Redis cache"},'
                    ' {"section": "risks_unknowns", "content": "- Auth migration"}]'
                )
            ]
        )

    async def fake_create(session_id, section, content, source_message_ids=None):
        captured.append({"session_id": session_id, "section": section, "content": content})
        return {"id": f"sugg-{len(captured)}", "status": "pending"}

    fake_client = AsyncMock()
    fake_client.messages.create.side_effect = fake_messages_create

    with (
        patch("agent.worker.AsyncAnthropic", return_value=fake_client),
        patch("agent.worker.create_blueprint_suggestion", side_effect=fake_create),
    ):
        await extract_and_update_blueprint(
            "sess-1",
            [{"speaker_name": "Alice", "content": "use redis", "message_type": "voice_chat"}],
            current_blueprint={"tech_stack": "- React"},
            base_version=7,  # accepted but unused — append-only suggestions
        )

    assert captured == [
        {"session_id": "sess-1", "section": "tech_stack", "content": "- Redis cache"},
        {"session_id": "sess-1", "section": "risks_unknowns", "content": "- Auth migration"},
    ]


@pytest.mark.asyncio
async def test_extract_skips_invalid_sections():
    """Extraction filters out unknown section keys (LLM hallucination guard)."""
    captured: list[dict] = []

    async def fake_messages_create(**kwargs):
        from types import SimpleNamespace

        return SimpleNamespace(
            content=[
                SimpleNamespace(
                    text='[{"section": "tech_stack", "content": "- Redis"},'
                    ' {"section": "made_up_section", "content": "- nope"},'
                    ' {"section": "tech_stack", "content": ""}]'
                )
            ]
        )

    async def fake_create(session_id, section, content, source_message_ids=None):
        captured.append({"section": section, "content": content})
        return {"id": "x", "status": "pending"}

    fake_client = AsyncMock()
    fake_client.messages.create.side_effect = fake_messages_create

    with (
        patch("agent.worker.AsyncAnthropic", return_value=fake_client),
        patch("agent.worker.create_blueprint_suggestion", side_effect=fake_create),
    ):
        await extract_and_update_blueprint(
            "sess-1",
            [{"speaker_name": "Alice", "content": "use redis", "message_type": "voice_chat"}],
            current_blueprint={},
        )

    # Only the valid + non-empty entry survives
    assert captured == [{"section": "tech_stack", "content": "- Redis"}]
