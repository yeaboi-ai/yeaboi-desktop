"""Tests for /api/sessions/{id}/generate-design-system wiring."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_generate_design_system_routes_and_returns_memo(client, auth_headers):
    """Happy path: classifier + generator LLMs are mocked; endpoint returns
    tokens, memo, routing metadata, and the files loaded from the library."""
    proj = await client.post("/api/sessions", json={"name": "DSProj"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "A SaaS dashboard for observability engineers"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    classify_payload = json.dumps(
        {
            "recipe_letter": "g",
            "personality": "technical",
            "density": "high",
            "energy": "mid",
            "era": "mid",
            "subvert": False,
            "admin": True,
            "rationale": "observability dashboard for engineers",
        }
    )

    design_tokens = {
        "colors": {
            "primary": {"hex": "#22d3ee", "name": "Primary", "usage": "Actions"},
            "secondary": {"hex": "#334155", "name": "Secondary", "usage": "Support"},
            "accent": {"hex": "#a78bfa", "name": "Accent", "usage": "Highlights"},
            "background": {"hex": "#0b0d10", "name": "Background", "usage": "Page"},
            "surface": {"hex": "#111316", "name": "Surface", "usage": "Cards"},
            "text": {"hex": "#e5e7eb", "name": "Text", "usage": "Body"},
            "muted": {"hex": "#6b7280", "name": "Muted", "usage": "Meta"},
            "success": {"hex": "#10b981", "name": "Success", "usage": "OK"},
            "warning": {"hex": "#f59e0b", "name": "Warning", "usage": "Warn"},
            "error": {"hex": "#ef4444", "name": "Error", "usage": "Err"},
        },
        "typography": {
            "headingFont": "Geist",
            "bodyFont": "Geist",
            "scale": ["12px", "14px", "16px", "20px", "24px", "32px"],
            "lineHeight": 1.5,
            "style": "Technical, monospace-accented",
        },
        "spacing": {"unit": 4, "scale": [4, 8, 12, 16, 24, 32, 48], "note": "4px grid"},
        "borderRadius": {"sm": "2px", "md": "4px", "lg": "6px", "full": "9999px"},
        "shadows": {"sm": "...", "md": "...", "lg": "..."},
        "style": "Dense, data-forward, calm",
    }
    memo = {
        "recipe": "G — Dashboard / Data Product",
        "personality": "technical",
        "modifiers": {"density": "high", "energy": "mid", "era": "mid"},
        "variation_picks": {
            "layout": "margin-note-column",
            "type": "uppercase-labels-everywhere",
            "color": "saturated-dark",
            "motion": "single-signature-easing",
            "micro": "tabular-numerics",
            "density": "data-forward",
        },
        "why_this_fits": "Observability tools demand density and precision.",
        "anti_patterns_avoided": ["Bouncy animations", "Centered heroes"],
        "subversions": [],
    }
    generator_payload = json.dumps(design_tokens) + "\n---MEMO---\n" + json.dumps(memo)

    classifier_ai = AsyncMock()
    classifier_ai.chat = AsyncMock(return_value=classify_payload)
    generator_ai = AsyncMock()
    generator_ai.chat = AsyncMock(return_value=generator_payload)

    async def _fake_get_ai_client(org_id, db, task="default", **_kwargs):
        return classifier_ai if task == "fast" else generator_ai

    async def _fake_get_ai_client_for_role(org_id, db, role):
        # design_classify -> classifier, design -> generator
        return classifier_ai if role == "design_classify" else generator_ai

    with patch("src.app.services.ai_provider.get_ai_client", new=_fake_get_ai_client), \
         patch("src.app.services.ai_provider.get_ai_client_for_role", new=_fake_get_ai_client_for_role):
        resp = await client.post(
            f"/api/sessions/{session_id}/generate-design-system",
            json={"seed": 42},
            headers=auth_headers,
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["design_system"]["colors"]["primary"]["hex"] == "#22d3ee"
    assert data["design_memo"]["recipe"].startswith("G")
    assert data["routing"]["recipe_letter"] == "g"
    assert data["routing"]["personality"] == "technical"
    assert data["routing"]["admin"] is True
    assert "HARNESS.md" in data["files_loaded"]
    assert "utility-interfaces.md" in data["files_loaded"]  # admin=True → loaded
    assert data["seed"] == 42
    # Classifier was called once (fast), generator once (default)
    assert classifier_ai.chat.await_count == 1
    assert generator_ai.chat.await_count == 1


@pytest.mark.asyncio
async def test_generate_design_system_falls_back_when_classifier_errors(client, auth_headers):
    """If classifier LLM raises, endpoint uses keyword fallback and still returns."""
    proj = await client.post("/api/sessions", json={"name": "DS2"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "fintech trading dashboard"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    tokens = {"colors": {}, "typography": {}, "spacing": {}, "borderRadius": {}, "shadows": {}, "style": ""}
    memo = {
        "recipe": "",
        "personality": "",
        "modifiers": {},
        "variation_picks": {},
        "why_this_fits": "",
        "anti_patterns_avoided": [],
        "subversions": [],
    }
    generator_payload = json.dumps(tokens) + "\n---MEMO---\n" + json.dumps(memo)

    classifier_ai = AsyncMock()
    classifier_ai.chat = AsyncMock(side_effect=RuntimeError("provider down"))
    generator_ai = AsyncMock()
    generator_ai.chat = AsyncMock(return_value=generator_payload)

    async def _fake_get_ai_client(org_id, db, task="default", **_kwargs):
        return classifier_ai if task == "fast" else generator_ai

    async def _fake_get_ai_client_for_role(org_id, db, role):
        # design_classify -> classifier, design -> generator
        return classifier_ai if role == "design_classify" else generator_ai

    with patch("src.app.services.ai_provider.get_ai_client", new=_fake_get_ai_client), \
         patch("src.app.services.ai_provider.get_ai_client_for_role", new=_fake_get_ai_client_for_role):
        resp = await client.post(
            f"/api/sessions/{session_id}/generate-design-system",
            json={"brief_override": "fintech trading platform for retail investors"},
            headers=auth_headers,
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Fallback keyword routing picked fintech (u) or dashboard (g)
    assert data["routing"]["recipe_letter"] in {"g", "u"}
    assert data["routing"]["rationale"] == "keyword fallback (LLM classifier unavailable)"


@pytest.mark.asyncio
async def test_generate_design_system_returns_502_on_invalid_tokens_json(client, auth_headers):
    """Malformed tokens JSON from the generator → 502."""
    proj = await client.post("/api/sessions", json={"name": "DS3"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "landing page"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    classifier_ai = AsyncMock()
    classifier_ai.chat = AsyncMock(
        return_value=json.dumps(
            {
                "recipe_letter": "b",
                "personality": "professional",
                "density": "mid",
                "energy": "mid",
                "era": "mid",
                "subvert": False,
                "admin": False,
                "rationale": "saas",
            }
        )
    )
    generator_ai = AsyncMock()
    generator_ai.chat = AsyncMock(return_value="not a json\n---MEMO---\n{}")

    async def _fake_get_ai_client(org_id, db, task="default", **_kwargs):
        return classifier_ai if task == "fast" else generator_ai

    async def _fake_get_ai_client_for_role(org_id, db, role):
        # design_classify -> classifier, design -> generator
        return classifier_ai if role == "design_classify" else generator_ai

    with patch("src.app.services.ai_provider.get_ai_client", new=_fake_get_ai_client), \
         patch("src.app.services.ai_provider.get_ai_client_for_role", new=_fake_get_ai_client_for_role):
        resp = await client.post(
            f"/api/sessions/{session_id}/generate-design-system",
            json={},
            headers=auth_headers,
        )

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_generate_design_system_requires_auth(client):
    resp = await client.post("/api/sessions/nonexistent/generate-design-system", json={})
    assert resp.status_code == 401
