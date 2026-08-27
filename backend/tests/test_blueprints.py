EMPTY_BLUEPRINT = {
    "project_overview": "",
    "goals_constraints": "",
    "users_personas": "",
    "architecture": "",
    "tech_stack": "",
    "api_integrations": "",
    "ui_ux": "",
    "security_compliance": "",
    "infrastructure": "",
    "open_questions": "",
}


async def test_get_blueprint_creates_initial(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P1"}, headers=auth_headers)
    project_id = proj.json()["id"]

    resp = await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["version_number"] == 1
    assert data["content"]["project_overview"] == ""


async def test_update_blueprint_section(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P1"}, headers=auth_headers)
    project_id = proj.json()["id"]

    # Get initial blueprint
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)

    # Update a section
    resp = await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/project_overview",
        json={"content": "We are building a planning platform"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["content"]["project_overview"] == "We are building a planning platform"
    assert resp.json()["version_number"] == 2


async def test_list_blueprint_snapshots(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P1"}, headers=auth_headers)
    project_id = proj.json()["id"]

    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "Next.js + FastAPI"},
        headers=auth_headers,
    )

    resp = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_restore_blueprint_snapshot(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P1"}, headers=auth_headers)
    project_id = proj.json()["id"]

    # Create initial + update
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "Next.js + FastAPI"},
        headers=auth_headers,
    )

    # Get snapshots — list returns newest-first; pick v1 by version_number
    snapshots = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    v1_id = next(s["id"] for s in snapshots.json() if s["version_number"] == 1)

    # Restore v1
    resp = await client.post(f"/api/projects/{project_id}/blueprint/restore/{v1_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["content"]["tech_stack"] == ""  # Restored to empty
    assert resp.json()["version_number"] == 3  # New version created


# ─── Slack dispatch_event wiring ──────────────────────────────────────────────


async def test_dispatch_event_called_on_blueprint_iteration(client, auth_headers):
    """dispatch_event is called with blueprint_iteration when a new iteration is created."""
    from unittest.mock import AsyncMock, patch

    proj = await client.post("/api/projects", json={"name": "Iter Test"}, headers=auth_headers)
    project_id = proj.json()["id"]

    with patch("src.app.routers.blueprints.dispatch_event", new_callable=AsyncMock) as mock_dispatch:
        resp = await client.post(
            f"/api/projects/{project_id}/iterations",
            json={},
            headers=auth_headers,
        )
        assert resp.status_code == 201

    assert mock_dispatch.called
    event_types = [
        (c.kwargs.get("event_type") or (c.args[1] if len(c.args) > 1 else None)) for c in mock_dispatch.call_args_list
    ]
    assert "blueprint_iteration" in event_types


# ─── History UI endpoints ────────────────────────────────────────────────────


async def test_list_snapshots_includes_label_and_changed_sections(client, auth_headers):
    """The list response carries a resolved author label and the slugs the
    snapshot itself changed (relative to its predecessor). This matches what
    the expanded diff view shows so the chip and the diff stay consistent."""
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "Next.js"},
        headers=auth_headers,
    )

    resp = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    assert resp.status_code == 200
    rows = resp.json()
    # Newest-first.
    assert rows[0]["version_number"] >= rows[-1]["version_number"]
    # The user-edit snapshot was authored by a real User UUID — label resolves
    # to a non-empty human name (defaults to email prefix in tests).
    user_edit = next(r for r in rows if r["version_number"] == 2)
    assert user_edit["created_by_label"]
    assert user_edit["created_by_label"] != user_edit["created_by"]  # not the raw UUID
    # v2 introduced a change to tech_stack — chip should say so even though
    # v2 is also the latest version.
    assert user_edit["changed_sections"] == ["tech_stack"]
    # The initial snapshot has no recorded diff (it's the seed).
    initial = next(r for r in rows if r["version_number"] == 1)
    assert initial["created_by_label"] == "System"
    assert initial["changed_sections"] == []


async def test_list_snapshots_paginates_with_before_version(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    for i in range(4):
        await client.patch(
            f"/api/projects/{project_id}/blueprint/sections/tech_stack",
            json={"content": f"v{i}"},
            headers=auth_headers,
        )

    resp = await client.get(
        f"/api/projects/{project_id}/blueprint/snapshots",
        params={"limit": 2},
        headers=auth_headers,
    )
    page1 = resp.json()
    assert len(page1) == 2

    smallest = min(r["version_number"] for r in page1)
    resp = await client.get(
        f"/api/projects/{project_id}/blueprint/snapshots",
        params={"limit": 10, "before_version": smallest},
        headers=auth_headers,
    )
    page2 = resp.json()
    # Every entry on page 2 is older than page 1's tail.
    assert all(r["version_number"] < smallest for r in page2)


async def test_get_snapshot_detail_returns_content_and_label(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "- React"},
        headers=auth_headers,
    )

    snapshots = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    snap_id = snapshots.json()[0]["id"]

    resp = await client.get(
        f"/api/projects/{project_id}/blueprint/snapshots/{snap_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content"]["tech_stack"] == "- React"
    assert body["created_by_label"]
    assert body["diff_from_previous"] == {
        "tech_stack": {"old": "", "new": "- React"},
    }


async def test_snapshot_diff_against_current_returns_only_changed_sections(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    # v2 — set tech_stack
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "Next.js"},
        headers=auth_headers,
    )
    # v3 — set ui_ux
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/ui_ux",
        json={"content": "Dark mode"},
        headers=auth_headers,
    )

    snapshots = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    v1 = next(s for s in snapshots.json() if s["version_number"] == 1)

    resp = await client.get(
        f"/api/projects/{project_id}/blueprint/snapshots/{v1['id']}/diff",
        params={"against": "current"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    # Both sections changed between v1 and current — and ONLY those should appear.
    assert set(body["sections"].keys()) == {"tech_stack", "ui_ux"}
    assert body["sections"]["tech_stack"] == {"old": "", "new": "Next.js"}
    assert body["sections"]["ui_ux"] == {"old": "", "new": "Dark mode"}
    assert body["from_version"] == 1


async def test_restore_blocked_on_locked_iteration(client, auth_headers, db_engine):
    """The agent's update path already refuses locked iterations; restore
    must match — restoring into a locked iteration would create new
    snapshots inside a frozen version."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.blueprint import BlueprintIteration

    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "Next.js"},
        headers=auth_headers,
    )

    snapshots = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    v1_id = next(s["id"] for s in snapshots.json() if s["version_number"] == 1)

    # Lock the iteration directly via the DB.
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            __import__("sqlalchemy")
            .select(BlueprintIteration)
            .where(
                BlueprintIteration.project_id == project_id,
            )
        )
        it = result.scalar_one()
        it.status = "locked"
        await session.commit()

    resp = await client.post(
        f"/api/projects/{project_id}/blueprint/restore/{v1_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "locked" in resp.json()["detail"].lower()


async def test_restore_broadcasts_blueprint_update_per_changed_section(client, auth_headers):
    """Voice agent's WS subscriber and connected frontends must learn about
    a restore so they refresh their local state immediately."""
    from src.app.ws.manager import manager

    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess_resp = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "T"},
        headers=auth_headers,
    )
    session_id = sess_resp.json()["id"]

    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    # v2 — set tech_stack
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "Next.js"},
        headers=auth_headers,
    )
    # v3 — set ui_ux
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/ui_ux",
        json={"content": "Dark mode"},
        headers=auth_headers,
    )

    # Spy on the broadcast surface (internal watcher).
    received: list[dict] = []

    class FakeWebSocket:
        async def send_text(self, text: str) -> None:
            import json as _json

            received.append(_json.loads(text))

    fake = FakeWebSocket()
    manager.internal_watchers[session_id].append(fake)
    try:
        snapshots = await client.get(
            f"/api/projects/{project_id}/blueprint/snapshots",
            headers=auth_headers,
        )
        v1_id = next(s["id"] for s in snapshots.json() if s["version_number"] == 1)

        resp = await client.post(
            f"/api/projects/{project_id}/blueprint/restore/{v1_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
    finally:
        manager.disconnect_internal_watcher(session_id, fake)

    bp_events = [e for e in received if e.get("type") == "blueprint_update"]
    sections_seen = {e["payload"]["section"] for e in bp_events}
    # Both sections that were populated since v1 should reset and produce events.
    assert {"tech_stack", "ui_ux"} <= sections_seen
    assert all(e["payload"].get("source") == "restore" for e in bp_events)


async def test_restore_clears_removed_bullets_and_sets_user_author(client, auth_headers, db_engine):
    """Restoring re-affirms the prior state: deletion memory must reset so
    the agent's next merge doesn't silently re-strip the restored bullets,
    and the new snapshot must be attributed to the user, not 'system'."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.app.models.blueprint import BlueprintIteration

    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "- React\n- Node"},
        headers=auth_headers,
    )

    # Plant some removed_bullets on the iteration.
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            __import__("sqlalchemy")
            .select(BlueprintIteration)
            .where(
                BlueprintIteration.project_id == project_id,
            )
        )
        it = result.scalar_one()
        it.removed_bullets = {"tech_stack": ["vue frontend"]}
        await session.commit()

    snapshots = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    v1_id = next(s["id"] for s in snapshots.json() if s["version_number"] == 1)

    resp = await client.post(
        f"/api/projects/{project_id}/blueprint/restore/{v1_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    new_snap = resp.json()
    assert new_snap["content"]["tech_stack"] == ""

    async with factory() as session:
        result = await session.execute(
            __import__("sqlalchemy")
            .select(BlueprintIteration)
            .where(
                BlueprintIteration.project_id == project_id,
            )
        )
        it = result.scalar_one()
        assert it.removed_bullets in (None, {}, [])

    # The new snapshot must NOT be attributed to "system" — it should carry
    # a real user UUID. The list endpoint resolves that to a label that's
    # different from the raw value.
    snapshots = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    latest = snapshots.json()[0]
    assert latest["created_by"] not in ("system", "system_revert", "ai_extraction")
    assert latest["created_by_label"]


async def test_snapshot_diff_against_previous(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "Next.js"},
        headers=auth_headers,
    )

    snapshots = await client.get(f"/api/projects/{project_id}/blueprint/snapshots", headers=auth_headers)
    latest_id = snapshots.json()[0]["id"]

    resp = await client.get(
        f"/api/projects/{project_id}/blueprint/snapshots/{latest_id}/diff",
        params={"against": "previous"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["sections"] == {"tech_stack": {"old": "Next.js", "new": ""}}


# ─── Share, export, and bullet-source persistence ──────────────────────────


async def test_blueprint_share_issue_and_revoke(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)

    iters = await client.get(f"/api/projects/{project_id}/iterations", headers=auth_headers)
    iter_id = iters.json()[0]["id"]

    enable = await client.post(
        f"/api/projects/{project_id}/blueprint-iterations/{iter_id}/share",
        headers=auth_headers,
    )
    assert enable.status_code == 200
    body = enable.json()
    assert body["share_enabled"] is True
    token = body["share_token"]
    assert token

    # Idempotent — re-enabling returns the same token
    enable_again = await client.post(
        f"/api/projects/{project_id}/blueprint-iterations/{iter_id}/share",
        headers=auth_headers,
    )
    assert enable_again.json()["share_token"] == token

    # Revoke — token preserved, share_enabled flipped off
    revoke = await client.delete(
        f"/api/projects/{project_id}/blueprint-iterations/{iter_id}/share",
        headers=auth_headers,
    )
    assert revoke.status_code == 200
    assert revoke.json()["share_enabled"] is False
    assert revoke.json()["share_token"] == token


async def test_public_blueprint_404_when_token_unknown(client):
    resp = await client.get("/api/public/blueprint/not-a-real-token")
    assert resp.status_code == 404


async def test_public_blueprint_410_when_sharing_revoked(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    iters = await client.get(f"/api/projects/{project_id}/iterations", headers=auth_headers)
    iter_id = iters.json()[0]["id"]

    enabled = await client.post(
        f"/api/projects/{project_id}/blueprint-iterations/{iter_id}/share",
        headers=auth_headers,
    )
    token = enabled.json()["share_token"]

    ok = await client.get(f"/api/public/blueprint/{token}")
    assert ok.status_code == 200

    await client.delete(
        f"/api/projects/{project_id}/blueprint-iterations/{iter_id}/share",
        headers=auth_headers,
    )
    revoked = await client.get(f"/api/public/blueprint/{token}")
    # 410 — deliberately disabled, not 'never existed' — share page renders
    # different copy for each.
    assert revoked.status_code == 410


async def test_public_blueprint_returns_content_and_provenance(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "- Next.js\n- Postgres"},
        headers=auth_headers,
    )

    iters = await client.get(f"/api/projects/{project_id}/iterations", headers=auth_headers)
    iter_id = iters.json()[0]["id"]
    enabled = await client.post(
        f"/api/projects/{project_id}/blueprint-iterations/{iter_id}/share",
        headers=auth_headers,
    )
    token = enabled.json()["share_token"]

    resp = await client.get(f"/api/public/blueprint/{token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["content"]["tech_stack"] == "- Next.js\n- Postgres"
    assert body["section_sources"]["tech_stack"] == "user_stated"
    bullet_sources = body["bullet_sources"]["tech_stack"]
    assert bullet_sources["next.js"] == "user_stated"
    assert bullet_sources["postgres"] == "user_stated"


async def test_blueprint_export_markdown_round_trips(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "Mira"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/project_overview",
        json={"content": "A planning platform"},
        headers=auth_headers,
    )
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "- Next.js\n- FastAPI"},
        headers=auth_headers,
    )

    resp = await client.get(
        f"/api/projects/{project_id}/blueprint/export.md",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    body = resp.text
    assert "# Mira" in body
    assert "## Project Overview" in body
    assert "A planning platform" in body
    assert "## Tech Stack" in body
    assert "- Next.js" in body
    # Empty sections must not appear — the export is a clean reader, not a
    # debug dump.
    assert "## Users & Personas" not in body


async def test_section_completed_broadcast_when_section_crosses_threshold(client, auth_headers):
    """Phase 4 — when a section crosses 80% in one update, fire a section_completed
    WS event so the in-session blueprint panel can flash its checkmark."""
    from src.app.ws.manager import manager

    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess_resp = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "T"},
        headers=auth_headers,
    )
    session_id = sess_resp.json()["id"]

    # Spy on the broadcast surface for this session.
    received: list[dict] = []

    class FakeWebSocket:
        async def send_text(self, text: str) -> None:
            import json as _json

            received.append(_json.loads(text))

    fake = FakeWebSocket()
    manager.internal_watchers[session_id].append(fake)
    try:
        # Bring tech_stack from 0% to ≥80% — assess_coverage scores 80 for
        # content lengths between 150 and 300 chars.
        rich = (
            "Next.js + React for the frontend, FastAPI on Python 3.11 for the backend, "
            "PostgreSQL 16 as the primary store, and Upstash Redis for caching. LiveKit for "
            "real-time audio/video, Resend for email."
        )
        await client.patch(
            f"/api/projects/{project_id}/blueprint/sections/tech_stack",
            json={"content": rich},
            headers=auth_headers,
        )
    finally:
        manager.disconnect_internal_watcher(session_id, fake)

    completion_events = [e for e in received if e.get("type") == "section_completed"]
    assert len(completion_events) >= 1
    matching = [e for e in completion_events if e["payload"]["section"] == "tech_stack"]
    assert len(matching) == 1, f"expected exactly one tech_stack section_completed event, got {len(matching)}"
    assert matching[0]["payload"]["score"] >= 80


async def test_section_completed_does_not_refire_for_already_complete_section(client, auth_headers):
    """A second edit to an already-completed section must not re-fire the
    celebration event — completion is a one-shot signal per crossing."""
    from src.app.ws.manager import manager

    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess_resp = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "T"},
        headers=auth_headers,
    )
    session_id = sess_resp.json()["id"]

    # ≥150 chars (and ≥2 keyword matches) so assess_coverage scores 80+.
    rich = (
        "Next.js + React for the frontend, FastAPI on Python 3.11 for the backend, "
        "PostgreSQL 16 as the primary store, and Upstash Redis for caching. "
        "LiveKit for real-time audio/video, Resend for transactional email."
    )
    # Bring tech_stack above the threshold before we start spying so the
    # first crossing event doesn't count for this test.
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": rich},
        headers=auth_headers,
    )

    received: list[dict] = []

    class FakeWebSocket:
        async def send_text(self, text: str) -> None:
            import json as _json

            received.append(_json.loads(text))

    fake = FakeWebSocket()
    manager.internal_watchers[session_id].append(fake)
    try:
        # Second edit — still above threshold; should NOT emit section_completed.
        await client.patch(
            f"/api/projects/{project_id}/blueprint/sections/tech_stack",
            json={"content": rich + " Sentry for error tracking."},
            headers=auth_headers,
        )
    finally:
        manager.disconnect_internal_watcher(session_id, fake)

    completion_events = [
        e for e in received
        if e.get("type") == "section_completed" and e["payload"].get("section") == "tech_stack"
    ]
    assert completion_events == [], (
        f"section_completed should not re-fire for already-complete sections, got {completion_events}"
    )


async def test_user_edit_records_bullet_level_provenance(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P"}, headers=auth_headers)
    project_id = proj.json()["id"]
    await client.get(f"/api/projects/{project_id}/blueprint", headers=auth_headers)
    await client.patch(
        f"/api/projects/{project_id}/blueprint/sections/tech_stack",
        json={"content": "- React\n- Postgres"},
        headers=auth_headers,
    )

    snapshots = await client.get(
        f"/api/projects/{project_id}/blueprint/snapshots",
        headers=auth_headers,
    )
    latest_id = snapshots.json()[0]["id"]
    detail = await client.get(
        f"/api/projects/{project_id}/blueprint/snapshots/{latest_id}",
        headers=auth_headers,
    )
    assert detail.status_code == 200
    bullet_sources = detail.json()["bullet_sources"]["tech_stack"]
    assert bullet_sources == {"react": "user_stated", "postgres": "user_stated"}
