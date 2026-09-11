import pytest


async def test_create_session(client, auth_headers):
    # First create a project
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Build a todo app"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    # Sessions start "live" today — blueprint seeding runs inline and the
    # user lands straight in the session.
    assert data["status"] == "live"
    assert data["initial_idea"] == "Build a todo app"
    assert "join_code" in data
    assert "id" in data


async def test_create_session_persists_focus_target(client, auth_headers):
    """Phase 3 coverage-aware launcher payload must round-trip on create and
    show up on subsequent reads. Backend derives focus_sections from
    focus_target.sections when the caller omits the explicit field."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={
            "initial_idea": "Iter on the API layer",
            "focus_target": {
                "mode": "deep_dive",
                "sections": ["api_integrations"],
                "bullet_ids": ["postgres for primary store"],
            },
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    sid = resp.json()["id"]
    assert resp.json()["focus_target"]["mode"] == "deep_dive"
    # focus_sections derived from focus_target.sections so the existing
    # facilitator scoping path keeps working without changes.
    assert resp.json()["focus_sections"] == ["api_integrations"]

    fresh = await client.get(f"/api/sessions/{sid}", headers=auth_headers)
    assert fresh.json()["focus_target"]["bullet_ids"] == ["postgres for primary store"]


async def test_create_session_persists_pace(client, auth_headers):
    """Pace selector ("fast" | "balanced" | "deep") from the session launcher
    must round-trip into ai_config so the facilitator and voice worker can
    read it on every turn. Default is "balanced" — matches today's behaviour."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    # Explicit fast.
    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Triage this bug fast", "pace": "fast"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["ai_config"].get("pace") == "fast"


async def test_create_session_pace_defaults_to_balanced(client, auth_headers):
    """Omitting pace must persist "balanced" — never None — so the worker
    always has a value to look up in PACE_BUDGETS."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Whatever"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["ai_config"].get("pace") == "balanced"


async def test_create_session_invalid_pace_falls_back_to_balanced(client, auth_headers):
    """An invalid pace value (older client, fat-finger, etc.) must not blow
    up the create endpoint — services.pace.normalise_pace coerces unknown
    values to balanced."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Bogus pace", "pace": "lightspeed"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["ai_config"].get("pace") == "balanced"


async def test_create_session_persists_technical_comfort(client, auth_headers):
    """Comfort level from the session launcher round-trips into ai_config so
    the facilitator picks it up on every turn. Mirrors the pace pattern."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Plain English please", "technical_comfort": "non_technical"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["ai_config"].get("technical_comfort") == "non_technical"


async def test_create_session_technical_comfort_defaults_to_comfortable(client, auth_headers):
    """Omitting the field must persist "comfortable" — never None — so the
    facilitator always has a value to look up in TECHNICAL_COMFORT_PROMPTS."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "No comfort field"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["ai_config"].get("technical_comfort") == "comfortable"


async def test_create_session_invalid_technical_comfort_falls_back(client, auth_headers):
    """Unknown comfort values must not 422 — normalise_technical_comfort
    coerces to "comfortable" the same way pace falls back to balanced."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Bogus level", "technical_comfort": "ninja-grade"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["ai_config"].get("technical_comfort") == "comfortable"


async def test_patch_session_technical_comfort_merges_without_clobbering(client, auth_headers):
    """Mid-session toggle PATCHes ai_config with only the comfort key — the
    rest of ai_config (persona, pace, etc.) must survive the merge."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    create = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Will toggle", "pace": "deep", "persona": "pm"},
        headers=auth_headers,
    )
    session_id = create.json()["id"]

    patch = await client.patch(
        f"/api/sessions/{session_id}",
        json={"ai_config": {"technical_comfort": "expert"}},
        headers=auth_headers,
    )
    assert patch.status_code == 200

    get = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    cfg = get.json()["ai_config"]
    assert cfg.get("technical_comfort") == "expert"
    assert cfg.get("pace") == "deep"
    assert cfg.get("persona") == "pm"


async def test_create_session_explicit_focus_sections_wins_over_target(client, auth_headers):
    """When both focus_sections and focus_target are sent, the explicit
    focus_sections takes precedence — the launcher only auto-derives when
    the caller stays silent on focus_sections."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={
            "initial_idea": "Override",
            "focus_sections": ["tech_stack"],
            "focus_target": {
                "mode": "deep_dive",
                "sections": ["api_integrations"],
                "bullet_ids": [],
            },
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["focus_sections"] == ["tech_stack"]
    assert resp.json()["focus_target"]["sections"] == ["api_integrations"]


async def test_list_sessions(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]

    # One continuation is enough for list coverage.
    await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Idea 1"},
        headers=auth_headers,
    )

    resp = await client.get(f"/api/sessions/{session_id}/continuations", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


async def test_get_session(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]

    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Build a thing"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    resp = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["initial_idea"] == "Build a thing"
    assert len(resp.json()["participants"]) == 1  # Host auto-joined


async def test_update_session_status(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]

    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Build a thing"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    # Session starts at "live" now — transition to "paused" (valid from live).
    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"status": "paused"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"


async def test_join_session_via_code(client, auth_headers, other_auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]

    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Collab"},
        headers=auth_headers,
    )
    join_code = create_resp.json()["join_code"]

    resp = await client.post(f"/api/sessions/join/{join_code}", headers=other_auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == create_resp.json()["id"]


async def test_send_chat_message(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]

    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Chat test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    # Move to live via two transitions: created -> lobby -> live
    await client.patch(f"/api/sessions/{session_id}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{session_id}", json={"status": "live"}, headers=auth_headers)

    resp = await client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": "Hello world"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["content"] == "Hello world"
    assert resp.json()["message_type"] == "chat"


async def test_toggle_message_reaction(client, auth_headers):
    """Toggling a reaction adds the user's id; toggling again removes it."""
    proj = await client.post("/api/sessions", json={"name": "ReactProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    session_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "React test"},
        headers=auth_headers,
    )
    session_id = session_resp.json()["id"]
    await client.patch(f"/api/sessions/{session_id}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{session_id}", json={"status": "live"}, headers=auth_headers)

    msg_resp = await client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": "let's plan!"},
        headers=auth_headers,
    )
    assert msg_resp.status_code == 201
    msg_id = msg_resp.json()["id"]

    add_resp = await client.post(
        f"/api/sessions/{session_id}/messages/{msg_id}/reactions",
        json={"emoji": "👍"},
        headers=auth_headers,
    )
    assert add_resp.status_code == 200, add_resp.text
    body = add_resp.json()
    assert body["message_id"] == msg_id
    assert "👍" in body["reactions"]
    assert len(body["reactions"]["👍"]) == 1

    # Same user toggling the same emoji removes it.
    remove_resp = await client.post(
        f"/api/sessions/{session_id}/messages/{msg_id}/reactions",
        json={"emoji": "👍"},
        headers=auth_headers,
    )
    assert remove_resp.status_code == 200
    assert remove_resp.json()["reactions"] == {}


async def test_reaction_rejects_non_participant(client, auth_headers, other_auth_headers):
    proj = await client.post("/api/sessions", json={"name": "ReactAuth"}, headers=auth_headers)
    session_id = proj.json()["id"]
    session_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "auth"},
        headers=auth_headers,
    )
    session_id = session_resp.json()["id"]
    await client.patch(f"/api/sessions/{session_id}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{session_id}", json={"status": "live"}, headers=auth_headers)
    msg_resp = await client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": "hi"},
        headers=auth_headers,
    )
    msg_id = msg_resp.json()["id"]

    forbidden = await client.post(
        f"/api/sessions/{session_id}/messages/{msg_id}/reactions",
        json={"emoji": "🎉"},
        headers=other_auth_headers,
    )
    assert forbidden.status_code == 403


async def test_reaction_404_for_unknown_message(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "React404"}, headers=auth_headers)
    session_id = proj.json()["id"]
    session_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "404"},
        headers=auth_headers,
    )
    session_id = session_resp.json()["id"]
    await client.patch(f"/api/sessions/{session_id}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{session_id}", json={"status": "live"}, headers=auth_headers)
    resp = await client.post(
        f"/api/sessions/{session_id}/messages/does-not-exist/reactions",
        json={"emoji": "🔥"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_is_emoji_only_detects_emoji_messages():
    from src.app.services.chat_responder import is_emoji_only

    assert is_emoji_only("🎉") is True
    assert is_emoji_only("👍🏼") is True
    assert is_emoji_only(" 😀 😀 ") is True
    assert is_emoji_only("hello") is False
    assert is_emoji_only("hi 🎉") is False
    assert is_emoji_only("") is False


async def test_redact_chat_message(client, auth_headers):
    """W5.7.5 — PATCH with redact=true replaces content with [redacted] and
    preserves the original in original_content."""
    proj = await client.post("/api/sessions", json={"name": "RedactP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    session_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Redact test"},
        headers=auth_headers,
    )
    session_id = session_resp.json()["id"]
    await client.patch(f"/api/sessions/{session_id}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{session_id}", json={"status": "live"}, headers=auth_headers)

    msg_resp = await client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": "my SSN is 123-45-6789"},
        headers=auth_headers,
    )
    assert msg_resp.status_code == 201
    msg_id = msg_resp.json()["id"]

    redact_resp = await client.patch(
        f"/api/sessions/{session_id}/messages/{msg_id}",
        json={"redact": True},
        headers=auth_headers,
    )
    assert redact_resp.status_code == 200, redact_resp.text
    body = redact_resp.json()
    assert body["content"] == "[redacted]"
    assert body["original_content"] == "my SSN is 123-45-6789"


async def test_edit_chat_message_requires_content_when_not_redacting(client, auth_headers):
    """PATCH must reject empty body (neither content nor redact provided)."""
    proj = await client.post("/api/sessions", json={"name": "EditP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    session_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Edit test"},
        headers=auth_headers,
    )
    session_id = session_resp.json()["id"]
    await client.patch(f"/api/sessions/{session_id}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{session_id}", json={"status": "live"}, headers=auth_headers)
    msg = await client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": "original"},
        headers=auth_headers,
    )
    msg_id = msg.json()["id"]

    bad = await client.patch(
        f"/api/sessions/{session_id}/messages/{msg_id}",
        json={},
        headers=auth_headers,
    )
    assert bad.status_code == 400


async def test_co_host_promotion_grants_update_permission(client, auth_headers, other_auth_headers):
    """W4.3.5 — host promotes another participant to co_host; co_host can then PATCH session status."""
    proj = await client.post("/api/sessions", json={"name": "CoHostP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "co-host test"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    join_code = s.json()["join_code"]

    # Other user joins.
    join = await client.post(f"/api/sessions/join/{join_code}", headers=other_auth_headers)
    assert join.status_code == 200, join.text

    # Before promotion, other user cannot update session.
    fail = await client.patch(f"/api/sessions/{sid}", json={"title": "Renamed"}, headers=other_auth_headers)
    assert fail.status_code == 403

    # Host fetches participant ids.
    fetched = await client.get(f"/api/sessions/{sid}", headers=auth_headers)
    other_p = next(p for p in fetched.json()["participants"] if p["role"] != "host")

    # Host promotes them to co_host.
    promote = await client.patch(
        f"/api/sessions/{sid}/participants/{other_p['id']}/role",
        json={"role": "co_host"},
        headers=auth_headers,
    )
    assert promote.status_code == 200, promote.text
    assert promote.json()["role"] == "co_host"

    # Co-host can now PATCH the session.
    ok = await client.patch(f"/api/sessions/{sid}", json={"title": "Renamed by co-host"}, headers=other_auth_headers)
    assert ok.status_code == 200, ok.text


async def test_role_change_rejects_non_host(client, auth_headers, other_auth_headers):
    """A non-host calling the role endpoint gets 403."""
    proj = await client.post("/api/sessions", json={"name": "RoleP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    join_code = s.json()["join_code"]
    await client.post(f"/api/sessions/join/{join_code}", headers=other_auth_headers)

    # other_auth (member) tries to promote themselves
    fetched = await client.get(f"/api/sessions/{sid}", headers=auth_headers)
    other_p = next(p for p in fetched.json()["participants"] if p["role"] != "host")
    bad = await client.patch(
        f"/api/sessions/{sid}/participants/{other_p['id']}/role",
        json={"role": "co_host"},
        headers=other_auth_headers,
    )
    assert bad.status_code == 403


async def test_role_change_validates_role_value(client, auth_headers):
    """role must be co_host or member."""
    proj = await client.post("/api/sessions", json={"name": "RoleVP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    fetched = await client.get(f"/api/sessions/{sid}", headers=auth_headers)
    me = fetched.json()["participants"][0]
    bad = await client.patch(
        f"/api/sessions/{sid}/participants/{me['id']}/role",
        json={"role": "admin"},
        headers=auth_headers,
    )
    assert bad.status_code == 422


async def test_recording_consent_set_and_persist(client, auth_headers):
    """W5.7.4 — PATCH /recording-consent persists tri-state value (true/false/null)."""
    proj = await client.post("/api/sessions", json={"name": "ConsentP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "consent"},
        headers=auth_headers,
    )
    sid = s.json()["id"]

    # Default: NULL.
    fetched = await client.get(f"/api/sessions/{sid}", headers=auth_headers)
    me_initial = next(p for p in fetched.json()["participants"])
    assert me_initial["recording_consent"] is None

    # Accept.
    accept = await client.patch(
        f"/api/sessions/{sid}/recording-consent",
        json={"consent": True},
        headers=auth_headers,
    )
    assert accept.status_code == 200, accept.text
    assert accept.json()["consent"] is True

    # Decline.
    decline = await client.patch(
        f"/api/sessions/{sid}/recording-consent",
        json={"consent": False},
        headers=auth_headers,
    )
    assert decline.status_code == 200
    assert decline.json()["consent"] is False

    # Reset to NULL.
    null = await client.patch(
        f"/api/sessions/{sid}/recording-consent",
        json={"consent": None},
        headers=auth_headers,
    )
    assert null.status_code == 200
    assert null.json()["consent"] is None


async def test_recording_consent_validates_type(client, auth_headers):
    """consent must be bool or null, not arbitrary types."""
    proj = await client.post("/api/sessions", json={"name": "ConsentVP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    bad = await client.patch(
        f"/api/sessions/{sid}/recording-consent",
        json={"consent": "yes"},
        headers=auth_headers,
    )
    assert bad.status_code == 422


async def test_summarize_recent_no_messages(client, auth_headers):
    """W4.3.3 — empty conversation returns the no-content fallback string."""
    proj = await client.post("/api/sessions", json={"name": "SumP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "summarize"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    resp = await client.post(f"/api/sessions/{sid}/summarize-recent?minutes=5", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["message_count"] == 0
    assert "Nothing said" in body["summary"]


async def test_summarize_recent_validates_minutes(client, auth_headers):
    """`minutes` outside 1..60 returns 422."""
    proj = await client.post("/api/sessions", json={"name": "SumP422"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    resp = await client.post(f"/api/sessions/{sid}/summarize-recent?minutes=0", headers=auth_headers)
    assert resp.status_code == 422
    resp = await client.post(f"/api/sessions/{sid}/summarize-recent?minutes=999", headers=auth_headers)
    assert resp.status_code == 422


async def test_summarize_recent_falls_back_without_ai_provider(client, auth_headers):
    """When no AI provider is wired, returns a deterministic summary."""
    proj = await client.post("/api/sessions", json={"name": "SumPNoAI"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    await client.patch(f"/api/sessions/{sid}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{sid}", json={"status": "live"}, headers=auth_headers)
    await client.post(
        f"/api/sessions/{sid}/messages",
        json={"content": "first thought"},
        headers=auth_headers,
    )
    resp = await client.post(f"/api/sessions/{sid}/summarize-recent?minutes=5", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["message_count"] >= 1
    # Without an AI provider configured, falls back to "AI summarization isn't configured".
    assert "AI summarization isn't configured" in body["summary"] or len(body["summary"]) > 0


async def test_explain_term_validates_input(client, auth_headers):
    """Empty / oversized terms must 422, not crash the AI call downstream."""
    proj = await client.post("/api/sessions", json={"name": "ExpTerm"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    sid = s.json()["id"]

    bad_empty = await client.post(
        f"/api/sessions/{sid}/explain-term",
        json={"term": "  "},
        headers=auth_headers,
    )
    assert bad_empty.status_code == 422

    bad_long = await client.post(
        f"/api/sessions/{sid}/explain-term",
        json={"term": "x" * 200},
        headers=auth_headers,
    )
    assert bad_long.status_code == 422


async def test_explain_term_falls_back_without_ai_provider(client, auth_headers):
    """When no AI provider is wired, the endpoint still returns a renderable
    GlossaryEntry-shaped payload so the popover can render something."""
    proj = await client.post("/api/sessions", json={"name": "ExpTermNoAI"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    sid = s.json()["id"]

    resp = await client.post(
        f"/api/sessions/{sid}/explain-term",
        json={"term": "circuit breaker"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Same shape as a static GlossaryEntry — keys must always be present.
    assert body["term"] == "circuit breaker"
    assert body["slug"] == "circuit-breaker"
    assert isinstance(body["definition"], str) and len(body["definition"]) > 0
    assert "examples" in body and isinstance(body["examples"], list)
    assert "learnMore" in body and isinstance(body["learnMore"], list)


async def test_send_recap_email_no_resend_key(client, auth_headers, monkeypatch):
    """W6.6.5 — endpoint returns 200 with sent=0 when Resend isn't configured."""
    proj = await client.post("/api/sessions", json={"name": "RecapP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "recap"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    await client.patch(f"/api/sessions/{sid}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{sid}", json={"status": "live"}, headers=auth_headers)
    await client.post(
        f"/api/sessions/{sid}/messages",
        json={"content": "first message"},
        headers=auth_headers,
    )

    resp = await client.post(f"/api/sessions/{sid}/recap-email", headers=auth_headers)
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["recipients"] >= 1
    # No Resend key configured in the test env → sent=0 is the expected
    # graceful-disable behavior, matching the email_service contract.
    assert body["sent"] == 0


async def test_send_recap_email_not_participant(client, auth_headers, other_auth_headers):
    """Non-participants must get 403."""
    proj = await client.post("/api/sessions", json={"name": "RecapPriv"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "private"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    resp = await client.post(f"/api/sessions/{sid}/recap-email", headers=other_auth_headers)
    assert resp.status_code in (403, 404)  # 404 if RLS blocks the lookup; either is acceptable


async def test_redact_chat_message_not_found(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P404"}, headers=auth_headers)
    session_id = proj.json()["id"]
    session_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "404 test"},
        headers=auth_headers,
    )
    session_id = session_resp.json()["id"]
    resp = await client.patch(
        f"/api/sessions/{session_id}/messages/00000000-0000-0000-0000-000000000000",
        json={"redact": True},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_facilitator_exception_surfaces_system_message(client, auth_headers, app, db_engine):
    """When process_message raises inside _run_facilitator, the user sees a
    ⚠️ system chat message instead of silence."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    proj = await client.post("/api/sessions", json={"name": "ErrProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "trigger-error"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    # _run_facilitator calls get_session_factory() directly (bypasses FastAPI DI),
    # so we patch it to use the test engine the client is running against.
    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    sent: list[dict] = []

    async def capture(_sid, payload):
        sent.append(payload)

    with (
        patch(
            "src.app.routers.sessions.process_message",
            AsyncMock(side_effect=RuntimeError("boom — simulated failure")),
        ),
        patch(
            "src.app.routers.sessions.get_session_factory",
            return_value=test_factory,
        ),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock(side_effect=capture)),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "trigger-error")

    # ai_thinking false + error system message should both be sent
    ai_thinking_false = [p for p in sent if p.get("type") == "ai_thinking" and p.get("thinking") is False]
    assert ai_thinking_false, "expected ai_thinking=false after exception"

    error_msgs = [
        p
        for p in sent
        if p.get("type") == "chat_message" and "Facilitator failed" in (p.get("payload", {}).get("content") or "")
    ]
    assert error_msgs, f"expected Facilitator-failed chat_message in {sent}"
    payload = error_msgs[0]["payload"]
    assert payload["message_type"] == "system"
    assert "RuntimeError" in payload["content"]
    assert "boom — simulated failure" in payload["content"]


@pytest.mark.skip(
    reason=(
        "Test predates the per-screen role-based pipeline. It mocks "
        "`get_ai_client` but generation now goes through "
        "`get_ai_client_for_role` (preflight, plan inference, shell, hero, "
        "DNA), so the mock never intercepts and the test hits real APIs. "
        "Needs rewriting against the new flow before re-enabling."
    ),
)
async def test_wireframe_diagram_defaults_fidelity_to_low_when_missing(client, auth_headers, app, db_engine):
    """If the AI-emitted wireframe JSON is missing `fidelity`, it's stored as 'low'
    so the frontend always has a concrete value to branch on."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import Session as SessionModel

    proj = await client.post("/api/sessions", json={"name": "WFProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "ui session"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # Emulate the AI returning a wireframe JSON WITHOUT a fidelity field.
    mock_ai = AsyncMock()
    mock_ai.chat = AsyncMock(
        return_value='{"type":"wireframe","title":"Home","screens":[{"id":"home","name":"Home","device":"mobile","html":"<div>x</div>"}]}'
    )

    with (
        patch(
            "src.app.routers.sessions.get_session_factory",
            return_value=test_factory,
        ),
        patch(
            "src.app.services.ai_provider.get_ai_client",
            AsyncMock(return_value=mock_ai),
        ),
        patch(
            "src.app.routers.sessions.manager.send_to",
            AsyncMock(),
        ),
    ):
        from src.app.routers.sessions import _extract_diagram_inline

        async with test_factory() as db:
            sess = (await db.execute(select(SessionModel).where(SessionModel.id == session_id))).scalar_one()
            await _extract_diagram_inline(
                session_id,
                sess,
                [{"content": "wireframe the login screen", "message_type": "chat", "user_name": "User"}],
                "Here's a sketch.",
                db,
            )
            await db.refresh(sess)

        # Verify fidelity defaulted to "low"
        async with test_factory() as db:
            sess = (await db.execute(select(SessionModel).where(SessionModel.id == session_id))).scalar_one()
            wf = (sess.diagram_state or {}).get("wireframe")
            assert wf is not None, f"wireframe not stored: {sess.diagram_state}"
            assert wf.get("fidelity") == "low", f"expected fidelity=low, got {wf.get('fidelity')!r}"


# ─── Slack dispatch_event wiring ──────────────────────────────────────────────


async def test_session_created_does_not_dispatch_slack_event(client, auth_headers):
    """session_created Slack notification was removed because it was too noisy
    (users iterating on multiple drafts triggered constant Slack chatter).
    Verify the dispatch is NOT called for that event type."""
    from unittest.mock import AsyncMock, patch

    proj = await client.post("/api/sessions", json={"name": "Slack Test"}, headers=auth_headers)
    session_id = proj.json()["id"]

    with patch("src.app.routers.sessions.dispatch_event", new_callable=AsyncMock) as mock_dispatch:
        resp = await client.post(
            f"/api/sessions/{session_id}/continuations",
            json={"initial_idea": "Test dispatch"},
            headers=auth_headers,
        )
        assert resp.status_code == 201

    event_types = [
        (c.kwargs.get("event_type") or (c.args[1] if len(c.args) > 1 else None)) for c in mock_dispatch.call_args_list
    ]
    assert "session_created" not in event_types


async def test_dispatch_event_called_on_session_completed(client, auth_headers):
    """dispatch_event is called with session_completed when status transitions to completed."""
    from unittest.mock import AsyncMock, patch

    proj = await client.post("/api/sessions", json={"name": "Slack Test 2"}, headers=auth_headers)
    session_id = proj.json()["id"]

    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Complete me"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    # Transition: created → lobby → live → completed
    await client.patch(f"/api/sessions/{session_id}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{session_id}", json={"status": "live"}, headers=auth_headers)

    with patch("src.app.routers.sessions.dispatch_event", new_callable=AsyncMock) as mock_dispatch:
        resp = await client.patch(
            f"/api/sessions/{session_id}",
            json={"status": "completed"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    event_types = [
        (c.kwargs.get("event_type") or (c.args[1] if len(c.args) > 1 else None)) for c in mock_dispatch.call_args_list
    ]
    assert "session_completed" in event_types


async def test_session_deleted_does_not_dispatch_slack_event(client, auth_headers):
    """session_deleted Slack notification was removed alongside session_created
    for the same reason — it was paired noise. Verify dispatch is NOT called."""
    from unittest.mock import AsyncMock, patch

    proj = await client.post("/api/sessions", json={"name": "Slack Test 3"}, headers=auth_headers)
    session_id = proj.json()["id"]

    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Delete me"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    with patch("src.app.routers.sessions.dispatch_event", new_callable=AsyncMock) as mock_dispatch:
        resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
        assert resp.status_code == 204

    event_types = [
        (c.kwargs.get("event_type") or (c.args[1] if len(c.args) > 1 else None)) for c in mock_dispatch.call_args_list
    ]
    assert "session_deleted" not in event_types


async def test_delete_session_clears_session_event_rows(client, auth_headers, db_session):
    """Deleting a session must purge session_events + session_context rows that reference it.

    Regression: commit 1d8cf38 added these tables without updating the session delete cascade,
    which blew up with a FK violation on Postgres and left orphaned rows on SQLite.
    """
    from sqlalchemy import select

    from src.app.models.session_event import SessionContext, SessionEvent

    proj = await client.post("/api/sessions", json={"name": "Session children test"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Has child rows"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    db_session.add(SessionEvent(session_id=session_id, event_type="message", source="chat", payload={"text": "hi"}))
    db_session.add(SessionContext(session_id=session_id, directory={"people": []}))
    await db_session.commit()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text

    events = (await db_session.execute(select(SessionEvent).where(SessionEvent.session_id == session_id))).all()
    ctxs = (await db_session.execute(select(SessionContext).where(SessionContext.session_id == session_id))).all()
    assert events == []
    assert ctxs == []


async def test_delete_project_clears_session_children(client, auth_headers, db_session):
    """Deleting a project must purge session_events + session_context rows for its sessions.

    Regression: delete_project only cleaned chat_messages/participants/transcript_entries,
    so newer child tables (session_events, session_context) blocked the cascade on Postgres.
    """
    from sqlalchemy import select

    from src.app.models.session_event import SessionContext, SessionEvent

    proj = await client.post("/api/sessions", json={"name": "Session children test"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Session with events"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    db_session.add(SessionEvent(session_id=session_id, event_type="message", source="chat", payload={"text": "hi"}))
    db_session.add(SessionContext(session_id=session_id, directory={"people": []}))
    await db_session.commit()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text

    events = (await db_session.execute(select(SessionEvent).where(SessionEvent.session_id == session_id))).all()
    ctxs = (await db_session.execute(select(SessionContext).where(SessionContext.session_id == session_id))).all()
    assert events == []
    assert ctxs == []


async def test_wireframe_enhance_promotes_fidelity_and_injects_tokens(client, auth_headers, app, db_engine):
    """POST /api/sessions/{id}/wireframe/enhance re-runs wireframe generation with
    fidelity='high' and the design-system tokens injected into the prompt."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import Session as SessionModel

    proj = await client.post("/api/sessions", json={"name": "EnhanceProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "ui session"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # Seed a low-fi wireframe into diagram_state
    async with test_factory() as db:
        sess = (await db.execute(select(SessionModel).where(SessionModel.id == session_id))).scalar_one()
        sess.diagram_state = {
            "wireframe": {
                "type": "wireframe",
                "title": "Home",
                "fidelity": "low",
                "screens": [{"id": "home", "name": "Home", "device": "mobile", "html": "<div>x</div>"}],
            }
        }
        await db.commit()

    # Mock AI returns a hi-fi wireframe
    mock_ai = AsyncMock()
    mock_ai.chat = AsyncMock(
        return_value='{"type":"wireframe","title":"Home","fidelity":"high","screens":[{"id":"home","name":"Home","device":"mobile","html":"<div style=\\"color:#e5a630\\">x</div>"}]}'
    )

    payload = {
        "design_system": {
            "colors": {"primary": "#e5a630", "background": "#0a0a0a", "text": "#e8e8e8"},
            "typography": {"family": "system-ui"},
        },
        "design_memo": {"why_this_fits": "test"},
    }

    mock_send = AsyncMock()
    with (
        patch(
            "src.app.services.ai_provider.get_ai_client",
            AsyncMock(return_value=mock_ai),
        ),
        patch(
            "src.app.routers.sessions.manager.send_to",
            mock_send,
        ),
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/wireframe/enhance",
            json=payload,
            headers=auth_headers,
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["wireframe"]["fidelity"] == "high"
    assert data["wireframe"]["screens"][0]["html"].startswith("<div")

    # Prompt should have included the primary colour token
    call_kwargs = mock_ai.chat.call_args.kwargs if mock_ai.chat.call_args.kwargs else {}
    call_args = mock_ai.chat.call_args.args
    combined = str(call_kwargs) + str(call_args)
    assert "#e5a630" in combined, "design tokens not injected into prompt"
    # Verify the diagram_update WS broadcast fired with the correct payload
    mock_send.assert_called_once()
    (sid_arg, payload_arg) = mock_send.call_args.args
    assert sid_arg == session_id
    assert payload_arg["type"] == "diagram_update"
    assert payload_arg["payload"]["fidelity"] == "high"


async def test_wireframe_enhance_400_when_design_system_missing(client, auth_headers, db_engine):
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import Session as SessionModel

    proj = await client.post("/api/sessions", json={"name": "NoDS"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "ui session"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with test_factory() as db:
        sess = (await db.execute(select(SessionModel).where(SessionModel.id == session_id))).scalar_one()
        sess.diagram_state = {"wireframe": {"type": "wireframe", "title": "H", "fidelity": "low", "screens": []}}
        await db.commit()

    resp = await client.post(
        f"/api/sessions/{session_id}/wireframe/enhance",
        json={},  # no design_system
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "design_system" in resp.json().get("detail", "").lower()


async def test_wireframe_enhance_404_when_no_wireframe(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "NoWF"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "ui session"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/wireframe/enhance",
        json={"design_system": {"colors": {}}},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_wireframe_enhance_403_for_non_participant(client, auth_headers, other_auth_headers, db_engine):
    """A user who didn't create the session cannot enhance its wireframe."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import Session as SessionModel

    # auth_headers user creates project + session
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "ui"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    # Seed a wireframe
    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with test_factory() as db:
        sess = (await db.execute(select(SessionModel).where(SessionModel.id == session_id))).scalar_one()
        sess.diagram_state = {"wireframe": {"type": "wireframe", "title": "H", "fidelity": "low", "screens": []}}
        await db.commit()

    # other_auth_headers user attempts enhance
    resp = await client.post(
        f"/api/sessions/{session_id}/wireframe/enhance",
        json={"design_system": {"colors": {"primary": "#000"}}},
        headers=other_auth_headers,
    )
    assert resp.status_code == 403


# ─── Wireframe device pinning + facilitator awareness ──────────────────────────


def test_pick_target_device_pins_to_existing_mode():
    """When a wireframe already has screens, new screens reuse the dominant device.

    Why: facilitator was flipping device between turns (desktop → mobile)
    because each generation made an independent choice.
    """
    from src.app.routers.sessions import _pick_target_device

    state = {
        "wireframe": {
            "screens": [
                {"id": "home", "device": "desktop"},
                {"id": "settings", "device": "desktop"},
                {"id": "profile", "device": "mobile"},
            ]
        }
    }
    assert _pick_target_device(state, "add a help page") == "desktop"


def test_pick_target_device_uses_message_keywords_when_empty():
    from src.app.routers.sessions import _pick_target_device

    assert _pick_target_device({}, "wireframe the iPhone app") == "mobile"
    assert _pick_target_device({}, "design the tablet view") == "tablet"
    assert _pick_target_device({}, "build me a SaaS dashboard") == "desktop"


def test_pick_target_device_defaults_to_desktop():
    from src.app.routers.sessions import _pick_target_device

    assert _pick_target_device({}, "") == "desktop"
    assert _pick_target_device(None, "spin up screens") == "desktop"


def test_format_wireframe_summary_lists_screens_and_device():
    from src.app.routers.sessions import _format_wireframe_summary

    state = {
        "wireframe": {
            "screens": [
                {"id": "home", "name": "Home", "device": "mobile"},
                {"id": "tasks", "name": "Tasks", "device": "mobile"},
            ]
        }
    }
    summary = _format_wireframe_summary(state)
    assert summary is not None
    # Format evolved from "2 mobile screen" → "2 total" + per-screen lines.
    # Just assert the count + the device tag + screen names appear.
    assert "2 total" in summary
    assert "mobile" in summary
    assert "Home" in summary and "Tasks" in summary


def test_format_wireframe_summary_returns_none_when_empty():
    from src.app.routers.sessions import _format_wireframe_summary

    assert _format_wireframe_summary(None) is None
    assert _format_wireframe_summary({}) is None
    assert _format_wireframe_summary({"wireframe": {"screens": []}}) is None


# ── Multi-user voice agent slash commands (involvement / pause / ask) ──


async def _make_live_session(client, auth_headers, idea="multi-user"):
    proj = await client.post("/api/sessions", json={"name": "MU"}, headers=auth_headers)
    session_id = proj.json()["id"]
    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": idea},
        headers=auth_headers,
    )
    return resp.json()["id"]


async def _send(client, auth_headers, session_id, content):
    return await client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": content},
        headers=auth_headers,
    )


async def _get_ai_config(client, auth_headers, session_id):
    resp = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    return resp.json().get("ai_config") or {}


async def test_slash_involvement_updates_config(client, auth_headers):
    session_id = await _make_live_session(client, auth_headers)
    resp = await _send(client, auth_headers, session_id, "/involvement observer")
    assert resp.status_code == 201
    config = await _get_ai_config(client, auth_headers, session_id)
    assert config.get("involvement") == "observer"


async def test_slash_involvement_invalid_mode_does_not_persist(client, auth_headers):
    session_id = await _make_live_session(client, auth_headers)
    await _send(client, auth_headers, session_id, "/involvement bogus")
    config = await _get_ai_config(client, auth_headers, session_id)
    assert config.get("involvement") != "bogus"


async def test_slash_involvement_no_arg_returns_usage(client, auth_headers):
    session_id = await _make_live_session(client, auth_headers)
    resp = await _send(client, auth_headers, session_id, "/involvement")
    assert resp.status_code == 201
    config = await _get_ai_config(client, auth_headers, session_id)
    assert "involvement" not in config


async def test_slash_pause_agent_sets_paused_until(client, auth_headers):
    session_id = await _make_live_session(client, auth_headers)
    await _send(client, auth_headers, session_id, "/pause-agent 5")
    config = await _get_ai_config(client, auth_headers, session_id)
    paused_until = config.get("paused_until")
    assert paused_until, "paused_until should be set"
    # Should be ~5 minutes in the future. Just check it parses and is in future.
    from datetime import UTC, datetime

    dt = datetime.fromisoformat(paused_until.replace("Z", "+00:00"))
    delta = (dt - datetime.now(UTC)).total_seconds()
    assert 60 < delta < 600  # roughly 5 minutes (allow generous bounds)


async def test_slash_pause_agent_zero_clears(client, auth_headers):
    session_id = await _make_live_session(client, auth_headers)
    await _send(client, auth_headers, session_id, "/pause-agent 5")
    await _send(client, auth_headers, session_id, "/pause-agent 0")
    config = await _get_ai_config(client, auth_headers, session_id)
    assert config.get("paused_until") is None


async def test_slash_resume_agent_clears(client, auth_headers):
    session_id = await _make_live_session(client, auth_headers)
    await _send(client, auth_headers, session_id, "/pause-agent 5")
    await _send(client, auth_headers, session_id, "/resume-agent")
    config = await _get_ai_config(client, auth_headers, session_id)
    assert config.get("paused_until") is None


async def test_slash_ask_writes_pending_one_shot(client, auth_headers):
    session_id = await _make_live_session(client, auth_headers)
    await _send(client, auth_headers, session_id, "/ask is this safe to ship?")
    config = await _get_ai_config(client, auth_headers, session_id)
    pending = config.get("pending_one_shot")
    assert isinstance(pending, dict)
    assert pending.get("prompt") == "is this safe to ship?"
    assert pending.get("id")  # uuid token present
    assert pending.get("expires")  # epoch seconds


async def test_slash_ask_no_arg_returns_usage(client, auth_headers):
    session_id = await _make_live_session(client, auth_headers)
    resp = await _send(client, auth_headers, session_id, "/ask")
    assert resp.status_code == 201
    config = await _get_ai_config(client, auth_headers, session_id)
    assert "pending_one_shot" not in config


# ── Voice/Video parity tests ────────────────────────────────────────────────
# The chat path goes through the same shared facilitator the voice agent
# uses. These tests guard the parity wiring: persona-aware system prompt,
# `_ai_meta` persistence, and emotion plumbing.


async def test_persona_slash_updates_ai_config(client, auth_headers):
    """`/persona challenger` flips Session.ai_config.persona — voice agent
    reads the same field, so this slash steers both surfaces in lock-step."""
    session_id = await _make_live_session(client, auth_headers)
    resp = await _send(client, auth_headers, session_id, "/persona challenger")
    assert resp.status_code == 201
    config = await _get_ai_config(client, auth_headers, session_id)
    assert config.get("persona") == "challenger"


async def test_persona_slash_default_and_engineer_are_aliases(client, auth_headers):
    """Both `/persona default` (slug) and `/persona engineer` (friendly name)
    must resolve to the same persona. The AI Settings drawer sends the slug;
    humans typing the slash command use the friendly name. A previous bug
    swapped the two, surfacing the literal string "engineer" as the speaker
    name and "Switched to **engineer**" instead of "Senior Engineer"."""
    for input_name in ("engineer", "default", "Engineer", "DEFAULT"):
        session_id = await _make_live_session(client, auth_headers)
        resp = await _send(client, auth_headers, session_id, f"/persona {input_name}")
        assert resp.status_code == 201
        # The system message must use the proper label, not the lowercase slug.
        assert "Senior Engineer" in resp.json()["content"], f"input={input_name!r} produced {resp.json()['content']!r}"
        config = await _get_ai_config(client, auth_headers, session_id)
        # Stored slug is always "default" — the canonical PERSONA_PROMPTS key.
        assert config.get("persona") == "default", f"input={input_name!r}"


async def test_facilitator_persists_ai_meta_on_assistant_message(client, auth_headers, app, db_engine):
    """When process_message returns meta={model, latency_ms}, the chat path
    must stash it under attachments[0]._ai_meta so the frontend reasoning
    peek lights up — same shape voice writes via /api/internal/messages."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import ChatMessage as ChatMessageModel

    proj = await client.post("/api/sessions", json={"name": "MetaProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "meta test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    fake_meta = {"model": "claude-haiku-test", "latency_ms": 42}
    fake_result = {
        "response": "Sure thing.",
        "blueprint_updates": [],
        "session_focus": None,
        "meta": fake_meta,
    }

    with (
        patch(
            "src.app.routers.sessions.process_message",
            AsyncMock(return_value=fake_result),
        ),
        patch(
            "src.app.routers.sessions.get_session_factory",
            return_value=test_factory,
        ),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock()),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "meta test")

    async with test_factory() as db:
        result = await db.execute(
            select(ChatMessageModel)
            .where(ChatMessageModel.session_id == session_id, ChatMessageModel.message_type == "ai")
            .order_by(ChatMessageModel.created_at.desc())
            .limit(1)
        )
        ai_msg = result.scalar_one_or_none()

    assert ai_msg is not None, "facilitator should have written an AI message"
    # Last bubble carries both segment_type and _ai_meta. Untagged legacy
    # output defaults to a single 'next' segment.
    assert ai_msg.attachments == [{"_segment_type": "next"}, {"_ai_meta": fake_meta}]


async def test_facilitator_passes_emotion_from_ai_config(client, auth_headers, app, db_engine):
    """ai_config.emotion (set via the AI settings drawer) must thread through
    to process_message so the facilitator's prompt picks up the same TONE
    block the voice worker uses."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select, update
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import Session as SessionModel

    proj = await client.post("/api/sessions", json={"name": "EmoProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "emotion test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # Set emotion=excited on the session's ai_config (mimics the user
    # selecting "Excited" in the AI settings drawer).
    async with test_factory() as db:
        existing = (await db.execute(select(SessionModel.ai_config).where(SessionModel.id == session_id))).scalar_one()
        new_config = {**(existing or {}), "emotion": "excited", "persona": "default"}
        await db.execute(update(SessionModel).where(SessionModel.id == session_id).values(ai_config=new_config))
        await db.commit()

    captured: dict = {}

    async def fake_process_message(*args, **kwargs):
        captured.update(kwargs)
        return {"response": None, "blueprint_updates": [], "session_focus": None, "meta": None}

    with (
        patch("src.app.routers.sessions.process_message", AsyncMock(side_effect=fake_process_message)),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock()),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "emotion test")

    assert captured.get("emotion") == "excited"


def test_should_run_chat_facilitator_modes():
    """Pure-function gate mirrors the voice worker's should_respond."""
    from src.app.routers.sessions import _should_run_chat_facilitator

    # Default (facilitator) — always runs.
    run, reason, _ = _should_run_chat_facilitator({"involvement": "facilitator"}, "anything")
    assert run is True and reason is None

    # Observer — silent unless one-shot.
    run, reason, _ = _should_run_chat_facilitator({"involvement": "observer"}, "anything")
    assert run is False and reason == "observer"

    # Responsive — runs when wake word present.
    run, reason, _ = _should_run_chat_facilitator({"involvement": "responsive"}, "hey ai, what about caching?")
    assert run is True and reason is None

    # Responsive — runs on a question to "the agent".
    run, reason, _ = _should_run_chat_facilitator({"involvement": "responsive"}, "agent, should we use redis?")
    assert run is True and reason is None

    # Responsive — silent when not addressed.
    run, reason, _ = _should_run_chat_facilitator({"involvement": "responsive"}, "I think we should use redis.")
    assert run is False and reason == "responsive_not_addressed"

    # /ask one-shot wins over observer.
    import time as _t

    run, reason, consumed = _should_run_chat_facilitator(
        {
            "involvement": "observer",
            "pending_one_shot": {"id": "x", "prompt": "why?", "expires": _t.time() + 60},
        },
        "irrelevant",
    )
    assert run is True and reason is None and consumed is True

    # Expired one-shot does NOT bypass observer.
    run, reason, consumed = _should_run_chat_facilitator(
        {
            "involvement": "observer",
            "pending_one_shot": {"id": "x", "prompt": "why?", "expires": _t.time() - 5},
        },
        "irrelevant",
    )
    assert run is False and reason == "observer" and consumed is False


async def test_facilitator_broadcasts_suggest_persona_when_result_has_one(client, auth_headers, app, db_engine):
    """When process_message returns a persona_suggestion, _run_facilitator
    must broadcast a `suggest_persona` WS event whose payload matches the
    voice agent's /api/internal/suggest-persona shape."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    proj = await client.post("/api/sessions", json={"name": "PSugProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "persona suggest test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    suggestion = {
        "persona": "architect",
        "label": "System Architect",
        "reason": "to cover Architecture, Tech Stack",
        "gap_sections": ["architecture", "tech_stack"],
    }
    fake_result = {
        "response": "Got it.",
        "blueprint_updates": [],
        "session_focus": None,
        "meta": {"model": "m", "latency_ms": 1},
        "persona_suggestion": suggestion,
    }

    sent_to: list[dict] = []
    broadcast_payloads: list[dict] = []

    async def capture_send(_sid, payload):
        sent_to.append(payload)

    async def capture_broadcast(_sid, payload):
        broadcast_payloads.append(payload)

    with (
        patch("src.app.routers.sessions.process_message", AsyncMock(return_value=fake_result)),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock(side_effect=capture_send)),
        patch("src.app.routers.sessions.manager.broadcast", AsyncMock(side_effect=capture_broadcast)),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "persona suggest test")

    suggest_events = [p for p in broadcast_payloads if p.get("type") == "suggest_persona"]
    assert suggest_events, f"expected suggest_persona broadcast in {broadcast_payloads}"
    payload = suggest_events[0]["payload"]
    assert payload["persona"] == "architect"
    assert payload["label"] == "System Architect"
    assert "Architecture" in payload["reason"]


async def test_facilitator_does_not_broadcast_persona_when_none(client, auth_headers, app, db_engine):
    """When process_message returns persona_suggestion=None, no suggest_persona
    event fires. Catches a regression where always-broadcasting would spam the
    panel with unwanted toasts."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    proj = await client.post("/api/sessions", json={"name": "PNoSugProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "no suggest"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    fake_result = {
        "response": "Got it.",
        "blueprint_updates": [],
        "session_focus": None,
        "meta": {"model": "m", "latency_ms": 1},
        "persona_suggestion": None,
    }

    broadcast_payloads: list[dict] = []

    async def capture_broadcast(_sid, payload):
        broadcast_payloads.append(payload)

    with (
        patch("src.app.routers.sessions.process_message", AsyncMock(return_value=fake_result)),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock()),
        patch("src.app.routers.sessions.manager.broadcast", AsyncMock(side_effect=capture_broadcast)),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "no suggest")

    assert not [p for p in broadcast_payloads if p.get("type") == "suggest_persona"]


async def test_facilitator_skipped_in_observer_mode_emits_ws_event(client, auth_headers, app, db_engine):
    """In observer mode, _run_facilitator must not call process_message and
    must broadcast a chat_message_skipped event."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select, update
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import ChatMessage as ChatMessageModel
    from src.app.models.session import Session as SessionModel

    proj = await client.post("/api/sessions", json={"name": "ObsProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "observer test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # Set involvement=observer + insert a user message to read.
    async with test_factory() as db:
        existing = (await db.execute(select(SessionModel.ai_config).where(SessionModel.id == session_id))).scalar_one()
        new_config = {**(existing or {}), "involvement": "observer"}
        await db.execute(update(SessionModel).where(SessionModel.id == session_id).values(ai_config=new_config))
        db.add(
            ChatMessageModel(
                session_id=session_id,
                user_id=None,
                content="anything",
                message_type="chat",
                speaker_name="Tester",
            )
        )
        await db.commit()

    sent: list[dict] = []

    async def capture(_sid, payload):
        sent.append(payload)

    process_mock = AsyncMock()

    with (
        patch("src.app.routers.sessions.process_message", process_mock),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock(side_effect=capture)),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "observer test")

    assert process_mock.await_count == 0, "process_message must not be called in observer mode"
    skipped = [p for p in sent if p.get("type") == "chat_message_skipped"]
    assert skipped, f"expected chat_message_skipped event in {sent}"
    assert skipped[0]["payload"]["reason"] == "observer"


async def test_extraction_runs_as_background_task_after_fourth_user_message(client, auth_headers, app, db_engine):
    """Extraction must spawn as its own task with its own DB session — not
    block the facilitator turn. Mirrors the voice worker's async pattern.

    Setup: insert 4 user chat messages, run _run_facilitator, confirm
    _extract_blueprint_background is invoked exactly once."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import ChatMessage as ChatMessageModel

    proj = await client.post("/api/sessions", json={"name": "ExtProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "extraction test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # Seed 4 user messages directly (skipping the rate-limited POST flow).
    async with test_factory() as db:
        for i in range(4):
            db.add(
                ChatMessageModel(
                    session_id=session_id,
                    user_id=None,
                    content=f"User turn {i}",
                    message_type="chat",
                    speaker_name="Tester",
                )
            )
        await db.commit()

    fake_result = {
        "response": "Got it.",
        "blueprint_updates": [],  # forces extraction path
        "session_focus": None,
        "meta": {"model": "m", "latency_ms": 1},
    }

    extract_mock = AsyncMock()

    with (
        patch("src.app.routers.sessions.process_message", AsyncMock(return_value=fake_result)),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock()),
        patch("src.app.routers.sessions._extract_blueprint_background", extract_mock),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "extraction test")

    # Allow the spawned task one event-loop tick to start.
    import asyncio as _asyncio

    await _asyncio.sleep(0)

    assert extract_mock.await_count == 1
    call_kwargs = extract_mock.await_args.kwargs
    assert call_kwargs["session_id"] == session_id
    assert call_kwargs["session_id"] == session_id


async def test_facilitator_blueprint_update_appends_new_bullet(client, auth_headers, app, db_engine):
    """Chat-driven blueprint updates must APPEND, not overwrite. Mirrors the
    voice agent's append-only contract: a new bullet from process_message
    unions with the existing section instead of replacing it."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.blueprint import BlueprintSnapshot
    from src.app.services.blueprint_service import update_section

    proj = await client.post("/api/sessions", json={"name": "MergeProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "merge test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # Seed the blueprint with a pre-existing bullet that must survive the
    # next facilitator turn.
    async with test_factory() as db:
        await update_section(
            session_id,
            "tech_stack",
            "- React frontend",
            "user",
            db,
        )

    fake_result = {
        "response": "Got it — FastAPI it is.",
        "blueprint_updates": [
            {
                "section": "tech_stack",
                "content": "- FastAPI backend",
                "source": "user_confirmed",
            }
        ],
        "session_focus": None,
        "meta": None,
    }

    sent: list[dict] = []

    async def capture(_sid, payload):
        sent.append(payload)

    with (
        patch("src.app.routers.sessions.process_message", AsyncMock(return_value=fake_result)),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock(side_effect=capture)),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "merge test")

    async with test_factory() as db:
        latest = (
            await db.execute(
                select(BlueprintSnapshot)
                .where(BlueprintSnapshot.session_id == session_id)
                .order_by(BlueprintSnapshot.version_number.desc())
                .limit(1)
            )
        ).scalar_one()

    tech_stack = latest.content["tech_stack"]
    assert "React frontend" in tech_stack, "existing bullet was lost by chat update"
    assert "FastAPI backend" in tech_stack, "new bullet was not appended"

    # The blueprint_update WS payload must carry the MERGED section so the
    # frontend panel (and its flash-on-change effect) sees the full content,
    # not just the LLM's new-bullets-only delta.
    bp_events = [p for p in sent if p.get("type") == "blueprint_update"]
    assert bp_events, f"expected blueprint_update broadcast, got {sent}"
    broadcast_content = bp_events[-1]["payload"]["content"]
    assert "React frontend" in broadcast_content, (
        f"broadcast lost existing bullet — flash would show partial content: {broadcast_content!r}"
    )
    assert "FastAPI backend" in broadcast_content


async def test_facilitator_blueprint_update_dedupes_re_emitted_bullet(client, auth_headers, app, db_engine):
    """If the facilitator re-emits an existing bullet alongside a new one,
    the merge must keep the existing one once and append only the new one."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.blueprint import BlueprintSnapshot
    from src.app.services.blueprint_service import update_section

    proj = await client.post("/api/sessions", json={"name": "DedupProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "dedup test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_factory() as db:
        await update_section(
            session_id,
            "tech_stack",
            "- React frontend",
            "user",
            db,
        )

    fake_result = {
        "response": "Adding Redis.",
        "blueprint_updates": [
            {
                # Re-emits existing + new — merge must dedupe React.
                "section": "tech_stack",
                "content": "- react frontend\n- Redis cache",
                "source": "user_confirmed",
            }
        ],
        "session_focus": None,
        "meta": None,
    }

    with (
        patch("src.app.routers.sessions.process_message", AsyncMock(return_value=fake_result)),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock()),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "dedup test")

    async with test_factory() as db:
        latest = (
            await db.execute(
                select(BlueprintSnapshot)
                .where(BlueprintSnapshot.session_id == session_id)
                .order_by(BlueprintSnapshot.version_number.desc())
                .limit(1)
            )
        ).scalar_one()

    bullets = [line for line in latest.content["tech_stack"].split("\n") if line.strip()]
    assert len(bullets) == 2, f"expected 2 bullets after dedup, got {bullets}"
    joined = "\n".join(bullets).lower()
    assert "react frontend" in joined
    assert "redis cache" in joined


async def test_facilitator_emits_one_chat_message_per_segment(client, auth_headers, app, db_engine):
    """A reply tagged with [ack] + [next] must produce TWO ChatMessage rows
    and TWO chat_message WS events so each segment renders as its own bubble."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import ChatMessage as ChatMessageModel

    proj = await client.post("/api/sessions", json={"name": "SegProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "segments test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    fake_result = {
        "response": "Got it — exports in scope.\n\nClick a tag → filter?",
        "segments": [
            {"type": "ack", "content": "Got it — exports in scope."},
            {"type": "next", "content": "Click a tag → filter?"},
        ],
        "blueprint_updates": [],
        "session_focus": None,
        "meta": {"model": "m", "latency_ms": 1},
    }

    sent: list[dict] = []

    async def capture(_sid, payload):
        sent.append(payload)

    with (
        patch("src.app.routers.sessions.process_message", AsyncMock(return_value=fake_result)),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock(side_effect=capture)),
        # Skip the 0.35s stagger between bubbles so the test runs fast.
        patch("src.app.routers.sessions.asyncio.sleep", AsyncMock()),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "segments test")

    # Two ChatMessage rows persisted, one per segment.
    async with test_factory() as db:
        result = await db.execute(
            select(ChatMessageModel)
            .where(ChatMessageModel.session_id == session_id, ChatMessageModel.message_type == "ai")
            .order_by(ChatMessageModel.created_at.asc())
        )
        ai_msgs = result.scalars().all()

    assert len(ai_msgs) == 2, f"expected 2 AI messages, got {len(ai_msgs)}"
    assert ai_msgs[0].content == "Got it — exports in scope."
    assert ai_msgs[1].content == "Click a tag → filter?"

    # Every bubble carries _segment_type so the frontend can style ack vs next.
    # Only the LAST bubble additionally carries _ai_meta (reasoning peek).
    assert ai_msgs[0].attachments == [{"_segment_type": "ack"}]
    assert ai_msgs[1].attachments == [
        {"_segment_type": "next"},
        {"_ai_meta": fake_result["meta"]},
    ]

    # Two chat_message WS events broadcast, one per segment, plus an
    # ai_thinking:false at the end to dismiss the indicator.
    chat_events = [p for p in sent if p.get("type") == "chat_message"]
    assert len(chat_events) == 2, f"expected 2 chat_message events, got {chat_events}"
    assert chat_events[0]["payload"]["content"] == "Got it — exports in scope."
    assert chat_events[1]["payload"]["content"] == "Click a tag → filter?"

    thinking_off = [p for p in sent if p.get("type") == "ai_thinking" and p.get("thinking") is False]
    assert thinking_off, f"expected ai_thinking:false event in {sent}"


async def test_facilitator_single_segment_still_emits_one_bubble(client, auth_headers, app, db_engine):
    """Backwards-compat: if process_message returns only one segment (or none
    and we fall back to result['response']), we must still produce exactly one
    bubble — the LLM occasionally skips tags and chat must not double up."""
    from unittest.mock import AsyncMock, patch

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.session import ChatMessage as ChatMessageModel

    proj = await client.post("/api/sessions", json={"name": "SegOneProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "one-bubble test"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # No 'segments' key — simulate legacy LLM output with no tags.
    fake_result = {
        "response": "Just one line — no tags here.",
        "blueprint_updates": [],
        "session_focus": None,
        "meta": None,
    }

    with (
        patch("src.app.routers.sessions.process_message", AsyncMock(return_value=fake_result)),
        patch("src.app.routers.sessions.get_session_factory", return_value=test_factory),
        patch("src.app.routers.sessions.manager.send_to", AsyncMock()),
        patch("src.app.routers.sessions.asyncio.sleep", AsyncMock()),
    ):
        from src.app.routers.sessions import _run_facilitator

        await _run_facilitator(session_id, "one-bubble test")

    async with test_factory() as db:
        result = await db.execute(
            select(ChatMessageModel)
            .where(ChatMessageModel.session_id == session_id, ChatMessageModel.message_type == "ai")
        )
        ai_msgs = result.scalars().all()

    assert len(ai_msgs) == 1, f"expected exactly 1 AI message in legacy path, got {len(ai_msgs)}"
    assert ai_msgs[0].content == "Just one line — no tags here."
