"""Tests for ticket-template CRUD + version bump on prompt edits."""

import pytest


@pytest.mark.anyio
async def test_list_seeds_system_templates(client, auth_headers):
    """First call to GET seeds the 5 system templates for the org."""
    resp = await client.get("/api/ticket-templates", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    slugs = sorted(t["slug"] for t in body)
    assert slugs == sorted(["feature", "bug", "chore", "spike", "tech_debt"])
    for t in body:
        assert t["is_system"] is True
        assert t["version"] == 1
        # Every seeded template ships with a populated unified field layout.
        layout = t["field_layout"]
        assert isinstance(layout, list) and len(layout) >= 12
        keys = {entry["key"] for entry in layout}
        assert {"title", "description", "priority", "status", "labels"} <= keys


@pytest.mark.anyio
async def test_field_layout_patch_bumps_version(client, auth_headers):
    listed = (await client.get("/api/ticket-templates", headers=auth_headers)).json()
    feature = next(t for t in listed if t["slug"] == "feature")
    assert feature["version"] == 1

    # Reorder: move story_points above priority.
    layout = feature["field_layout"]
    sp_idx = next(i for i, e in enumerate(layout) if e["key"] == "story_points")
    pr_idx = next(i for i, e in enumerate(layout) if e["key"] == "priority")
    reordered = list(layout)
    reordered[sp_idx], reordered[pr_idx] = reordered[pr_idx], reordered[sp_idx]

    resp = await client.patch(
        f"/api/ticket-templates/{feature['id']}",
        json={"field_layout": reordered},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["version"] == 2

    # Re-PATCHing the same layout should NOT bump again.
    resp_again = await client.patch(
        f"/api/ticket-templates/{feature['id']}",
        json={"field_layout": reordered},
        headers=auth_headers,
    )
    assert resp_again.json()["version"] == 2


@pytest.mark.anyio
async def test_field_layout_rejects_builtin_type_mutation(client, auth_headers):
    listed = (await client.get("/api/ticket-templates", headers=auth_headers)).json()
    feature = next(t for t in listed if t["slug"] == "feature")
    bad_layout = [dict(e) for e in feature["field_layout"]]
    # Try to make the priority field a number — should be rejected.
    for entry in bad_layout:
        if entry["key"] == "priority":
            entry["type"] = "number"
    resp = await client.patch(
        f"/api/ticket-templates/{feature['id']}",
        json={"field_layout": bad_layout},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_field_layout_rejects_duplicate_keys(client, auth_headers):
    listed = (await client.get("/api/ticket-templates", headers=auth_headers)).json()
    feature = next(t for t in listed if t["slug"] == "feature")
    bad = list(feature["field_layout"]) + [
        {
            "key": "priority",  # duplicate
            "label": "Priority again",
            "type": "priority",
            "source": "builtin",
            "placement": "sidebar",
            "visible": True,
            "required": False,
        }
    ]
    resp = await client.patch(
        f"/api/ticket-templates/{feature['id']}",
        json={"field_layout": bad},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_field_layout_accepts_custom_field(client, auth_headers):
    listed = (await client.get("/api/ticket-templates", headers=auth_headers)).json()
    feature = next(t for t in listed if t["slug"] == "feature")
    extended = list(feature["field_layout"]) + [
        {
            "key": "custom:target_release",
            "label": "Target release",
            "type": "text",
            "source": "custom",
            "placement": "sidebar",
            "visible": True,
            "required": False,
        }
    ]
    resp = await client.patch(
        f"/api/ticket-templates/{feature['id']}",
        json={"field_layout": extended},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    keys = {e["key"] for e in resp.json()["field_layout"]}
    assert "custom:target_release" in keys


@pytest.mark.anyio
async def test_list_is_idempotent(client, auth_headers):
    """Calling list twice returns the same row count (no double-seed)."""
    a = await client.get("/api/ticket-templates", headers=auth_headers)
    b = await client.get("/api/ticket-templates", headers=auth_headers)
    assert len(a.json()) == len(b.json()) == 5


@pytest.mark.anyio
async def test_create_custom_template(client, auth_headers):
    resp = await client.post(
        "/api/ticket-templates",
        json={
            "name": "Performance",
            "description": "Latency / throughput improvements",
            "icon": "zap",
            "default_priority": "medium",
            "prompt_fragment": "Use 'performance' for latency or throughput tasks.",
            "field_schema": [
                {"key": "current_p95_ms", "label": "Current p95 (ms)", "type": "number", "required": True},
            ],
            "acceptance_criteria_template": ["p95 latency reduced by 20%"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "performance"
    assert body["is_system"] is False
    assert body["version"] == 1
    assert body["field_schema"][0]["key"] == "current_p95_ms"


@pytest.mark.anyio
async def test_patch_prompt_fragment_bumps_version(client, auth_headers):
    created = (
        await client.post(
            "/api/ticket-templates",
            json={"name": "Spike Variant", "prompt_fragment": "v1"},
            headers=auth_headers,
        )
    ).json()
    assert created["version"] == 1

    patched = (
        await client.patch(
            f"/api/ticket-templates/{created['id']}",
            json={"prompt_fragment": "v2 with new guidance"},
            headers=auth_headers,
        )
    ).json()
    assert patched["version"] == 2

    # Patching a non-version-bumping field doesn't increment.
    again = (
        await client.patch(
            f"/api/ticket-templates/{created['id']}",
            json={"icon": "rocket"},
            headers=auth_headers,
        )
    ).json()
    assert again["version"] == 2


@pytest.mark.anyio
async def test_cannot_delete_system_template(client, auth_headers):
    listed = (await client.get("/api/ticket-templates", headers=auth_headers)).json()
    feature = next(t for t in listed if t["slug"] == "feature")
    resp = await client.delete(
        f"/api/ticket-templates/{feature['id']}", headers=auth_headers
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_can_delete_custom_template(client, auth_headers):
    created = (
        await client.post(
            "/api/ticket-templates",
            json={"name": "DeleteMe"},
            headers=auth_headers,
        )
    ).json()
    resp = await client.delete(f"/api/ticket-templates/{created['id']}", headers=auth_headers)
    assert resp.status_code == 204
    listed = (await client.get("/api/ticket-templates", headers=auth_headers)).json()
    assert all(t["id"] != created["id"] for t in listed)


@pytest.mark.anyio
async def test_unauthenticated(client):
    resp = await client.get("/api/ticket-templates")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_create_duplicate_slug_rejected(client, auth_headers):
    await client.get("/api/ticket-templates", headers=auth_headers)  # seed
    resp = await client.post(
        "/api/ticket-templates", json={"name": "feature"}, headers=auth_headers
    )
    assert resp.status_code == 400
