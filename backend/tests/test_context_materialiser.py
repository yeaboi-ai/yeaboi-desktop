"""Tests for the deterministic context materialiser."""

from __future__ import annotations

import copy
from types import SimpleNamespace

from src.app.services.context_materialiser import EMPTY_DIRECTORY, materialise


def _make_ctx(directory: dict | None = None) -> SimpleNamespace:
    """Build a lightweight SessionContext-compatible object without touching the DB or ORM."""
    return SimpleNamespace(
        id="ctx-id",
        session_id="sess-id",
        directory=copy.deepcopy(directory) if directory is not None else copy.deepcopy(EMPTY_DIRECTORY),
        summary=None,
        summary_through_event_id=None,
    )


def _make_event(event_type: str, payload: dict | None = None, event_id: str = "evt-1") -> SimpleNamespace:
    """Build a lightweight SessionEvent-compatible object without touching the DB or ORM."""
    return SimpleNamespace(
        id=event_id,
        session_id="sess-id",
        event_type=event_type,
        source="system",
        payload=payload or {},
        summary=None,
    )


# ─── message ──────────────────────────────────────────────────────────────────


def test_message_increments_count():
    ctx = _make_ctx()
    evt = _make_event("message", {"content": "hello"})
    materialise(ctx, evt)
    assert ctx.directory["session"]["message_count"] == 1


def test_message_increments_count_multiple():
    ctx = _make_ctx()
    for i in range(5):
        materialise(ctx, _make_event("message", {"content": f"msg {i}"}, event_id=f"evt-{i}"))
    assert ctx.directory["session"]["message_count"] == 5


# ─── blueprint_edit ───────────────────────────────────────────────────────────


def test_blueprint_edit_updates_coverage():
    ctx = _make_ctx()
    evt = _make_event(
        "blueprint_edit",
        {"section": "project_overview", "content": "Build a task management app for developers"},
    )
    materialise(ctx, evt)
    cov = ctx.directory["blueprint_coverage"]
    assert "project_overview" in cov
    assert isinstance(cov["project_overview"], int)
    assert 0 <= cov["project_overview"] <= 100


# ─── diagram_update ───────────────────────────────────────────────────────────


def test_diagram_update_adds_artifact():
    ctx = _make_ctx()
    evt = _make_event("diagram_update", {"diagram_type": "flow", "title": "User Flow", "node_count": 5})
    materialise(ctx, evt)
    assert len(ctx.directory["artifacts"]) == 1
    a = ctx.directory["artifacts"][0]
    assert a["type"] == "flow"
    assert a["title"] == "User Flow"
    assert a["id"] == "evt-1"


def test_diagram_update_replaces_same_type():
    """Two diagram_update events of the same type → only 1 artifact in list."""
    ctx = _make_ctx()
    evt1 = _make_event("diagram_update", {"diagram_type": "flow", "title": "First Flow"}, event_id="evt-1")
    evt2 = _make_event("diagram_update", {"diagram_type": "flow", "title": "Updated Flow"}, event_id="evt-2")
    materialise(ctx, evt1)
    materialise(ctx, evt2)
    assert len(ctx.directory["artifacts"]) == 1
    assert ctx.directory["artifacts"][0]["title"] == "Updated Flow"
    assert ctx.directory["artifacts"][0]["id"] == "evt-2"


# ─── wireframe_generated ──────────────────────────────────────────────────────


def test_wireframe_adds_artifact():
    ctx = _make_ctx()
    evt1 = _make_event("wireframe_generated", {"screen_name": "Home Screen"}, event_id="evt-1")
    evt2 = _make_event("wireframe_generated", {"screen_name": "Settings Screen"}, event_id="evt-2")
    materialise(ctx, evt1)
    materialise(ctx, evt2)
    # Wireframes accumulate — both should be present
    assert len(ctx.directory["artifacts"]) == 2
    types = [a["type"] for a in ctx.directory["artifacts"]]
    assert all(t == "wireframe" for t in types)


# ─── decision ─────────────────────────────────────────────────────────────────


def test_decision_appends():
    ctx = _make_ctx()
    evt = _make_event(
        "decision", {"text": "Use PostgreSQL", "rationale": "ACID compliance", "related_section": "tech_stack"},
    )
    materialise(ctx, evt)
    assert len(ctx.directory["decisions"]) == 1
    d = ctx.directory["decisions"][0]
    assert d["text"] == "Use PostgreSQL"
    assert d["rationale"] == "ACID compliance"
    assert d["related_section"] == "tech_stack"


# ─── canvas_sync ──────────────────────────────────────────────────────────────


def test_canvas_sync_updates_metadata():
    ctx = _make_ctx()
    evt = _make_event("canvas_sync", {"element_count": 12, "types": ["rectangle", "text"]})
    materialise(ctx, evt)
    assert ctx.directory["session"]["canvas_elements"] == 12


# ─── system ───────────────────────────────────────────────────────────────────


def test_system_event_no_change():
    ctx = _make_ctx()
    original = copy.deepcopy(ctx.directory)
    evt = _make_event("system", {"info": "session started"})
    materialise(ctx, evt)
    assert ctx.directory == original
