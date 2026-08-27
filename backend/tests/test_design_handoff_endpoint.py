"""Tests for /api/sessions/{id}/design-handoff wiring."""

from __future__ import annotations

import json

import pytest


@pytest.fixture
def tokens() -> dict:
    return {
        "colors": {
            "primary": {"hex": "#22d3ee", "name": "Primary", "usage": "CTAs"},
            "text": {"hex": "#e5e7eb", "name": "Text", "usage": "Body"},
        },
        "typography": {"headingFont": "Geist", "bodyFont": "Inter", "scale": ["14px", "16px"], "lineHeight": 1.5},
        "spacing": {"unit": 4, "scale": [4, 8, 16], "note": "4px grid"},
        "borderRadius": {"sm": "2px", "full": "9999px"},
        "shadows": {"sm": "0 1px 2px rgba(0,0,0,0.05)"},
        "style": "Dense",
    }


@pytest.fixture
def memo() -> dict:
    return {
        "recipe": "G — Dashboard / Data Product",
        "personality": "technical",
        "modifiers": {"density": "high", "energy": "mid", "era": "mid"},
        "variation_picks": {"layout": "margin-note-column", "color": "saturated-dark"},
        "why_this_fits": "Dense data display",
        "anti_patterns_avoided": ["Bouncy animations"],
        "subversions": [],
    }


@pytest.fixture
def routing() -> dict:
    return {
        "recipe_letter": "g",
        "recipe_name": "Dashboard / Data Product",
        "personality": "technical",
        "density": "high",
        "energy": "mid",
        "era": "mid",
        "subvert": False,
        "admin": True,
        "rationale": "dashboard",
    }


async def _make_session(client, auth_headers, name: str = "HP") -> str:
    proj = await client.post("/api/projects", json={"name": name}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "observability dashboard"},
        headers=auth_headers,
    )
    return sess.json()["id"]


@pytest.mark.asyncio
async def test_design_handoff_returns_all_artifacts(client, auth_headers, tokens, memo, routing):
    session_id = await _make_session(client, auth_headers)
    resp = await client.post(
        f"/api/sessions/{session_id}/design-handoff",
        json={"design_system": tokens, "design_memo": memo, "routing": routing},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["design_md"].startswith("# Design — HP")
    assert data["tokens_json"]["color"]["primary"]["$value"] == "#22d3ee"
    assert "--color-primary: #22d3ee;" in data["tokens_css"]
    assert "module.exports" in data["tailwind_preset"]
    assert data["meta"]["recipe"] == "g"


@pytest.mark.asyncio
async def test_design_handoff_as_files_returns_path_map(client, auth_headers, tokens, memo, routing):
    session_id = await _make_session(client, auth_headers, name="FilesHP")
    resp = await client.post(
        f"/api/sessions/{session_id}/design-handoff",
        json={
            "design_system": tokens,
            "design_memo": memo,
            "routing": routing,
            "as_files": True,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data["files"].keys()) == {
        "docs/DESIGN.md",
        "docs/design-tokens.json",
        "app/design-tokens.css",
        "tailwind.design.js",
    }
    parsed = json.loads(data["files"]["docs/design-tokens.json"])
    assert "color" in parsed


@pytest.mark.asyncio
async def test_design_handoff_422_when_tokens_missing(client, auth_headers):
    session_id = await _make_session(client, auth_headers, name="Missing")
    resp = await client.post(
        f"/api/sessions/{session_id}/design-handoff",
        json={"design_memo": {}, "routing": {}},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "design_system is required" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_design_handoff_404_when_session_missing(client, auth_headers, tokens):
    resp = await client.post(
        "/api/sessions/nonexistent-session/design-handoff",
        json={"design_system": tokens},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_design_handoff_requires_auth(client, tokens):
    resp = await client.post(
        "/api/sessions/any-session/design-handoff",
        json={"design_system": tokens},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_design_handoff_uses_explicit_project_name(client, auth_headers, tokens):
    session_id = await _make_session(client, auth_headers, name="IgnoredName")
    resp = await client.post(
        f"/api/sessions/{session_id}/design-handoff",
        json={"design_system": tokens, "project_name": "OverriddenName"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "# Design — OverriddenName" in resp.json()["design_md"]
