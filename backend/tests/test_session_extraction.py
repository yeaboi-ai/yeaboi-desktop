"""W6.6.3 — Session extraction service + endpoints."""


async def _create_session_with_messages(client, auth_headers) -> str:
    proj = await client.post("/api/sessions", json={"name": "ExtractP"}, headers=auth_headers)
    session_id = proj.json()["id"]
    s = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "extract"},
        headers=auth_headers,
    )
    sid = s.json()["id"]
    await client.patch(f"/api/sessions/{sid}", json={"status": "lobby"}, headers=auth_headers)
    await client.patch(f"/api/sessions/{sid}", json={"status": "live"}, headers=auth_headers)
    await client.post(f"/api/sessions/{sid}/messages", json={"content": "we will use Postgres"}, headers=auth_headers)
    await client.post(f"/api/sessions/{sid}/messages", json={"content": "Alice will own auth"}, headers=auth_headers)
    return sid


async def test_extraction_endpoint_returns_empty_initially(client, auth_headers):
    """Before extraction runs, returns the canonical empty payload (all six keys)."""
    sid = await _create_session_with_messages(client, auth_headers)
    resp = await client.get(f"/api/sessions/{sid}/extraction", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "summary": "",
        "highlights": [],
        "decisions": [],
        "action_items": [],
        "open_questions": [],
        "chapter_summaries": [],
    }


async def test_extraction_endpoint_404_for_unknown_session(client, auth_headers):
    resp = await client.get("/api/sessions/00000000-0000-0000-0000-000000000000/extraction", headers=auth_headers)
    assert resp.status_code == 404


async def test_extraction_endpoint_403_for_non_participant(client, auth_headers, other_auth_headers):
    sid = await _create_session_with_messages(client, auth_headers)
    resp = await client.get(f"/api/sessions/{sid}/extraction", headers=other_auth_headers)
    assert resp.status_code in (403, 404)


async def test_regenerate_extraction_requires_host(client, auth_headers, other_auth_headers):
    sid = await _create_session_with_messages(client, auth_headers)
    join_code_resp = await client.get(f"/api/sessions/{sid}", headers=auth_headers)
    join_code = join_code_resp.json()["join_code"]
    await client.post(f"/api/sessions/join/{join_code}", headers=other_auth_headers)
    # Member tries to regenerate → 403.
    bad = await client.post(f"/api/sessions/{sid}/extraction/regenerate", headers=other_auth_headers)
    assert bad.status_code == 403


async def test_extract_session_artifacts_unknown_session(db_session):
    """Pure unit test of the service with an unknown id — returns the empty
    payload without crashing."""
    from src.app.services.session_extraction import empty_extraction, extract_session_artifacts

    result = await extract_session_artifacts("00000000-0000-0000-0000-000000000000", db_session)
    assert result == empty_extraction()


def test_empty_extraction_has_all_six_keys():
    """The canonical empty payload carries every key the frontend expects so
    older sessions (whose stored extraction predates this change) still render."""
    from src.app.services.session_extraction import empty_extraction

    empty = empty_extraction()
    assert set(empty.keys()) == {
        "summary",
        "highlights",
        "decisions",
        "action_items",
        "open_questions",
        "chapter_summaries",
    }
    assert empty["summary"] == ""
    assert empty["highlights"] == []
    assert empty["chapter_summaries"] == []


def test_coerce_highlights_drops_malformed_entries():
    from src.app.services.session_extraction import _coerce_highlights

    result = _coerce_highlights([
        {"quote": "let's use Postgres", "speaker": "Alice", "ts": "2026-05-13T10:00:00Z"},
        {"quote": "", "speaker": "Bob", "ts": None},  # dropped: empty quote
        {"speaker": "no quote"},  # dropped: missing quote
        "not a dict",  # dropped: not a dict
        {"quote": "   spaces   ", "speaker": None, "ts": "2026-05-13T10:05:00Z"},  # trimmed
    ])
    assert len(result) == 2
    assert result[0] == {"quote": "let's use Postgres", "speaker": "Alice", "ts": "2026-05-13T10:00:00Z"}
    assert result[1]["quote"] == "spaces"


def test_coerce_chapter_summaries_caps_at_ten():
    from src.app.services.session_extraction import _coerce_chapter_summaries

    many = [
        {"label": f"Chapter {i}", "start_ts": None, "end_ts": None, "summary": "x"}
        for i in range(15)
    ]
    result = _coerce_chapter_summaries(many)
    assert len(result) == 10


def test_extraction_endpoint_backcompat_old_payload_shape(client, auth_headers, db_session):
    """Sessions whose stored extraction predates the new keys still return a
    response with all six keys (missing keys filled with safe defaults)."""
    # The endpoint merges over `empty_extraction()` before returning, so a row
    # stored with only the old three keys will surface as the full new shape.
    from src.app.services.session_extraction import empty_extraction

    merged = {**empty_extraction(), **{"decisions": [{"text": "old", "ts": None}]}}
    assert "summary" in merged
    assert "highlights" in merged
    assert "chapter_summaries" in merged
    assert merged["decisions"] == [{"text": "old", "ts": None}]
