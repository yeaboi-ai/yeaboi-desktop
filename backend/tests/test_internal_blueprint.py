"""End-to-end tests for the agent's internal blueprint endpoint.

Covers the merge-mode write path that replaces the prior "the LLM is
responsible for re-emitting all bullets" approach (which silently lost
content whenever the LLM under-generated).
"""

from src.app.config import get_settings


async def _create_session(client, auth_headers) -> tuple[str, str]:
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "Test"},
        headers=auth_headers,
    )
    return project_id, sess.json()["id"]


def _internal_headers() -> dict:
    return {"X-Internal-Secret": get_settings().internal_api_secret}


async def test_agent_merge_preserves_prior_bullets(client, auth_headers):
    """The whole point: LLM emits ONLY new bullets and prior content survives."""
    project_id, session_id = await _create_session(client, auth_headers)

    # First agent extraction: discovers tech stack basics
    resp = await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={"section": "tech_stack", "content": "- React frontend\n- Node backend"},
        headers=_internal_headers(),
    )
    assert resp.status_code == 200

    # Second agent extraction: discovers ONE more thing. Under the OLD code
    # the LLM had to re-emit React + Node or they'd be wiped. Under merge it
    # only has to emit the new bullet.
    resp = await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={"section": "tech_stack", "content": "- Postgres database"},
        headers=_internal_headers(),
    )
    assert resp.status_code == 200
    stored = resp.json()["content"]
    assert "React frontend" in stored
    assert "Node backend" in stored
    assert "Postgres database" in stored


async def test_agent_merge_dedupes_repeated_bullets(client, auth_headers):
    project_id, session_id = await _create_session(client, auth_headers)

    await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={"section": "tech_stack", "content": "- React"},
        headers=_internal_headers(),
    )
    resp = await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={"section": "tech_stack", "content": "- React\n- Tailwind"},
        headers=_internal_headers(),
    )
    stored = resp.json()["content"]
    react_lines = [line for line in stored.split("\n") if "react" in line.lower()]
    assert len(react_lines) == 1


async def test_user_deletion_blocks_agent_re_add(client, auth_headers):
    """If the user deletes a bullet, the agent must NOT re-add it on the
    next extraction even when the conversation re-mentions it."""
    project_id, session_id = await _create_session(client, auth_headers)

    # Agent extracts initial tech
    await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={"section": "tech_stack", "content": "- React\n- Vue"},
        headers=_internal_headers(),
    )

    # User edits the section, removing Vue
    resp = await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "- React"},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Agent re-extracts and tries to add Vue back from a later utterance
    resp = await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={"section": "tech_stack", "content": "- Vue"},
        headers=_internal_headers(),
    )
    stored = resp.json()["content"]
    assert "Vue" not in stored
    assert "React" in stored


async def test_agent_replace_mode_when_explicitly_requested(client, auth_headers):
    project_id, session_id = await _create_session(client, auth_headers)

    await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={"section": "tech_stack", "content": "- React\n- Node"},
        headers=_internal_headers(),
    )

    resp = await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={
            "section": "tech_stack",
            "content": "- Svelte\n- Rust",
            "mode": "replace",
        },
        headers=_internal_headers(),
    )
    stored = resp.json()["content"]
    assert "React" not in stored
    assert "Node" not in stored
    assert "Svelte" in stored
    assert "Rust" in stored


async def test_coverage_endpoint_matches_assess_coverage(client, auth_headers):
    """The agent's spoken radar must use the same numbers the frontend shows."""
    from src.app.services.facilitator import assess_coverage

    project_id, session_id = await _create_session(client, auth_headers)

    # Fill a couple of sections so coverage isn't trivially zero.
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "- React\n- Node\n- PostgreSQL"},
        headers=auth_headers,
    )
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/project_overview",
        json={"content": "- Personal note-taking app for solo use"},
        headers=auth_headers,
    )

    # Fetch via the new internal endpoint
    resp = await client.get(
        f"/api/internal/sessions/{session_id}/coverage",
        headers=_internal_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()

    # Compare against the canonical function the frontend uses
    bp_resp = await client.get(
        f"/api/internal/sessions/{session_id}/blueprint",
        headers=_internal_headers(),
    )
    expected = assess_coverage(bp_resp.json()["content"])
    assert body["overall"] == expected["overall"]
    assert body["grade"] == expected["grade"]
    assert body["scores"] == expected["scores"]


async def test_agent_expected_version_409_on_mismatch(client, auth_headers):
    project_id, session_id = await _create_session(client, auth_headers)

    # Establish v2
    resp = await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={"section": "tech_stack", "content": "- React"},
        headers=_internal_headers(),
    )
    assert resp.status_code == 200
    current_version = resp.json()["version_number"]

    # Try to write with a stale expected_version
    resp = await client.patch(
        f"/api/internal/sessions/{session_id}/blueprint",
        json={
            "section": "tech_stack",
            "content": "- Tailwind",
            "expected_version": current_version - 1,
        },
        headers=_internal_headers(),
    )
    assert resp.status_code == 409


async def test_get_session_messages_paginates_with_limit(client, auth_headers):
    """The agent's boot fetch must not load thousands of rows on long sessions.

    Verifies the route honors ``?limit=N``. The strict "most-recent" ordering
    relies on Postgres millisecond precision in production; SQLite's
    second-precision timestamps make row order among same-second inserts
    non-deterministic, so this test only asserts the count.
    """
    project_id, session_id = await _create_session(client, auth_headers)

    for i in range(15):
        resp = await client.post(
            "/api/internal/messages",
            json={
                "session_id": session_id,
                "content": f"msg {i}",
                "message_type": "voice_chat",
                "speaker_name": "Alice",
            },
            headers=_internal_headers(),
        )
        assert resp.status_code in (200, 201)

    resp = await client.get(
        f"/api/internal/sessions/{session_id}/messages",
        params={"limit": 5},
        headers=_internal_headers(),
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 5  # capped at requested limit, not all 15

    # No explicit limit defaults to 200 — but never returns more than seeded.
    resp = await client.get(
        f"/api/internal/sessions/{session_id}/messages",
        headers=_internal_headers(),
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 15


async def test_agent_runtime_state_roundtrip(client, auth_headers):
    """Persisted runtime state must survive a worker restart cycle so the
    agent doesn't lose speaker diarization, used personas, or last-extracted
    index when the process bounces."""
    project_id, session_id = await _create_session(client, auth_headers)

    # Initially empty.
    resp = await client.get(
        f"/api/internal/sessions/{session_id}/agent-state",
        headers=_internal_headers(),
    )
    assert resp.status_code == 200
    assert resp.json() == {"state": {}}

    snapshot = {
        "speaker_id_map": {"0": "user-1", "1": "user-2"},
        "participant_order": ["user-1", "user-2"],
        "posted_texts": ["hi", "what's up"],
        "last_extracted_idx": 17,
        "current_persona": "pm",
    }
    resp = await client.patch(
        f"/api/internal/sessions/{session_id}/agent-state",
        json={"state": snapshot},
        headers=_internal_headers(),
    )
    assert resp.status_code == 200

    resp = await client.get(
        f"/api/internal/sessions/{session_id}/agent-state",
        headers=_internal_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == snapshot


async def test_user_edit_broadcasts_to_internal_watchers(client, app, auth_headers):
    """When a user manually edits the blueprint, an internal subscriber
    (the LiveKit agent) must receive the event so it can refresh its
    system prompt — instead of narrating stale content."""
    from src.app.ws.manager import manager

    project_id, session_id = await _create_session(client, auth_headers)

    # Stand in for the agent's WS subscription.
    received: list[dict] = []

    class FakeWebSocket:
        async def send_text(self, text: str) -> None:
            import json as _json

            received.append(_json.loads(text))

    fake = FakeWebSocket()
    manager.internal_watchers[session_id].append(fake)
    try:
        # User edits the blueprint via the project route.
        resp = await client.patch(
            f"/api/projects/{project_id}/blueprint/sections/tech_stack",
            json={"content": "- React frontend"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
    finally:
        manager.disconnect_internal_watcher(session_id, fake)

    blueprint_events = [e for e in received if e.get("type") == "blueprint_update"]
    assert blueprint_events, "agent watcher saw no blueprint_update event"
    payload = blueprint_events[-1]["payload"]
    assert payload["section"] == "tech_stack"
    assert "React frontend" in payload["content"]
    assert payload.get("source") == "user"
