from src.app.services.slack_templates import EVENT_TYPES, build_blocks_for_event


def test_event_types_catalogue_is_complete():
    expected = {
        "scan_started", "scan_complete", "scan_partial", "scan_failed",
        "card_failed", "card_auto_approved", "pr_ready",
        "card_state_changed",
        "session_created", "session_completed", "session_deleted",
        "blueprint_iteration",
        "mention",
    }
    assert set(EVENT_TYPES) == expected


def test_pr_ready_template_includes_approve_button():
    blocks = build_blocks_for_event(
        "pr_ready",
        {"card_id": "card-123", "card_title": "Add login",
         "pr_url": "https://github.com/x/y/pull/1", "session_id": "proj-1"},
    )
    flat = str(blocks)
    assert "pr_ready:approve" in flat
    assert "https://github.com/x/y/pull/1" in flat
    assert "Add login" in flat


def test_card_failed_template_includes_retry_button():
    blocks = build_blocks_for_event(
        "card_failed",
        {"card_id": "card-1", "card_title": "Broken thing",
         "error": "boom", "session_id": "p1"},
    )
    flat = str(blocks)
    assert "card_failed:retry" in flat
    assert "Broken thing" in flat


def test_mention_template_does_not_include_action_buttons_action_ids():
    blocks = build_blocks_for_event(
        "mention",
        {"mentioned_user_name": "Nick", "source_type": "card",
         "source_title": "x", "source_url": "/p/1"},
    )
    # The "Open in yeaboi" button uses action_id="noop" (no handler).
    flat = str(blocks)
    assert "Nick" in flat
    assert "mention:" not in flat  # No "mention:<action>" buttons


def test_unknown_event_type_returns_fallback():
    blocks = build_blocks_for_event("nope", {"x": 1})
    assert blocks[0]["type"] == "section"


def test_all_event_types_build_without_raising():
    for event_type in EVENT_TYPES:
        blocks = build_blocks_for_event(event_type, {})
        assert isinstance(blocks, list) and len(blocks) >= 1


def test_title_for_event_known_and_unknown():
    from src.app.services.slack_templates import title_for_event

    assert "card failed" in title_for_event("card_failed", {"card_title": "x"}).lower()
    assert "PR ready" in title_for_event("pr_ready", {"card_title": "x"})
    assert title_for_event("session_created", {"title": "y"}).startswith("Session created")
    assert title_for_event("weird_thing", {}) == "yeaboi weird_thing"


def test_session_created_block_contains_link_button():
    import json

    from src.app.services.slack_templates import session_created_block

    blocks = session_created_block(
        slack_user_id="U123",
        title="Onboarding",
        continues_from="Acme · Web",
        session_url="http://localhost:3001/sessions/s1",
    )
    dumped = json.dumps(blocks, ensure_ascii=False)
    assert "U123" in dumped
    assert "Onboarding" in dumped
    assert "Acme · Web" in dumped

    # Primary button in an actions block carrying the URL
    action_blocks = [b for b in blocks if b.get("type") == "actions"]
    assert action_blocks, "expected an actions block"
    elements = action_blocks[0]["elements"]
    urls = [el.get("url") for el in elements]
    assert "http://localhost:3001/sessions/s1" in urls
    assert elements[0]["style"] == "primary"
    assert elements[0]["action_id"] == "session_open_link"


def test_session_picker_block_has_one_button_per_session():
    import json

    from src.app.services.slack_templates import session_picker_block

    blocks = session_picker_block(
        title="Onboarding",
        sessions=[{"id": "p1", "name": "Web"}, {"id": "p2", "name": "Mobile"}],
    )
    action_blocks = [b for b in blocks if b.get("type") == "actions"]
    assert action_blocks
    elements = action_blocks[0]["elements"]
    assert len(elements) == 2
    # Slack requires unique action_ids within a single message; each button is
    # suffixed with its index. The dispatcher matches via startswith.
    seen_action_ids = set()
    for el in elements:
        assert el["action_id"].startswith("session_create_pick")
        assert el["action_id"] not in seen_action_ids  # uniqueness
        seen_action_ids.add(el["action_id"])
        value = json.loads(el["value"])
        assert value["title"] == "Onboarding"
        assert value["session_id"] in {"p1", "p2"}
        assert value["source"] == "slash"  # default source when unspecified


def test_session_picker_block_caps_at_10_buttons():
    from src.app.services.slack_templates import session_picker_block

    sessions = [{"id": f"p{i}", "name": f"Session {i}"} for i in range(15)]
    blocks = session_picker_block(title="X", sessions=sessions)
    action_blocks = [b for b in blocks if b.get("type") == "actions"]
    assert len(action_blocks[0]["elements"]) == 10


def test_over_session_limit_block_has_sessions_link():
    from src.app.services.slack_templates import over_session_limit_block

    blocks = over_session_limit_block(sessions_url="https://app.example.com/sessions")
    action = next(b for b in blocks if b["type"] == "actions")
    assert action["elements"][0]["action_id"] == "session_open_sessions_list"
    assert action["elements"][0]["url"] == "https://app.example.com/sessions"


def test_session_picker_block_truncates_long_names():
    from src.app.services.slack_templates import session_picker_block

    long_name = "A" * 120
    blocks = session_picker_block(
        title="X",
        sessions=[{"id": "p1", "name": long_name}],
    )
    action_blocks = [b for b in blocks if b.get("type") == "actions"]
    text_value = action_blocks[0]["elements"][0]["text"]["text"]
    assert len(text_value) <= 75
    assert text_value == long_name[:75]
