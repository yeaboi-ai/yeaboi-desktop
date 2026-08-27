"""Tests for the org-level generation preset CRUD + seeding."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.app.models.generation_preset import GenerationPreset
from src.app.services.preset_service import SYSTEM_GENERATION_PRESETS, slugify


# ── service-level unit tests ────────────────────────────────────────────────


def test_slugify_handles_typical_inputs():
    assert slugify("Quick prototype") == "quick_prototype"
    assert slugify("  Stakeholder Demo  ") == "stakeholder_demo"
    assert slugify("Production-Grade!") == "production_grade"
    assert slugify("") == "preset"  # fallback so we never insert an empty slug


def test_system_preset_slugs_unique():
    slugs = [p["slug"] for p in SYSTEM_GENERATION_PRESETS]
    assert len(slugs) == len(set(slugs))


# ── seeding via service ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ensure_org_seeds_the_4_system_presets_idempotently(client, auth_headers, db_session):
    # First call: triggers seeding via the route.
    resp = await client.get("/api/generation-presets", headers=auth_headers)
    assert resp.status_code == 200
    presets = resp.json()
    assert len(presets) == 4
    slugs = {p["slug"] for p in presets}
    assert slugs == {p["slug"] for p in SYSTEM_GENERATION_PRESETS}
    assert all(p["is_system"] for p in presets)

    # Second call: idempotent — same count, no duplicates.
    resp2 = await client.get("/api/generation-presets", headers=auth_headers)
    assert resp2.status_code == 200
    assert len(resp2.json()) == 4


# ── route tests ─────────────────────────────────────────────────────────────


async def test_list_returns_presets_in_sort_order(client, auth_headers):
    """Seeded presets keep their original sort order (0, 1, 2, 3)."""
    resp = await client.get("/api/generation-presets", headers=auth_headers)
    assert resp.status_code == 200
    presets = resp.json()
    sort_orders = [p["sort_order"] for p in presets]
    assert sort_orders == sorted(sort_orders), "presets must come back in sort_order"


async def test_create_custom_preset_round_trips(client, auth_headers):
    resp = await client.post(
        "/api/generation-presets",
        json={
            "label": "Compliance sweep",
            "blurb": "Heavy compliance + a11y for regulated work.",
            "icon": "ShieldAlert",
            "granularity": "balanced",
            "modifiers": ["compliance_aware", "accessibility", "test_driven"],
            "sort_order": 5,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["slug"] == "compliance_sweep"
    assert created["is_system"] is False
    assert created["modifiers"] == ["compliance_aware", "accessibility", "test_driven"]

    # GET surfaces it next to the 4 system presets.
    listed = await client.get("/api/generation-presets", headers=auth_headers)
    assert len(listed.json()) == 5
    assert any(p["slug"] == "compliance_sweep" for p in listed.json())


async def test_create_rejects_invalid_modifier(client, auth_headers):
    resp = await client.post(
        "/api/generation-presets",
        json={
            "label": "Bogus",
            "granularity": "balanced",
            "modifiers": ["not_a_modifier"],
            "icon": "Layers",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


async def test_create_rejects_invalid_granularity(client, auth_headers):
    resp = await client.post(
        "/api/generation-presets",
        json={
            "label": "Bogus",
            "granularity": "huge",
            "modifiers": [],
            "icon": "Layers",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


async def test_create_rejects_unknown_icon(client, auth_headers):
    resp = await client.post(
        "/api/generation-presets",
        json={
            "label": "Bogus",
            "granularity": "balanced",
            "modifiers": [],
            "icon": "DefinitelyNotALucideIcon",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


async def test_create_rejects_duplicate_slug(client, auth_headers):
    # The first system preset already has slug "quick_prototype" via seeding.
    # Trying to create another with the same auto-generated slug must 400.
    # Triggers seeding first via the list endpoint.
    await client.get("/api/generation-presets", headers=auth_headers)
    resp = await client.post(
        "/api/generation-presets",
        json={
            "label": "Quick prototype",
            "granularity": "minimal",
            "modifiers": [],
            "icon": "Flag",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_patch_updates_mutable_fields(client, auth_headers, db_session):
    # Seed via list endpoint.
    await client.get("/api/generation-presets", headers=auth_headers)
    presets = (await db_session.execute(select(GenerationPreset))).scalars().all()
    standard = next(p for p in presets if p.slug == "standard_sprint")

    resp = await client.patch(
        f"/api/generation-presets/{standard.id}",
        json={
            "label": "Two-week iteration",
            "modifiers": ["test_driven"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["label"] == "Two-week iteration"
    assert updated["modifiers"] == ["test_driven"]
    # Slug is immutable even on system presets.
    assert updated["slug"] == "standard_sprint"
    assert updated["is_system"] is True


async def test_delete_blocks_system_preset(client, auth_headers, db_session):
    await client.get("/api/generation-presets", headers=auth_headers)
    presets = (await db_session.execute(select(GenerationPreset))).scalars().all()
    system = presets[0]
    resp = await client.delete(f"/api/generation-presets/{system.id}", headers=auth_headers)
    assert resp.status_code == 400
    assert "system" in resp.json()["detail"].lower()


async def test_delete_custom_preset_soft_deletes(client, auth_headers, db_session):
    created = await client.post(
        "/api/generation-presets",
        json={
            "label": "Throwaway",
            "granularity": "balanced",
            "modifiers": [],
            "icon": "Layers",
        },
        headers=auth_headers,
    )
    preset_id = created.json()["id"]

    resp = await client.delete(f"/api/generation-presets/{preset_id}", headers=auth_headers)
    assert resp.status_code == 204

    # GET no longer returns it.
    listed = await client.get("/api/generation-presets", headers=auth_headers)
    assert all(p["id"] != preset_id for p in listed.json())

    # Row still exists in DB but deleted_at is set.
    from sqlalchemy import select as _select

    row = (
        await db_session.execute(_select(GenerationPreset).where(GenerationPreset.id == preset_id))
    ).scalar_one_or_none()
    assert row is not None
    assert row.deleted_at is not None


async def test_reset_restores_system_preset_to_defaults(client, auth_headers, db_session):
    await client.get("/api/generation-presets", headers=auth_headers)
    presets = (await db_session.execute(select(GenerationPreset))).scalars().all()
    production = next(p for p in presets if p.slug == "production_grade")

    # Mangle the preset.
    await client.patch(
        f"/api/generation-presets/{production.id}",
        json={"label": "Garbage label", "modifiers": ["spike_first"]},
        headers=auth_headers,
    )

    # Reset.
    resp = await client.post(
        f"/api/generation-presets/{production.id}/reset",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    restored = resp.json()
    assert restored["label"] == "Production-grade"
    assert restored["granularity"] == "balanced"
    assert sorted(restored["modifiers"]) == sorted(
        ["test_driven", "docs_bundled", "observability_first", "release_ready"]
    )


async def test_reset_rejected_for_custom_preset(client, auth_headers):
    created = await client.post(
        "/api/generation-presets",
        json={
            "label": "Custom A",
            "granularity": "balanced",
            "modifiers": [],
            "icon": "Layers",
        },
        headers=auth_headers,
    )
    preset_id = created.json()["id"]
    resp = await client.post(
        f"/api/generation-presets/{preset_id}/reset",
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_orgs_are_isolated(client, auth_headers, other_auth_headers, db_session):
    """A preset created in one org must not leak into another's list."""
    created = await client.post(
        "/api/generation-presets",
        json={
            "label": "Org-A-only",
            "granularity": "balanced",
            "modifiers": [],
            "icon": "Layers",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201

    # The second auto-created user has no org membership in this test harness,
    # so their GET returns 400 "User not in any organization" — which itself
    # proves isolation (org-A's data is unreachable to them). If the harness
    # later auto-orgs second users, we still assert the org-A slug is absent.
    other_resp = await client.get("/api/generation-presets", headers=other_auth_headers)
    assert other_resp.status_code in (200, 400)
    if other_resp.status_code == 200:
        slugs = {p["slug"] for p in other_resp.json()}
        assert "org_a_only" not in slugs


async def test_unauthenticated_returns_401(client):
    """Every new router endpoint must reject requests with no auth header."""
    get_resp = await client.get("/api/generation-presets")
    assert get_resp.status_code == 401
    post_resp = await client.post("/api/generation-presets", json={"label": "x"})
    assert post_resp.status_code == 401


async def test_cannot_patch_or_delete_other_orgs_preset(client, auth_headers, other_auth_headers, db_session):
    """Cross-org PATCH/DELETE must NOT succeed for the other user.

    Acceptable failures: 404 (resource invisible) or 400 (other user has no
    org membership in this harness — denies at the get_current_org layer
    before the router runs). What we MUST never see is 200.
    """
    created = await client.post(
        "/api/generation-presets",
        json={"label": "Org-A-secret", "granularity": "balanced", "modifiers": [], "icon": "Layers"},
        headers=auth_headers,
    )
    assert created.status_code == 201
    preset_id = created.json()["id"]

    patch_resp = await client.patch(
        f"/api/generation-presets/{preset_id}",
        json={"label": "Hijacked"},
        headers=other_auth_headers,
    )
    assert patch_resp.status_code in (400, 404)
    delete_resp = await client.delete(f"/api/generation-presets/{preset_id}", headers=other_auth_headers)
    assert delete_resp.status_code in (400, 404)
