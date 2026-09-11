"""Tests for the session-completion wizard backend: stories preview / commit
and the task_generator dependency-mapping logic."""

import json
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from src.app.models.board import Card
from src.app.services.task_generator import (
    _sanitize_dep_indices,
    persist_tasks_to_board,
    preview_tasks_from_blueprint,
)

# ── Helpers ──────────────────────────────────────────────────────────────────


async def _create_project_with_session(client, auth_headers, status: str = "live") -> tuple[str, str]:
    proj = await client.post("/api/sessions", json={"name": "P-stories"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create_resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Build a kanban-driven planning tool"},
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]
    if status != "live":
        await client.patch(f"/api/sessions/{session_id}", json={"status": status}, headers=auth_headers)
    return session_id, session_id


def _ai_returning(tasks: list[dict]) -> AsyncMock:
    mock = AsyncMock()
    mock.chat = AsyncMock(return_value=json.dumps(tasks))
    mock.provider = "test"
    return mock


# ── _sanitize_dep_indices unit tests ─────────────────────────────────────────


def test_sanitize_drops_forward_references():
    """A task can only depend on tasks that come BEFORE it (j < i). Forward refs
    are silently dropped — the orchestrator's wave scheduler assumes a DAG."""
    tasks = [
        {"title": "A", "depends_on_indices": []},
        {"title": "B", "depends_on_indices": [2]},  # forward ref — invalid
        {"title": "C", "depends_on_indices": [0, 1]},
    ]
    out = _sanitize_dep_indices(tasks)
    assert out[1]["depends_on_indices"] == []
    assert out[2]["depends_on_indices"] == [0, 1]


def test_sanitize_drops_self_references():
    tasks = [
        {"title": "A", "depends_on_indices": []},
        {"title": "B", "depends_on_indices": [1]},  # self-ref
    ]
    out = _sanitize_dep_indices(tasks)
    assert out[1]["depends_on_indices"] == []


def test_sanitize_drops_out_of_range_related():
    tasks = [
        {"title": "A", "related_to_indices": [99]},
        {"title": "B", "related_to_indices": [0]},
    ]
    out = _sanitize_dep_indices(tasks)
    assert out[0]["related_to_indices"] == []
    assert out[1]["related_to_indices"] == [0]


def test_sanitize_handles_missing_keys():
    """Tasks may omit dependency fields entirely — should default to empty lists."""
    tasks = [{"title": "A"}, {"title": "B"}]
    out = _sanitize_dep_indices(tasks)
    assert out[0]["depends_on_indices"] == []
    assert out[1]["related_to_indices"] == []


# ── preview_tasks_from_blueprint ─────────────────────────────────────────────


async def test_preview_returns_empty_for_empty_blueprint(db_session):
    tasks = await preview_tasks_from_blueprint({}, db_session, org_id="org-1")
    assert tasks == []


async def test_preview_parses_ai_output_and_sanitizes(db_session):
    raw_tasks = [
        {"title": "Setup", "wave": 0, "sequence": 0, "depends_on_indices": [], "related_to_indices": []},
        {"title": "Auth", "wave": 1, "sequence": 0, "depends_on_indices": [0], "related_to_indices": []},
        {"title": "API", "wave": 1, "sequence": 1, "depends_on_indices": [3]},  # bad forward ref
    ]
    with patch("src.app.services.task_generator.get_ai_client", AsyncMock(return_value=_ai_returning(raw_tasks))):
        tasks = await preview_tasks_from_blueprint({"project_overview": "x"}, db_session, org_id="org-1")
    assert len(tasks) == 3
    assert tasks[2]["depends_on_indices"] == []  # sanitized


async def test_preview_handles_markdown_fences(db_session):
    """Some models wrap JSON in ```json fences; the parser strips them."""
    raw = "```json\n" + json.dumps([{"title": "A"}]) + "\n```"
    mock_ai = AsyncMock()
    mock_ai.chat = AsyncMock(return_value=raw)
    mock_ai.provider = "test"
    with patch("src.app.services.task_generator.get_ai_client", AsyncMock(return_value=mock_ai)):
        tasks = await preview_tasks_from_blueprint({"project_overview": "x"}, db_session)
    assert len(tasks) == 1
    assert tasks[0]["title"] == "A"


async def test_preview_returns_empty_on_invalid_json(db_session):
    mock_ai = AsyncMock()
    mock_ai.chat = AsyncMock(return_value="not json at all")
    mock_ai.provider = "test"
    with patch("src.app.services.task_generator.get_ai_client", AsyncMock(return_value=mock_ai)):
        tasks = await preview_tasks_from_blueprint({"project_overview": "x"}, db_session)
    assert tasks == []


# ── persist_tasks_to_board ───────────────────────────────────────────────────


async def test_persist_resolves_dependency_indices_to_card_ids(client, auth_headers, db_session):
    """The two-pass persist must turn 0-based depends_on_indices into actual
    UUID lists pointing at the persisted Card rows."""
    proj = await client.post("/api/sessions", json={"name": "P-persist"}, headers=auth_headers)
    session_id = proj.json()["id"]

    tasks = [
        {"title": "Setup", "wave": 0, "depends_on_indices": [], "related_to_indices": []},
        {"title": "Auth", "wave": 1, "depends_on_indices": [0], "related_to_indices": []},
        {"title": "Profile", "wave": 2, "depends_on_indices": [1], "related_to_indices": [0]},
    ]
    _board, count = await persist_tasks_to_board(session_id, tasks, db_session)
    assert count == 3

    cards = (await db_session.execute(select(Card).order_by(Card.position))).scalars().all()
    by_title = {c.title: c for c in cards}

    assert by_title["Setup"].depends_on == []
    assert by_title["Auth"].depends_on == [by_title["Setup"].id]
    assert by_title["Profile"].depends_on == [by_title["Auth"].id]
    assert by_title["Profile"].related_to == [by_title["Setup"].id]
    assert by_title["Setup"].wave == 0
    assert by_title["Auth"].wave == 1


async def test_persist_children_inherit_parent_wave(client, auth_headers, db_session):
    """Children of a task inherit that task's derived wave.

    The persist pipeline runs `_compute_waves_and_sequences`, which derives
    `wave` from the actual depends_on_indices DAG (overriding any AI-supplied
    value). So to land a parent in wave 2 we need to give it a dep chain.
    """
    proj = await client.post("/api/sessions", json={"name": "P-child"}, headers=auth_headers)
    session_id = proj.json()["id"]

    tasks = [
        {"title": "Foundations", "depends_on_indices": []},  # wave 0
        {"title": "Auth", "depends_on_indices": [0]},  # wave 1
        {
            "title": "Profile feature",
            "depends_on_indices": [1],  # wave 2
            "children": [{"title": "Child A"}, {"title": "Child B"}],
        },
    ]
    await persist_tasks_to_board(session_id, tasks, db_session)
    cards = (await db_session.execute(select(Card))).scalars().all()
    children = [c for c in cards if c.parent_card_id is not None]
    assert len(children) == 2
    for c in children:
        assert c.wave == 2


# ── /stories/preview endpoint ────────────────────────────────────────────────


async def test_stories_preview_requires_auth(client):
    proj_id = "nonexistent"  # auth fails before project lookup
    resp = await client.post(f"/api/sessions/{proj_id}/stories/preview")
    assert resp.status_code == 401


async def test_stories_preview_404_for_missing_project(client, auth_headers):
    resp = await client.post("/api/sessions/nope/stories/preview", headers=auth_headers)
    assert resp.status_code == 404


async def test_stories_preview_returns_task_list(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P-prev"}, headers=auth_headers)
    session_id = proj.json()["id"]
    # preview returns [] for empty blueprints — seed one section so the AI is called.
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/project_overview",
        json={"content": "A planning tool that turns voice sessions into kanban boards."},
        headers=auth_headers,
    )

    raw_tasks = [
        {"title": "Setup repo", "wave": 0, "sequence": 0},
        {"title": "Add auth", "wave": 1, "sequence": 0, "depends_on_indices": [0]},
    ]
    with patch("src.app.services.task_generator.get_ai_client", AsyncMock(return_value=_ai_returning(raw_tasks))):
        resp = await client.post(f"/api/sessions/{session_id}/stories/preview", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "tasks" in data
    assert len(data["tasks"]) == 2
    assert data["tasks"][1]["depends_on_indices"] == [0]
    # Templates list is included so the wizard can render proper type chips
    # for org-defined custom slugs (system slugs have built-in fallbacks).
    assert "templates" in data
    assert isinstance(data["templates"], list)
    template_slugs = {t["slug"] for t in data["templates"]}
    # The 5 system templates should be seeded for any new org on first preview.
    assert {"feature", "bug", "chore", "spike", "tech_debt"}.issubset(template_slugs)
    for t in data["templates"]:
        assert "slug" in t and "name" in t


async def test_stories_preview_forwards_regeneration_feedback(client, auth_headers):
    """When the wizard's Regenerate dialog supplies feedback, the AI prompt
    must include both the free-form text and the disliked task titles so the
    next attempt can avoid repeating the same misses."""
    proj = await client.post("/api/sessions", json={"name": "P-feedback"}, headers=auth_headers)
    session_id = proj.json()["id"]
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/project_overview",
        json={"content": "Turn voice sessions into a kanban board."},
        headers=auth_headers,
    )

    raw_tasks = [{"title": "Better task", "wave": 0, "sequence": 0}]
    mock_ai = _ai_returning(raw_tasks)
    with patch("src.app.services.task_generator.get_ai_client", AsyncMock(return_value=mock_ai)):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview",
            json={
                "feedback": "Tasks were too granular — give me bigger chunks.",
                "disliked_titles": ["Setup repo", "Add auth"],
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200, resp.text

    # The AI client should have received the feedback embedded in the prompt.
    assert mock_ai.chat.await_count == 1
    call_kwargs = mock_ai.chat.await_args.kwargs
    sent_prompt = call_kwargs["messages"][0]["content"]
    assert "REGENERATION FEEDBACK" in sent_prompt
    assert "Tasks were too granular" in sent_prompt
    assert "Setup repo" in sent_prompt
    assert "Add auth" in sent_prompt


async def test_regenerate_single_task_rejects_unknown_fields(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P-regen-bad"}, headers=auth_headers)
    session_id = proj.json()["id"]
    body = {
        "task": {"title": "x"},
        "fields": ["title", "wave"],  # wave is system-managed
        "feedback": "",
        "context_titles": [],
    }
    resp = await client.post(
        f"/api/sessions/{session_id}/stories/preview/regenerate-task",
        json=body,
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "wave" in resp.json()["detail"]


async def test_regenerate_single_task_rejects_empty_fields(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P-regen-empty"}, headers=auth_headers)
    session_id = proj.json()["id"]
    resp = await client.post(
        f"/api/sessions/{session_id}/stories/preview/regenerate-task",
        json={"task": {"title": "x"}, "fields": [], "feedback": "", "context_titles": []},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_regenerate_single_task_swaps_only_requested_fields(client, auth_headers):
    """Regenerated fields take the AI's new value; everything else (including
    system-managed deps/wave) survives untouched."""
    proj = await client.post("/api/sessions", json={"name": "P-regen-ok"}, headers=auth_headers)
    session_id = proj.json()["id"]
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/project_overview",
        json={"content": "Build a planning platform."},
        headers=auth_headers,
    )

    existing = {
        "title": "Old title",
        "description": "Old description",
        "priority": "low",
        "story_points": 1,
        "labels": ["old-label"],
        "acceptance_criteria": ["Old criterion"],
        "depends_on_indices": [3],
        "related_to_indices": [5],
        "wave": 2,
        "sequence": 1,
        "template_slug": "chore",
    }
    ai_response = {
        "title": "Old title",
        "description": "Sharper, clearer description that reflects the user feedback.",
        "acceptance_criteria": ["Concrete criterion 1", "Concrete criterion 2"],
        # AI tries to override these — we MUST ignore them and keep the originals.
        "depends_on_indices": [99],
        "wave": 999,
    }
    mock_ai = AsyncMock()
    mock_ai.chat = AsyncMock(return_value=json.dumps(ai_response))
    mock_ai.provider = "test"

    with patch("src.app.services.task_generator.get_ai_client", AsyncMock(return_value=mock_ai)):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview/regenerate-task",
            json={
                "task": existing,
                "fields": ["description", "acceptance_criteria"],
                "feedback": "Too vague — be more specific about expected outcomes.",
                "context_titles": ["Setup repo", "Add auth"],
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200, resp.text
    new_task = resp.json()["task"]

    # Regenerated fields swapped in
    assert new_task["description"] == ai_response["description"]
    assert new_task["acceptance_criteria"] == ai_response["acceptance_criteria"]
    # Non-requested fields preserved exactly
    assert new_task["title"] == existing["title"]
    assert new_task["priority"] == existing["priority"]
    assert new_task["story_points"] == existing["story_points"]
    assert new_task["labels"] == existing["labels"]
    assert new_task["template_slug"] == existing["template_slug"]
    # System-managed fields preserved even if AI tried to change them
    assert new_task["depends_on_indices"] == existing["depends_on_indices"]
    assert new_task["related_to_indices"] == existing["related_to_indices"]
    assert new_task["wave"] == existing["wave"]
    assert new_task["sequence"] == existing["sequence"]

    # Feedback + context were forwarded into the prompt
    sent_prompt = mock_ai.chat.await_args.kwargs["messages"][0]["content"]
    assert "Too vague" in sent_prompt
    assert "Setup repo" in sent_prompt
    assert "REGENERATE THESE FIELDS ONLY: description, acceptance_criteria" in sent_prompt


async def test_regenerate_single_task_injects_template_guidance(client, auth_headers):
    """The single-task regen prompt MUST surface the org's planning-studio
    template spec so the rewrite respects user customisations (prompt_fragment,
    default_priority, default_labels, acceptance_criteria_template, etc).
    Without this, regen would diverge from what the user set up in the studio."""
    proj = await client.post("/api/sessions", json={"name": "P-template-regen"}, headers=auth_headers)
    session_id = proj.json()["id"]
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/project_overview",
        json={"content": "Build a thing."},
        headers=auth_headers,
    )

    existing = {
        "title": "Reproducer for crash on signup",
        "description": "old desc",
        "priority": "medium",
        "story_points": 1,
        "labels": [],
        "acceptance_criteria": ["old"],
        "depends_on_indices": [],
        "related_to_indices": [],
        "wave": 0,
        "sequence": 0,
        "template_slug": "bug",  # active template — its spec must show up
        "custom_fields": {},
    }
    mock_ai = AsyncMock()
    mock_ai.chat = AsyncMock(return_value=json.dumps({"description": "Sharper."}))
    mock_ai.provider = "test"

    with patch("src.app.services.task_generator.get_ai_client", AsyncMock(return_value=mock_ai)):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview/regenerate-task",
            json={
                "task": existing,
                "fields": ["description"],
                "feedback": "",
                "context_titles": [],
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200, resp.text

    sent_prompt = mock_ai.chat.await_args.kwargs["messages"][0]["content"]
    # The active template's spec must be locked in (current_slug + not regenerating slug)
    assert "TICKET TEMPLATE RULES" in sent_prompt
    assert "'bug' template — keep it" in sent_prompt
    # And the bug template's prompt_fragment from ticket_template_service should
    # show up via the guidance line so the AI follows the studio's customisation.
    assert "guidance:" in sent_prompt


async def test_stories_preview_without_body_skips_feedback_block(client, auth_headers):
    """First-time previews (no body) should not inject the feedback section
    — that prefix only belongs on regenerations."""
    proj = await client.post("/api/sessions", json={"name": "P-fresh"}, headers=auth_headers)
    session_id = proj.json()["id"]
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/project_overview",
        json={"content": "Build a planning platform."},
        headers=auth_headers,
    )

    mock_ai = _ai_returning([{"title": "x"}])
    with patch("src.app.services.task_generator.get_ai_client", AsyncMock(return_value=mock_ai)):
        resp = await client.post(f"/api/sessions/{session_id}/stories/preview", headers=auth_headers)
    assert resp.status_code == 200
    sent_prompt = mock_ai.chat.await_args.kwargs["messages"][0]["content"]
    assert "REGENERATION FEEDBACK" not in sent_prompt


# ── /stories/commit endpoint ─────────────────────────────────────────────────


async def test_stories_commit_rejects_invalid_dependency_index(client, auth_headers):
    session_id, _ = await _create_project_with_session(client, auth_headers, status="live")
    bad = {"tasks": [{"title": "A", "depends_on_indices": [5]}]}
    resp = await client.post(f"/api/sessions/{session_id}/stories/commit", json=bad, headers=auth_headers)
    assert resp.status_code == 400
    assert "depends_on_indices" in resp.json()["detail"]


async def test_stories_commit_rejects_self_related_index(client, auth_headers):
    session_id, _ = await _create_project_with_session(client, auth_headers, status="live")
    bad = {"tasks": [{"title": "A", "related_to_indices": [0]}]}
    resp = await client.post(f"/api/sessions/{session_id}/stories/commit", json=bad, headers=auth_headers)
    assert resp.status_code == 400


async def test_stories_commit_persists_and_completes_session(client, auth_headers, db_engine):
    """Happy path: commit transitions reviewing → completed AND persists Cards
    with the wizard-edited task list (no AI re-call)."""
    session_id, session_id = await _create_project_with_session(client, auth_headers, status="live")
    # Move session into reviewing so commit can transition it.
    resp = await client.patch(
        f"/api/sessions/{session_id}", json={"status": "reviewing"}, headers=auth_headers
    )
    assert resp.status_code == 200, resp.text

    body = {
        "tasks": [
            {"title": "Setup", "wave": 0, "depends_on_indices": [], "related_to_indices": []},
            {"title": "Auth", "wave": 1, "depends_on_indices": [0], "related_to_indices": []},
        ]
    }
    resp = await client.post(f"/api/sessions/{session_id}/stories/commit", json=body, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["task_count"] == 2
    assert data["session_id"] == session_id

    # Session should now be completed
    sess = await client.get(f"/api/sessions/{session_id}", headers=auth_headers)
    assert sess.json()["status"] == "completed"

    # Cards should be persisted with resolved dependencies
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        cards = (await db.execute(select(Card).order_by(Card.position))).scalars().all()
        assert len(cards) == 2
        assert cards[0].title == "Setup"
        assert cards[1].title == "Auth"
        assert cards[1].depends_on == [cards[0].id]
        assert cards[1].wave == 1


# ── State machine: reviewing ⇄ live ─────────────────────────────────────────


async def test_reviewing_can_return_to_live(client, auth_headers):
    """The wizard's 'Go back and fill these in' CTA needs reviewing → live."""
    proj = await client.post("/api/sessions", json={"name": "P-rev"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    session_id = create.json()["id"]

    # live → reviewing
    r1 = await client.patch(f"/api/sessions/{session_id}", json={"status": "reviewing"}, headers=auth_headers)
    assert r1.status_code == 200
    assert r1.json()["status"] == "reviewing"

    # reviewing → live (cancel path)
    r2 = await client.patch(f"/api/sessions/{session_id}", json={"status": "live"}, headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["status"] == "live"


async def test_reviewing_cannot_jump_to_paused(client, auth_headers):
    """Only completed and live are valid from reviewing; paused is not."""
    proj = await client.post("/api/sessions", json={"name": "P-rev2"}, headers=auth_headers)
    session_id = proj.json()["id"]
    create = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "x"},
        headers=auth_headers,
    )
    session_id = create.json()["id"]
    await client.patch(f"/api/sessions/{session_id}", json={"status": "reviewing"}, headers=auth_headers)
    bad = await client.patch(f"/api/sessions/{session_id}", json={"status": "paused"}, headers=auth_headers)
    assert bad.status_code == 400
