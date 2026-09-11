"""Tests for the blueprint suggestion queue.

The agent now writes pending suggestions instead of mutating the blueprint
directly — these tests cover the agent → suggestion → user-review path
end-to-end via the public API.
"""

from src.app.config import get_settings


async def _create_session(client, auth_headers) -> str:
    """One row: the session is the workspace and the conversation."""
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    return proj.json()["id"]


def _internal_headers() -> dict:
    return {"X-Internal-Secret": get_settings().internal_api_secret}


async def test_agent_post_creates_pending_suggestion(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    resp = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- React frontend"},
        headers=_internal_headers(),
    )
    assert resp.status_code == 201
    suggestion_id = resp.json()["id"]
    assert resp.json()["status"] == "pending"

    # Visible to the user via the public list endpoint
    listed = await client.get(
        f"/api/sessions/{session_id}/blueprint-suggestions",
        headers=auth_headers,
    )
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["id"] == suggestion_id
    assert items[0]["section"] == "tech_stack"

    # And the blueprint itself stays empty — nothing was committed yet
    bp = await client.get(f"/api/sessions/{session_id}/blueprint", headers=auth_headers)
    assert (bp.json()["content"].get("tech_stack") or "") == ""


async def test_agent_post_rejects_invalid_section(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    resp = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "not_a_section", "content": "- nope"},
        headers=_internal_headers(),
    )
    assert resp.status_code == 400


async def test_agent_post_requires_internal_secret(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    resp = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- nope"},
    )
    assert resp.status_code == 422  # missing required header


async def test_accept_merges_into_blueprint(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    create = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- Postgres database"},
        headers=_internal_headers(),
    )
    sid = create.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/accept",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"

    bp = await client.get(f"/api/sessions/{session_id}/blueprint", headers=auth_headers)
    assert "Postgres database" in bp.json()["content"]["tech_stack"]


async def test_accept_with_edited_content_uses_edit(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    create = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- Postgress (typo)"},
        headers=_internal_headers(),
    )
    sid = create.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/accept",
        json={"edited_content": "- Postgres"},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    bp = await client.get(f"/api/sessions/{session_id}/blueprint", headers=auth_headers)
    stored = bp.json()["content"]["tech_stack"]
    assert "Postgres" in stored
    assert "Postgress" not in stored


async def test_reject_does_not_touch_blueprint(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    create = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- Wrong"},
        headers=_internal_headers(),
    )
    sid = create.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/reject",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"

    bp = await client.get(f"/api/sessions/{session_id}/blueprint", headers=auth_headers)
    assert (bp.json()["content"].get("tech_stack") or "") == ""

    # No longer visible in pending list
    listed = await client.get(
        f"/api/sessions/{session_id}/blueprint-suggestions",
        headers=auth_headers,
    )
    assert listed.json() == []


async def test_accept_unknown_id_returns_404(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/nonexistent/accept",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_accept_already_resolved_returns_404(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    create = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- once"},
        headers=_internal_headers(),
    )
    sid = create.json()["id"]
    await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/accept",
        json={},
        headers=auth_headers,
    )
    # Second accept on the same suggestion should 404 — it's no longer pending
    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/accept",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_bulk_accept_section_merges_all(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    for content in ("- Redis", "- Postgres", "- S3"):
        await client.post(
            f"/api/internal/sessions/{session_id}/blueprint-suggestions",
            json={"section": "tech_stack", "content": content},
            headers=_internal_headers(),
        )

    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/bulk-accept",
        json={"section": "tech_stack", "session_id": session_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()["accepted"]) == 3

    bp = await client.get(f"/api/sessions/{session_id}/blueprint", headers=auth_headers)
    stored = bp.json()["content"]["tech_stack"]
    assert "Redis" in stored
    assert "Postgres" in stored
    assert "S3" in stored

    # Pending list now empty
    listed = await client.get(
        f"/api/sessions/{session_id}/blueprint-suggestions",
        headers=auth_headers,
    )
    assert listed.json() == []


async def test_bulk_accept_only_targets_named_section(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- Redis"},
        headers=_internal_headers(),
    )
    await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "risks_unknowns", "content": "- Auth migration"},
        headers=_internal_headers(),
    )

    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/bulk-accept",
        json={"section": "tech_stack", "session_id": session_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()["accepted"]) == 1

    # The risks_unknowns suggestion is still pending
    listed = await client.get(
        f"/api/sessions/{session_id}/blueprint-suggestions",
        headers=auth_headers,
    )
    items = listed.json()
    assert len(items) == 1
    assert items[0]["section"] == "risks_unknowns"


async def test_bulk_accept_no_pending_returns_empty(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/bulk-accept",
        json={"section": "tech_stack", "session_id": session_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["accepted"] == []


async def test_list_returns_only_pending_status(client, auth_headers):
    """Accepted/rejected suggestions disappear from the pending list."""
    session_id = await _create_session(client, auth_headers)

    create_a = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- A"},
        headers=_internal_headers(),
    )
    sid_a = create_a.json()["id"]
    await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- B"},
        headers=_internal_headers(),
    )

    # Resolve one — only the other should remain pending
    await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid_a}/reject",
        headers=auth_headers,
    )

    listed = await client.get(
        f"/api/sessions/{session_id}/blueprint-suggestions",
        headers=auth_headers,
    )
    items = listed.json()
    assert len(items) == 1
    assert items[0]["content"] == "- B"


async def test_list_requires_auth(client):
    resp = await client.get("/api/sessions/some-id/blueprint-suggestions")
    # 401 (missing token) or 422 depending on auth middleware — both are
    # acceptable as long as it's not 200.
    assert resp.status_code in (401, 403, 422)


async def test_replace_strips_superseded_bullet(client, auth_headers):
    """Accepting with replace=True must remove the superseded bullet from
    the section before merging the new one."""
    session_id = await _create_session(client, auth_headers)

    # Pre-seed the section with an existing bullet (manual user edit path).
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/team_capacity",
        json={"content": "- Team of 5 engineers"},
        headers=auth_headers,
    )

    # Agent produces a contradicting suggestion that flags the superseded bullet.
    create = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={
            "section": "team_capacity",
            "content": "- Team of 3 engineers",
            "supersedes_bullet": "- Team of 5 engineers",
        },
        headers=_internal_headers(),
    )
    assert create.status_code == 201
    sid = create.json()["id"]

    # Accept with replace=True
    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/accept",
        json={"replace": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    bp = await client.get(f"/api/sessions/{session_id}/blueprint", headers=auth_headers)
    stored = bp.json()["content"]["team_capacity"]
    assert "5 engineers" not in stored
    assert "3 engineers" in stored


async def test_keep_both_when_replace_false(client, auth_headers):
    """Default accept (replace=False) keeps both — even when supersedes is set."""
    session_id = await _create_session(client, auth_headers)

    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/team_capacity",
        json={"content": "- Team of 5 engineers"},
        headers=auth_headers,
    )

    create = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={
            "section": "team_capacity",
            "content": "- Team of 3 engineers",
            "supersedes_bullet": "- Team of 5 engineers",
        },
        headers=_internal_headers(),
    )
    sid = create.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/accept",
        json={},  # replace defaults to False
        headers=auth_headers,
    )
    assert resp.status_code == 200

    bp = await client.get(f"/api/sessions/{session_id}/blueprint", headers=auth_headers)
    stored = bp.json()["content"]["team_capacity"]
    assert "5 engineers" in stored
    assert "3 engineers" in stored


async def test_replace_without_supersedes_falls_back_to_merge(client, auth_headers):
    """If the suggestion has no supersedes_bullet, replace=True is harmless —
    falls back to plain merge so accepted content still lands."""
    session_id = await _create_session(client, auth_headers)

    create = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- Redis"},
        headers=_internal_headers(),
    )
    sid = create.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/accept",
        json={"replace": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    bp = await client.get(f"/api/sessions/{session_id}/blueprint", headers=auth_headers)
    assert "Redis" in bp.json()["content"]["tech_stack"]


# ─── Post-session "what changed" review (Phase 2) ──────────────────────────


async def test_creating_suggestion_flips_session_review_to_pending(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    sess = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    # New sessions start at 'none' — nothing to review until a suggestion lands.
    assert sess.json()["blueprint_review_status"] == "none"

    await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- React"},
        headers=_internal_headers(),
    )

    sess = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert sess.json()["blueprint_review_status"] == "pending"


async def test_complete_review_requires_resolving_pending_or_skip(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- React"},
        headers=_internal_headers(),
    )

    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-review/complete",
        json={},
        headers=auth_headers,
    )
    # 409 — pending suggestions block the no-skip path so users can't
    # accidentally close the review with work outstanding.
    assert resp.status_code == 409

    skip = await client.post(
        f"/api/sessions/{session_id}/blueprint-review/complete",
        json={"skip_remaining": True},
        headers=auth_headers,
    )
    assert skip.status_code == 200
    assert skip.json()["blueprint_review_status"] == "completed"
    assert skip.json()["blueprint_review_completed_at"]


async def test_complete_review_is_idempotent(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- React"},
        headers=_internal_headers(),
    )
    first = await client.post(
        f"/api/sessions/{session_id}/blueprint-review/complete",
        json={"skip_remaining": True},
        headers=auth_headers,
    )
    assert first.status_code == 200
    second = await client.post(
        f"/api/sessions/{session_id}/blueprint-review/complete",
        json={"skip_remaining": False},
        headers=auth_headers,
    )
    # Idempotent — already-completed reviews stay completed without raising.
    assert second.status_code == 200
    assert second.json()["blueprint_review_status"] == "completed"


async def test_complete_review_rejects_when_nothing_to_review(client, auth_headers):
    """Sessions with no pending review (status='none') must not silently
    accept a complete — the UI should never have routed there."""
    session_id = await _create_session(client, auth_headers)
    resp = await client.post(
        f"/api/sessions/{session_id}/blueprint-review/complete",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_session_blueprint_diff_returns_changed_sections(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    # Seed baseline content via a user edit (NOT this session's session_id —
    # it's a direct PATCH, so the snapshot has session_id=None and counts as
    # baseline relative to the session we'll inspect below).
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/tech_stack",
        json={"content": "- Old stack"},
        headers=auth_headers,
    )

    # Agent posts an extraction; user accepts it; the resulting snapshot is
    # attributed to the session via session_id on the suggestion.
    sugg = await client.post(
        f"/api/internal/sessions/{session_id}/blueprint-suggestions",
        json={"section": "tech_stack", "content": "- React frontend"},
        headers=_internal_headers(),
    )
    sid = sugg.json()["id"]
    await client.post(
        f"/api/sessions/{session_id}/blueprint-suggestions/{sid}/accept",
        json={},
        headers=auth_headers,
    )

    diff = await client.get(
        f"/api/sessions/{session_id}/blueprint-diff",
        headers=auth_headers,
    )
    assert diff.status_code == 200
    body = diff.json()
    assert "tech_stack" in body["sections"]
    assert "Old stack" in body["sections"]["tech_stack"]["old"]
    assert "React frontend" in body["sections"]["tech_stack"]["new"]
    # No remaining suggestions for the session — we just accepted the only one.
    assert body["pending_suggestions"] == 0
