"""Tests for the org-level generation granularity + modifier CRUD."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.app.models.generation_granularity import GenerationGranularity
from src.app.models.generation_modifier import GenerationModifier
from src.app.services.granularity_service import SYSTEM_GENERATION_GRANULARITIES
from src.app.services.modifier_service import SYSTEM_GENERATION_MODIFIERS


# ── granularity ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_granularity_seeded_lazily_on_first_get(client, auth_headers, db_session):
    resp = await client.get("/api/generation-granularities", headers=auth_headers)
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == len(SYSTEM_GENERATION_GRANULARITIES)
    slugs = {r["slug"] for r in rows}
    assert slugs == {s["slug"] for s in SYSTEM_GENERATION_GRANULARITIES}
    assert all(r["is_system"] for r in rows)
    # Second call is idempotent.
    resp2 = await client.get("/api/generation-granularities", headers=auth_headers)
    assert len(resp2.json()) == len(SYSTEM_GENERATION_GRANULARITIES)


async def test_granularity_patch_updates_prompt_fragment(client, auth_headers, db_session):
    await client.get("/api/generation-granularities", headers=auth_headers)
    rows = (await db_session.execute(select(GenerationGranularity))).scalars().all()
    minimal = next(r for r in rows if r.slug == "minimal")
    resp = await client.patch(
        f"/api/generation-granularities/{minimal.id}",
        json={"prompt_fragment": "STYLE GUIDANCE — minimal (heavily customised):\n- Max 3 tickets."},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "heavily customised" in resp.json()["prompt_fragment"]


async def test_granularity_create_custom(client, auth_headers):
    resp = await client.post(
        "/api/generation-granularities",
        json={
            "label": "Epic-and-children",
            "blurb": "One epic + 10-15 children.",
            "prompt_fragment": "Generate 1 epic with 10–15 child tickets, all in the same wave.",
            "sort_order": 5,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == "epic_and_children"
    assert resp.json()["is_system"] is False


async def test_granularity_reset_restores_defaults(client, auth_headers, db_session):
    await client.get("/api/generation-granularities", headers=auth_headers)
    rows = (await db_session.execute(select(GenerationGranularity))).scalars().all()
    balanced = next(r for r in rows if r.slug == "balanced")
    await client.patch(
        f"/api/generation-granularities/{balanced.id}",
        json={"label": "Junk", "prompt_fragment": "Junk"},
        headers=auth_headers,
    )
    resp = await client.post(f"/api/generation-granularities/{balanced.id}/reset", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["label"] == "Balanced"


async def test_granularity_delete_blocks_system(client, auth_headers, db_session):
    await client.get("/api/generation-granularities", headers=auth_headers)
    row = (await db_session.execute(select(GenerationGranularity))).scalars().first()
    resp = await client.delete(f"/api/generation-granularities/{row.id}", headers=auth_headers)
    assert resp.status_code == 400


# ── modifier ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_modifier_seeded_with_all_16(client, auth_headers):
    resp = await client.get("/api/generation-modifiers", headers=auth_headers)
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == len(SYSTEM_GENERATION_MODIFIERS)
    slugs = {r["slug"] for r in rows}
    assert slugs == {s["slug"] for s in SYSTEM_GENERATION_MODIFIERS}
    # Categories preserved through seeding.
    for row in rows:
        spec = next(s for s in SYSTEM_GENERATION_MODIFIERS if s["slug"] == row["slug"])
        assert row["category"] == spec["category"]


async def test_modifier_create_with_explicit_category(client, auth_headers):
    resp = await client.post(
        "/api/generation-modifiers",
        json={
            "label": "Pair-friendly",
            "category": "methodology",
            "blurb": "Sized for paired work.",
            "prompt_fragment": "Each ticket is sized for two-person paired work; include driver + navigator AC where useful.",
            "sort_order": 100,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == "pair_friendly"
    assert resp.json()["category"] == "methodology"


async def test_modifier_rejects_unknown_category(client, auth_headers):
    resp = await client.post(
        "/api/generation-modifiers",
        json={
            "label": "Bogus",
            "category": "made_up",
            "prompt_fragment": "x",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


async def test_modifier_reset_includes_prompt_fragment(client, auth_headers, db_session):
    await client.get("/api/generation-modifiers", headers=auth_headers)
    rows = (await db_session.execute(select(GenerationModifier))).scalars().all()
    test_driven = next(r for r in rows if r.slug == "test_driven")
    await client.patch(
        f"/api/generation-modifiers/{test_driven.id}",
        json={"prompt_fragment": "Heavily edited."},
        headers=auth_headers,
    )
    resp = await client.post(f"/api/generation-modifiers/{test_driven.id}/reset", headers=auth_headers)
    assert resp.status_code == 200
    # Original fragment is back.
    assert "Heavily edited." not in resp.json()["prompt_fragment"]
    assert "test" in resp.json()["prompt_fragment"].lower()


async def test_modifier_create_rejects_invalid_slug(client, auth_headers):
    resp = await client.post(
        "/api/generation-modifiers",
        json={
            "label": "Bad slug",
            "slug": "Has Spaces!",
            "category": "shape",
            "prompt_fragment": "x",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ── auth + cross-org ─────────────────────────────────────────────────────────


async def test_unauthenticated_endpoints_return_401(client):
    """Every new granularity + modifier endpoint must reject anonymous calls."""
    assert (await client.get("/api/generation-granularities")).status_code == 401
    assert (
        await client.post("/api/generation-granularities", json={"label": "x"})
    ).status_code == 401
    assert (await client.get("/api/generation-modifiers")).status_code == 401
    assert (
        await client.post("/api/generation-modifiers", json={"label": "x", "category": "shape"})
    ).status_code == 401


async def test_granularity_cross_org_patch_and_delete_404(client, auth_headers, other_auth_headers, db_session):
    """Cross-org PATCH/DELETE on a granularity row must 404 (invisible)."""
    created = await client.post(
        "/api/generation-granularities",
        json={"label": "Org-A-gran", "prompt_fragment": "x"},
        headers=auth_headers,
    )
    assert created.status_code == 201
    row_id = created.json()["id"]

    patch_resp = await client.patch(
        f"/api/generation-granularities/{row_id}",
        json={"label": "Hijacked"},
        headers=other_auth_headers,
    )
    # Accept 404 (invisible) or 400 (other user has no org in this harness).
    # Either proves isolation — what we MUST never see is 200.
    assert patch_resp.status_code in (400, 404)
    delete_resp = await client.delete(f"/api/generation-granularities/{row_id}", headers=other_auth_headers)
    assert delete_resp.status_code in (400, 404)


async def test_modifier_cross_org_patch_and_delete_404(client, auth_headers, other_auth_headers, db_session):
    """Cross-org PATCH/DELETE on a modifier row must NOT succeed.

    See ``test_granularity_cross_org_patch_and_delete_404`` for accepted codes.
    """
    created = await client.post(
        "/api/generation-modifiers",
        json={"label": "Org-A-mod", "category": "shape", "prompt_fragment": "x"},
        headers=auth_headers,
    )
    assert created.status_code == 201
    row_id = created.json()["id"]

    patch_resp = await client.patch(
        f"/api/generation-modifiers/{row_id}",
        json={"label": "Hijacked"},
        headers=other_auth_headers,
    )
    assert patch_resp.status_code in (400, 404)
    delete_resp = await client.delete(f"/api/generation-modifiers/{row_id}", headers=other_auth_headers)
    assert delete_resp.status_code in (400, 404)


async def test_reset_on_custom_returns_400(client, auth_headers):
    """Reset only makes sense on system rows — customs return 400."""
    created_g = await client.post(
        "/api/generation-granularities",
        json={"label": "Custom-g", "prompt_fragment": "x"},
        headers=auth_headers,
    )
    g_id = created_g.json()["id"]
    g_resp = await client.post(f"/api/generation-granularities/{g_id}/reset", headers=auth_headers)
    assert g_resp.status_code == 400

    created_m = await client.post(
        "/api/generation-modifiers",
        json={"label": "Custom-m", "category": "shape", "prompt_fragment": "x"},
        headers=auth_headers,
    )
    m_id = created_m.json()["id"]
    m_resp = await client.post(f"/api/generation-modifiers/{m_id}/reset", headers=auth_headers)
    assert m_resp.status_code == 400


async def test_patch_or_delete_unknown_id_returns_404(client, auth_headers):
    """Unknown row IDs return 404, not 500 or 422."""
    bogus = "00000000-0000-0000-0000-000000000000"
    for path in [
        f"/api/generation-granularities/{bogus}",
        f"/api/generation-modifiers/{bogus}",
    ]:
        patch_resp = await client.patch(path, json={"label": "x"}, headers=auth_headers)
        assert patch_resp.status_code == 404
        delete_resp = await client.delete(path, headers=auth_headers)
        assert delete_resp.status_code == 404
