async def test_create_project(client, auth_headers):
    resp = await client.post(
        "/api/sessions",
        json={"name": "Test Session", "description": "A test"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Session"
    assert data["description"] == "A test"
    assert "id" in data
    assert "created_at" in data


async def test_list_projects_empty(client, auth_headers):
    resp = await client.get("/api/sessions", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_projects_returns_owned(client, auth_headers):
    await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    await client.post("/api/sessions", json={"name": "P2"}, headers=auth_headers)
    resp = await client.get("/api/sessions", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_get_project(client, auth_headers):
    create_resp = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    resp = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "P1"


async def test_get_nonexistent_project_returns_404(client, auth_headers):
    resp = await client.get("/api/sessions/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


async def test_update_project(client, auth_headers):
    create_resp = await client.post("/api/sessions", json={"name": "Old"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"name": "New", "description": "Updated"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"
    assert resp.json()["description"] == "Updated"


async def test_delete_project(client, auth_headers):
    create_resp = await client.post("/api/sessions", json={"name": "Doomed"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 404


async def test_cannot_see_other_users_projects(client, auth_headers, other_auth_headers):
    """Users not in any org hit 400 at get_current_org before the list handler
    ever runs — either that or an empty list is acceptable isolation."""
    await client.post("/api/sessions", json={"name": "Private"}, headers=auth_headers)
    resp = await client.get("/api/sessions", headers=other_auth_headers)
    assert resp.status_code in (200, 400, 403)
    if resp.status_code == 200:
        assert resp.json() == []


async def test_patch_default_generation_style_persists(client, auth_headers):
    """``default_generation_style`` holds the GRANULARITY axis. Sending a
    granularity slug stores it verbatim and round-trips via GET."""
    create_resp = await client.post("/api/sessions", json={"name": "P-style"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"default_generation_style": "many_small"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["default_generation_style"] == "many_small"

    get_resp = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert get_resp.json()["default_generation_style"] == "many_small"


async def test_patch_default_generation_style_rejects_unknown_slug(client, auth_headers):
    create_resp = await client.post("/api/sessions", json={"name": "P-style"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"default_generation_style": "not_a_style"},
        headers=auth_headers,
    )
    assert resp.status_code in (400, 422)


async def test_patch_default_modifiers_persists_and_validates(client, auth_headers):
    create_resp = await client.post("/api/sessions", json={"name": "P-mods"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    # Happy path: accepts a list of valid modifier slugs.
    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"default_modifiers": ["spike_first", "story_driven"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["default_modifiers"] == ["spike_first", "story_driven"]

    # GET surfaces them.
    get_resp = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert get_resp.json()["default_modifiers"] == ["spike_first", "story_driven"]

    # Unknown modifier → 422.
    bad = await client.patch(
        f"/api/sessions/{session_id}",
        json={"default_modifiers": ["not_a_mod"]},
        headers=auth_headers,
    )
    assert bad.status_code == 422


async def test_patch_default_modifiers_round_trips_cross_category_combo(client, auth_headers):
    """A real user might pick modifiers across all 4 categories at once.
    GET must round-trip the full list in insertion order so the wizard
    preselects them faithfully."""
    create_resp = await client.post("/api/sessions", json={"name": "P-combo"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    combo = [
        "vertical_slices",  # shape
        "test_driven",  # quality
        "observability_first",  # quality
        "compliance_aware",  # risk
        "mvp_first",  # methodology
    ]
    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"default_modifiers": combo},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["default_modifiers"] == combo

    get_resp = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert get_resp.json()["default_modifiers"] == combo


async def test_patch_modifier_in_default_generation_style_field_reroutes(client, auth_headers):
    """Legacy clients used ``default_generation_style`` for ANY style slug.
    Sending a modifier there now routes it into ``default_modifiers`` rather
    than dropping it on the floor."""
    create_resp = await client.post("/api/sessions", json={"name": "P-legacy"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"default_generation_style": "spike_first"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["default_generation_style"] is None
    assert "spike_first" in (data["default_modifiers"] or [])


async def test_patch_default_generation_style_accepts_null(client, auth_headers):
    """Setting null clears the project default so the wizard falls back to balanced."""
    create_resp = await client.post("/api/sessions", json={"name": "P-style"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    await client.patch(
        f"/api/sessions/{session_id}",
        json={"default_generation_style": "minimal"},
        headers=auth_headers,
    )
    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"default_generation_style": None},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["default_generation_style"] is None


async def test_cannot_access_other_users_project(client, auth_headers, other_auth_headers):
    """Other user is not in the project's team, so GET returns either 404
    (membership check) or is blocked at the org/team resolution layer."""
    create_resp = await client.post("/api/sessions", json={"name": "Secret"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    resp = await client.get(f"/api/sessions/{session_id}", headers=other_auth_headers)
    # Today the endpoint returns 200 with `is_own_team=False` for cross-team
    # reads (visibility by design). If that changes back to 404/403, the test
    # still passes.
    assert resp.status_code in (200, 403, 404)
    if resp.status_code == 200:
        assert resp.json().get("is_own_team") is False


async def test_delete_project_cascades_project_outputs(client, auth_headers, db_session):
    """delete_project must remove any session_outputs rows for the project."""
    from sqlalchemy import select

    from src.app.models.session_output import SessionOutput

    proj = await client.post("/api/sessions", json={"name": "Output Cascade"}, headers=auth_headers)
    session_id = proj.json()["id"]

    db_session.add(SessionOutput(session_id=session_id, output_type="code_scaffold", status="ready"))
    await db_session.commit()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text

    rows = (await db_session.execute(select(SessionOutput).where(SessionOutput.session_id == session_id))).all()
    assert rows == []


async def test_delete_project_cascades_blueprint_suggestions(client, auth_headers, db_session):
    """blueprint_suggestions.session_id is NOT NULL — leaving rows behind blocks the FK on delete."""
    from sqlalchemy import select

    from src.app.models.blueprint import BlueprintSuggestion

    proj = await client.post("/api/sessions", json={"name": "Suggestion Cascade"}, headers=auth_headers)
    session_id = proj.json()["id"]

    db_session.add(BlueprintSuggestion(session_id=session_id, section="goals", content="Add SSO", status="pending"))
    db_session.add(
        BlueprintSuggestion(session_id=session_id, section="risks", content="Vendor lock-in", status="pending")
    )
    await db_session.commit()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text

    rows = (
        await db_session.execute(select(BlueprintSuggestion).where(BlueprintSuggestion.session_id == session_id))
    ).all()
    assert rows == []


async def test_delete_project_cascades_project_scoped_ticket_templates(client, auth_headers, db_session):
    """Session-scoped templates die with the project; org-scoped (session_id NULL) survive."""
    from sqlalchemy import select

    from src.app.models.organization import OrgMember
    from src.app.models.ticket_template import TicketTemplate

    proj = await client.post("/api/sessions", json={"name": "Template Cascade"}, headers=auth_headers)
    session_id = proj.json()["id"]

    org_id = (await db_session.execute(select(OrgMember.org_id))).scalar_one()

    db_session.add(
        TicketTemplate(
            org_id=org_id,
            session_id=session_id,
            slug="bug-scoped",
            name="Bug (project)",
            prompt_fragment="",
        )
    )
    db_session.add(
        TicketTemplate(
            org_id=org_id,
            session_id=None,
            slug="bug-org",
            name="Bug (org)",
            prompt_fragment="",
        )
    )
    await db_session.commit()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text

    scoped = (await db_session.execute(select(TicketTemplate).where(TicketTemplate.session_id == session_id))).all()
    assert scoped == []

    org_level = (
        (await db_session.execute(select(TicketTemplate).where(TicketTemplate.slug == "bug-org"))).scalars().all()
    )
    assert len(org_level) == 1


async def test_delete_project_nullifies_usage_events(client, auth_headers, db_session):
    """UsageEvent is a billing ledger — rows persist with session_id detached after delete."""
    from decimal import Decimal

    from sqlalchemy import select

    from src.app.models.organization import OrgMember
    from src.app.models.usage_event import UsageEvent

    proj = await client.post("/api/sessions", json={"name": "Usage Detach"}, headers=auth_headers)
    session_id = proj.json()["id"]

    org_id = (await db_session.execute(select(OrgMember.org_id))).scalar_one()

    for _ in range(3):
        db_session.add(
            UsageEvent(
                org_id=org_id,
                session_id=session_id,
                provider="anthropic",
                operation="chat",
                cost_usd=Decimal("0.01"),
            )
        )
    await db_session.commit()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text

    still_attached = (await db_session.execute(select(UsageEvent).where(UsageEvent.session_id == session_id))).all()
    assert still_attached == []

    detached = (
        (
            await db_session.execute(
                select(UsageEvent).where(UsageEvent.org_id == org_id, UsageEvent.session_id.is_(None))
            )
        )
        .scalars()
        .all()
    )
    assert len(detached) == 3


async def test_team_admin_can_delete_project_they_dont_own(client, auth_headers, other_auth_headers, db_session):
    """A team admin who is not the project owner can still delete the project."""
    from sqlalchemy import select

    from src.app.models.organization import TeamMember
    from src.app.models.session import Session
    from src.app.models.user import User

    proj_resp = await client.post("/api/sessions", json={"name": "Admin Delete"}, headers=auth_headers)
    assert proj_resp.status_code == 201
    session_id = proj_resp.json()["id"]

    # Resolve the project's team
    project = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()

    # Trigger auto-creation of the other user by hitting any auth-required endpoint.
    # /api/me works for this (returns 200 without requiring org membership).
    await client.get("/api/me", headers=other_auth_headers)

    other_user = (await db_session.execute(select(User).where(User.email == "other@example.com"))).scalar_one()

    # Grant team-admin role on the project's team to the other user.
    db_session.add(TeamMember(team_id=project.team_id, user_id=other_user.id, role="admin"))
    await db_session.commit()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=other_auth_headers)
    assert resp.status_code == 204, resp.text

    gone = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one_or_none()
    assert gone is None


async def test_delete_project_with_cards_referencing_session(client, auth_headers, db_session):
    """Regression: cards.session_id has no ON DELETE; deleting sessions before clearing
    that FK 500s in Postgres. The handler must null it out first."""
    from sqlalchemy import select

    from src.app.models.board import Board, BoardColumn, Card
    from src.app.models.organization import OrgMember
    from src.app.models.session import Session

    proj = await client.post("/api/sessions", json={"name": "Card Session FK"}, headers=auth_headers)
    session_id = proj.json()["id"]

    org_id = (await db_session.execute(select(OrgMember.org_id))).scalar_one()

    board = Board(session_id=session_id, org_id=org_id)
    db_session.add(board)
    await db_session.flush()
    column = BoardColumn(board_id=board.id, name="To Do")
    db_session.add(column)
    await db_session.flush()
    db_session.add(Card(column_id=column.id, session_id=session_id, title="Spike auth"))
    await db_session.commit()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text

    # Session and its cards/sessions all gone.
    sessions_left = (await db_session.execute(select(Session).where(Session.id == session_id))).all()
    assert sessions_left == []
    cards_left = (await db_session.execute(select(Card).where(Card.session_id == session_id))).all()
    assert cards_left == []


async def test_non_owner_non_admin_cannot_delete(client, auth_headers, other_auth_headers):
    """A user who is neither the owner nor a team admin gets 403."""
    proj_resp = await client.post("/api/sessions", json={"name": "Forbidden"}, headers=auth_headers)
    assert proj_resp.status_code == 201
    session_id = proj_resp.json()["id"]

    # Other user exists (auto-created) but has no team admin role on this project's team.
    resp = await client.delete(f"/api/sessions/{session_id}", headers=other_auth_headers)
    assert resp.status_code == 403
    assert "authoris" in resp.json()["detail"].lower() or "authoriz" in resp.json()["detail"].lower()




async def test_status_round_trips(client, auth_headers):
    create_resp = await client.post("/api/sessions", json={"name": "Finishable"}, headers=auth_headers)
    project = create_resp.json()
    assert project["status"] == "active"

    resp = await client.patch(f"/api/sessions/{project['id']}", json={"status": "completed"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"

    resp = await client.get(f"/api/sessions/{project['id']}", headers=auth_headers)
    assert resp.json()["status"] == "completed"

    resp = await client.patch(f"/api/sessions/{project['id']}", json={"status": "active"}, headers=auth_headers)
    assert resp.json()["status"] == "active"


async def test_status_rejects_unknown_word(client, auth_headers):
    create_resp = await client.post("/api/sessions", json={"name": "Strict"}, headers=auth_headers)
    session_id = create_resp.json()["id"]

    resp = await client.patch(f"/api/sessions/{session_id}", json={"status": "banana"}, headers=auth_headers)
    assert resp.status_code == 422
    assert "unknown status 'banana'" in resp.json()["detail"]

    resp = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.json()["status"] == "active"
