"""Phase 1 tests for the archetype-driven wireframe-plan inference."""

import json
from datetime import UTC
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.app.schemas.wireframe_plan import (
    PlanPatchRequest,
    ScreenPatch,
    ScreenPlan,
    WireframePlan,
)
from src.app.services.screen_archetypes import ARCHETYPES, union_screens
from src.app.services.wireframe_plan_service import (
    _coerce_archetype_pairs,
    _coerce_screen,
    _fallback_archetype_plan,
    _strip_fences,
    get_plan,
    mark_screens_status,
    merge_pipeline_entries,
    patch_plan,
    screens_to_pipeline_entries,
    select_for_generation,
)


class AsyncContextManagerMock:
    """Tiny helper so `async with factory():` returns a stubbed bg_db."""

    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, exc_type, exc, tb):
        return False


# ── pure-function unit tests ──────────────────────────────────────────────


def test_strip_fences_handles_plain_json():
    assert _strip_fences('{"a":1}') == '{"a":1}'


def test_strip_fences_handles_code_fences():
    assert _strip_fences('```json\n{"a":1}\n```') == '{"a":1}'


def test_strip_fences_handles_unterminated_fence():
    assert _strip_fences('```\n{"a":1}') == '{"a":1}'


def test_coerce_archetype_pairs_tuple_form():
    out = _coerce_archetype_pairs([["marketplace", 0.9], ["b2b-saas", 0.3]])
    assert out == [("marketplace", 0.9), ("b2b-saas", 0.3)]


def test_coerce_archetype_pairs_dict_form():
    out = _coerce_archetype_pairs(
        [{"name": "marketplace", "confidence": 0.7}, {"archetype": "b2b-admin", "score": "0.4"}]
    )
    assert out == [("marketplace", 0.7), ("b2b-admin", 0.4)]


def test_coerce_archetype_pairs_drops_unknown():
    out = _coerce_archetype_pairs([["mystery-archetype", 0.9], ["marketplace", 0.5]])
    assert out == [("marketplace", 0.5)]


def test_coerce_screen_minimal():
    # Use a name without "detail"/"profile" so the drill-in coercion
    # (which converts those to drawers) doesn't fire — this test is
    # about the minimal happy path, not drill-in behaviour.
    s = _coerce_screen(
        {"id": "Episode Library", "name": "Episode Library", "intent": "x"},
        archetype_source="consumer-content",
    )
    assert s is not None
    assert s.id == "episode_library"
    assert s.name == "Episode Library"
    assert s.kind == "screen"
    assert s.tier == "secondary"
    assert s.domain_source is True
    assert s.archetype_source == "consumer-content"


def test_coerce_screen_normalizes_kind_and_tier():
    s = _coerce_screen(
        {"id": "compose", "name": "Compose", "intent": "x", "kind": "modal", "tier": "hero"},
        archetype_source=None,
    )
    assert s is not None
    assert s.kind == "modal"
    assert s.tier == "hero"


def test_coerce_screen_falls_back_on_garbage():
    s = _coerce_screen(
        {"id": "x", "name": "X", "intent": "y", "kind": "weird", "tier": "ultra"},
        archetype_source=None,
    )
    assert s is not None
    assert s.kind == "screen"
    assert s.tier == "secondary"


def test_union_screens_dedupes_login_across_archetypes():
    out = union_screens(["consumer-content", "consumer-social"])
    ids = [s["id"] for s in out]
    assert ids.count("login") == 1


def test_fallback_archetype_plan_seeds_from_archetype_when_llm_empty():
    """Safety net: when the LLM returns no parseable screens, fall back
    to the archetype's base set so the plan card isn't empty."""
    plan = _fallback_archetype_plan([("marketplace", 0.9)])
    ids = {s.id for s in plan}
    assert "checkout" in ids
    assert "browse" in ids
    assert "listing" in ids


def test_fallback_archetype_plan_filters_by_confidence():
    plan = _fallback_archetype_plan([("marketplace", 0.9), ("b2b-admin", 0.1)])
    sources = {s.archetype_source for s in plan}
    assert "marketplace" in sources
    assert all(s.id != "audit_log" for s in plan)


def test_fallback_archetype_plan_uses_top_when_all_below_floor():
    plan = _fallback_archetype_plan([("marketplace", 0.2), ("b2b-saas", 0.1)])
    assert any(s.archetype_source == "marketplace" for s in plan)


def test_archetype_table_completeness():
    """Every archetype must have at least one hero-tier screen."""
    for aid, screens in ARCHETYPES.items():
        hero = [s for s in screens if s["tier"] == "hero"]
        assert hero, f"{aid} has no hero screens"


def test_new_archetypes_present():
    """Five new archetypes added based on cross-platform app-gen research."""
    for aid in ("ai-assistant", "directory", "tracker", "sales-crm", "browser-game"):
        assert aid in ARCHETYPES, f"{aid} missing from ARCHETYPES"


def test_ai_assistant_has_chat_surface():
    """Chat is the hero screen for the AI archetype — not a landing page."""
    chat = next((s for s in ARCHETYPES["ai-assistant"] if s["id"] == "chat"), None)
    assert chat is not None
    assert chat["tier"] == "hero"


def test_browser_game_has_play_and_result():
    """The play canvas and result modal are both hero — a game without
    either has no core loop."""
    ids_by_tier = {s["id"]: s["tier"] for s in ARCHETYPES["browser-game"]}
    assert ids_by_tier.get("play") == "hero"
    assert ids_by_tier.get("result") == "hero"


def test_tracker_modal_log_entry():
    """Log Entry is a modal — tracker apps capture quickly, not on a full page."""
    entry = next((s for s in ARCHETYPES["tracker"] if s["id"] == "entry"), None)
    assert entry is not None
    assert entry["kind"] == "modal"


def test_sales_crm_pipeline_is_hero():
    """The pipeline (Kanban) is the primary CRM surface."""
    pipeline = next((s for s in ARCHETYPES["sales-crm"] if s["id"] == "pipeline"), None)
    assert pipeline is not None
    assert pipeline["tier"] == "hero"


def test_fallback_archetype_plan_ai_assistant():
    """Falling back from a "build me a chat AI" brief seeds chat + conversations."""
    plan = _fallback_archetype_plan([("ai-assistant", 0.9)])
    ids = {s.id for s in plan}
    assert "chat" in ids
    assert "conversations" in ids


def test_archetype_screen_ids_are_unique_within_archetype():
    for aid, screens in ARCHETYPES.items():
        ids = [s["id"] for s in screens]
        assert len(ids) == len(set(ids)), f"{aid} has duplicate screen ids"


# ── patch_plan unit tests ─────────────────────────────────────────────────


def _make_plan(*screens: ScreenPlan) -> WireframePlan:
    from datetime import datetime

    now = datetime.now(UTC)
    return WireframePlan(
        archetypes=[("marketplace", 0.9)],
        screens=list(screens),
        inferred_at=now,
        last_edited_at=now,
    )


def _screen(sid: str, **kw) -> ScreenPlan:
    defaults = dict(
        id=sid,
        name=sid.replace("_", " ").title(),
        intent="...",
        kind="screen",
        tier="secondary",
        archetype_source="marketplace",
        domain_source=False,
        status="pending",
    )
    defaults.update(kw)
    return ScreenPlan(**defaults)


def test_patch_plan_renames_existing():
    plan = _make_plan(_screen("checkout"))
    out = patch_plan(plan, PlanPatchRequest(screens=[ScreenPatch(id="checkout", name="Pay Now")]))
    assert out.screens[0].name == "Pay Now"


def test_patch_plan_marks_removed_keeps_entry():
    plan = _make_plan(_screen("billing"))
    out = patch_plan(plan, PlanPatchRequest(screens=[ScreenPatch(id="billing", status="removed")]))
    assert len(out.screens) == 1
    assert out.screens[0].status == "removed"


def test_patch_plan_appends_new_when_unknown_id_with_name():
    plan = _make_plan(_screen("checkout"))
    out = patch_plan(
        plan,
        PlanPatchRequest(screens=[ScreenPatch(id="help_center", name="Help Center", intent="FAQ + contact")]),
    )
    ids = {s.id for s in out.screens}
    assert ids == {"checkout", "help_center"}
    new_screen = next(s for s in out.screens if s.id == "help_center")
    assert new_screen.domain_source is True


def test_patch_plan_skips_unknown_id_without_name():
    plan = _make_plan(_screen("checkout"))
    out = patch_plan(plan, PlanPatchRequest(screens=[ScreenPatch(id="ghost_screen", tier="hero")]))
    assert len(out.screens) == 1


def test_patch_plan_advances_last_edited_at():
    plan = _make_plan(_screen("checkout"))
    out = patch_plan(plan, PlanPatchRequest(screens=[ScreenPatch(id="checkout", name="Pay")]))
    assert out.last_edited_at >= plan.last_edited_at


# ── get_plan helper ───────────────────────────────────────────────────────


def test_get_plan_returns_none_for_missing_state():
    assert get_plan(None) is None
    assert get_plan({}) is None
    assert get_plan({"wireframe": {}}) is None


def test_get_plan_returns_parsed_plan_when_present():
    raw = json.loads(_make_plan(_screen("checkout")).model_dump_json())
    state = {"wireframe": {"plan": raw}}
    plan = get_plan(state)
    assert plan is not None
    assert plan.screens[0].id == "checkout"


# ── endpoint integration tests ────────────────────────────────────────────


@pytest.fixture
def fake_llm_response():
    """Mocks the new contextualised inference output: the LLM ships the
    FULL screen list itself (no archetype union step). Includes a
    domain-renamed equivalent of the marketplace listing pattern, plus
    a few generic surfaces an LLM would keep."""
    return json.dumps(
        {
            "archetypes": [["marketplace", 0.9]],
            "screens": [
                {
                    "id": "browse",
                    "name": "Browse Cameras",
                    "intent": "Faceted catalogue of vintage cameras",
                    "kind": "screen",
                    "tier": "hero",
                },
                {
                    "id": "camera_detail",
                    "name": "Camera Detail",
                    "intent": "Vintage camera spec sheet + photos",
                    "kind": "screen",
                    "tier": "hero",
                },
                {
                    "id": "checkout",
                    "name": "Checkout",
                    "intent": "Pay for a camera",
                    "kind": "screen",
                    "tier": "hero",
                },
                {
                    "id": "settings",
                    "name": "Settings",
                    "intent": "Account, payouts, addresses",
                    "kind": "screen",
                    "tier": "secondary",
                },
            ],
        }
    )


async def _make_session(client, auth_headers):
    proj = await client.post("/api/projects", json={"name": "P1"}, headers=auth_headers)
    project_id = proj.json()["id"]
    resp = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "vintage cameras"},
        headers=auth_headers,
    )
    return resp.json()["id"]


async def test_infer_plan_endpoint_persists_and_returns(client, auth_headers, fake_llm_response):
    session_id = await _make_session(client, auth_headers)
    fake_client = AsyncMock()
    fake_client.model = "deepseek-chat"
    fake_client.chat_with_full_usage = AsyncMock(return_value=(fake_llm_response, 100, 50))
    with patch(
        "src.app.services.wireframe_plan_service.get_ai_client_for_role",
        new=AsyncMock(return_value=fake_client),
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/wireframe/infer",
            json={"brief": "a marketplace for vintage cameras", "device": "desktop"},
            headers=auth_headers,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    plan = body["plan"]
    assert plan["archetypes"][0][0] == "marketplace"
    ids = {s["id"] for s in plan["screens"]}
    assert "checkout" in ids
    assert "camera_detail" in ids
    # GET reflects persisted state
    get_resp = await client.get(f"/api/sessions/{session_id}/wireframe/plan", headers=auth_headers)
    assert get_resp.status_code == 200


async def test_infer_plan_falls_back_when_llm_returns_garbage(client, auth_headers):
    session_id = await _make_session(client, auth_headers)
    fake_client = AsyncMock()
    fake_client.model = "deepseek-chat"
    fake_client.chat_with_full_usage = AsyncMock(return_value=("not even json", 10, 5))
    with patch(
        "src.app.services.wireframe_plan_service.get_ai_client_for_role",
        new=AsyncMock(return_value=fake_client),
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/wireframe/infer",
            json={"brief": "an app", "device": "desktop"},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    plan = resp.json()["plan"]
    assert plan["archetypes"][0][0] == "b2b-saas"
    assert len(plan["screens"]) > 0


async def test_get_plan_404_when_not_inferred(client, auth_headers):
    session_id = await _make_session(client, auth_headers)
    resp = await client.get(f"/api/sessions/{session_id}/wireframe/plan", headers=auth_headers)
    assert resp.status_code == 404


async def test_patch_plan_409_when_no_plan_yet(client, auth_headers):
    session_id = await _make_session(client, auth_headers)
    resp = await client.patch(
        f"/api/sessions/{session_id}/wireframe/plan",
        json={"screens": [{"id": "checkout", "status": "removed"}]},
        headers=auth_headers,
    )
    assert resp.status_code == 409


async def test_patch_plan_applies_remove_after_infer(client, auth_headers, fake_llm_response):
    session_id = await _make_session(client, auth_headers)
    fake_client = AsyncMock()
    fake_client.model = "deepseek-chat"
    fake_client.chat_with_full_usage = AsyncMock(return_value=(fake_llm_response, 100, 50))
    with patch(
        "src.app.services.wireframe_plan_service.get_ai_client_for_role",
        new=AsyncMock(return_value=fake_client),
    ):
        await client.post(
            f"/api/sessions/{session_id}/wireframe/infer",
            json={"brief": "marketplace", "device": "desktop"},
            headers=auth_headers,
        )
    patch_resp = await client.patch(
        f"/api/sessions/{session_id}/wireframe/plan",
        json={"screens": [{"id": "checkout", "status": "removed"}]},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    plan = patch_resp.json()["plan"]
    checkout = next(s for s in plan["screens"] if s["id"] == "checkout")
    assert checkout["status"] == "removed"


# ── Phase 3: select / mark / pipeline-entries unit tests ─────────────────


def test_select_for_generation_by_tier():
    plan = _make_plan(
        _screen("home", tier="hero"),
        _screen("settings", tier="optional"),
        _screen("checkout", tier="hero"),
    )
    out = select_for_generation(plan, tier="hero")
    assert {s.id for s in out} == {"home", "checkout"}


def test_select_for_generation_excludes_removed():
    plan = _make_plan(
        _screen("home", tier="hero", status="removed"),
        _screen("checkout", tier="hero"),
    )
    out = select_for_generation(plan, tier="hero")
    assert {s.id for s in out} == {"checkout"}


def test_select_for_generation_screen_ids_wins():
    plan = _make_plan(
        _screen("home", tier="hero"),
        _screen("settings", tier="optional"),
    )
    out = select_for_generation(plan, tier="hero", screen_ids=["settings"])
    assert {s.id for s in out} == {"settings"}


def test_select_for_generation_all_returns_active():
    plan = _make_plan(
        _screen("home", tier="hero"),
        _screen("settings", tier="optional", status="removed"),
        _screen("checkout", tier="hero"),
    )
    out = select_for_generation(plan, tier="all")
    assert {s.id for s in out} == {"home", "checkout"}


def test_mark_screens_status_updates_only_named():
    plan = _make_plan(
        _screen("home", tier="hero"),
        _screen("settings", tier="optional"),
    )
    out = mark_screens_status(plan, ["home"], "generated")
    by_id = {s.id: s for s in out.screens}
    assert by_id["home"].status == "generated"
    assert by_id["settings"].status == "pending"


def test_mark_screens_status_advances_last_edited_at():
    plan = _make_plan(_screen("home"))
    out = mark_screens_status(plan, ["home"], "approved")
    assert out.last_edited_at >= plan.last_edited_at


def test_mark_screens_status_no_change_returns_same_object():
    plan = _make_plan(_screen("home", status="approved"))
    out = mark_screens_status(plan, ["home"], "approved")
    assert out is plan


def test_screens_to_pipeline_entries_shape():
    plan = _make_plan(
        _screen("checkout", kind="screen"),
        _screen("compose", kind="modal"),
    )
    entries = screens_to_pipeline_entries(plan.screens)
    assert entries == [
        {
            "name": "Checkout",
            "kind": "screen",
            "id": "checkout",
            "nav_visible": True,
            "tier": "secondary",
            "intent": "...",
        },
        {
            "name": "Compose",
            "kind": "modal",
            "id": "compose",
            "nav_visible": True,
            "tier": "secondary",
            "intent": "...",
        },
    ]


def test_screens_to_pipeline_entries_omits_empty_intent():
    plan = _make_plan(_screen("checkout", intent=""))
    entries = screens_to_pipeline_entries(plan.screens)
    assert entries == [
        {"name": "Checkout", "kind": "screen", "id": "checkout", "nav_visible": True, "tier": "secondary"}
    ]


# ── Phase 4: merge_pipeline_entries unit tests ───────────────────────────


def test_merge_pipeline_entries_appends_new_screens():
    plan = _make_plan(_screen("home", tier="hero"))
    out, added = merge_pipeline_entries(
        plan,
        [{"name": "Help Center", "kind": "screen"}],
    )
    assert added == ["help_center"]
    ids = {s.id for s in out.screens}
    assert ids == {"home", "help_center"}
    new_screen = next(s for s in out.screens if s.id == "help_center")
    assert new_screen.domain_source is True
    assert new_screen.status == "approved"
    assert new_screen.tier == "secondary"


def test_merge_pipeline_entries_bumps_existing_to_approved():
    plan = _make_plan(_screen("home", tier="hero", status="pending"))
    out, added = merge_pipeline_entries(
        plan,
        [{"name": "Home", "kind": "screen"}],
    )
    assert added == []
    home = next(s for s in out.screens if s.id == "home")
    assert home.status == "approved"


def test_merge_pipeline_entries_preserves_generated_status():
    """A previously-generated screen mentioned again shouldn't regress to approved."""
    plan = _make_plan(_screen("home", status="generated"))
    out, added = merge_pipeline_entries(
        plan,
        [{"name": "Home", "kind": "screen"}],
    )
    assert added == []
    home = next(s for s in out.screens if s.id == "home")
    assert home.status == "generated"


def test_merge_pipeline_entries_handles_modal_kind():
    plan = _make_plan(_screen("home"))
    out, _ = merge_pipeline_entries(
        plan,
        [{"name": "Settings Drawer", "kind": "drawer", "trigger_from": "Home · gear"}],
    )
    drawer = next(s for s in out.screens if s.id == "settings_drawer")
    assert drawer.kind == "drawer"
    assert drawer.intent == "Home · gear"


def test_merge_pipeline_entries_no_op_returns_same_plan():
    plan = _make_plan(_screen("home", status="approved"))
    out, added = merge_pipeline_entries(plan, [{"name": "Home", "kind": "screen"}])
    assert out is plan
    assert added == []


def test_merge_pipeline_entries_skips_garbage():
    plan = _make_plan(_screen("home"))
    out, added = merge_pipeline_entries(
        plan,
        ["not a dict", {}, {"name": ""}, {"name": "Valid", "kind": "screen"}],
    )
    assert added == ["valid"]
    assert {s.id for s in out.screens} == {"home", "valid"}


def test_merge_pipeline_entries_normalises_unknown_kind():
    plan = _make_plan(_screen("home"))
    out, _ = merge_pipeline_entries(
        plan,
        [{"name": "Sidebar Thing", "kind": "weird-kind"}],
    )
    new_screen = next(s for s in out.screens if s.id == "sidebar_thing")
    assert new_screen.kind == "screen"


# ── Phase 3 endpoint integration ──────────────────────────────────────────


async def test_generate_404_when_no_plan(client, auth_headers):
    session_id = await _make_session(client, auth_headers)
    resp = await client.post(
        f"/api/sessions/{session_id}/wireframe/generate",
        json={"tier": "hero"},
        headers=auth_headers,
    )
    assert resp.status_code == 409


async def test_generate_400_when_tier_empty(client, auth_headers, fake_llm_response):
    """A tier that ends up with zero non-removed screens returns 400."""
    session_id = await _make_session(client, auth_headers)
    fake_client = AsyncMock()
    fake_client.model = "deepseek-chat"
    fake_client.chat_with_full_usage = AsyncMock(return_value=(fake_llm_response, 100, 50))
    with patch(
        "src.app.services.wireframe_plan_service.get_ai_client_for_role",
        new=AsyncMock(return_value=fake_client),
    ):
        await client.post(
            f"/api/sessions/{session_id}/wireframe/infer",
            json={"brief": "marketplace", "device": "desktop"},
            headers=auth_headers,
        )
    # Remove every hero screen
    plan_resp = await client.get(f"/api/sessions/{session_id}/wireframe/plan", headers=auth_headers)
    hero_ids = [s["id"] for s in plan_resp.json()["plan"]["screens"] if s["tier"] == "hero"]
    await client.patch(
        f"/api/sessions/{session_id}/wireframe/plan",
        json={"screens": [{"id": sid, "status": "removed"} for sid in hero_ids]},
        headers=auth_headers,
    )
    resp = await client.post(
        f"/api/sessions/{session_id}/wireframe/generate",
        json={"tier": "hero"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_generate_marks_approved_and_returns_started(client, auth_headers, fake_llm_response):
    session_id = await _make_session(client, auth_headers)
    fake_client = AsyncMock()
    fake_client.model = "deepseek-chat"
    fake_client.chat_with_full_usage = AsyncMock(return_value=(fake_llm_response, 100, 50))
    with patch(
        "src.app.services.wireframe_plan_service.get_ai_client_for_role",
        new=AsyncMock(return_value=fake_client),
    ):
        await client.post(
            f"/api/sessions/{session_id}/wireframe/infer",
            json={"brief": "marketplace", "device": "desktop"},
            headers=auth_headers,
        )
    # Stub the pipeline + the BG task's session factory so the
    # background task is a no-op in tests. `scalar_one_or_none()`
    # returns None → `_kick_off` early-exits before touching anything.
    bg_db = AsyncMock()
    null_result = MagicMock()
    null_result.scalar_one_or_none = MagicMock(return_value=None)
    bg_db.execute = AsyncMock(return_value=null_result)
    factory = lambda: AsyncContextManagerMock(bg_db)  # noqa: E731
    with (
        patch(
            "src.app.routers.sessions._extract_diagram_inline",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "src.app.routers.sessions.get_session_factory",
            return_value=factory,
        ),
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/wireframe/generate",
            json={"tier": "hero"},
            headers=auth_headers,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["started"] is True
    assert len(body["screens"]) > 0
    plan = body["plan"]
    hero_screens = [s for s in plan["screens"] if s["tier"] == "hero"]
    assert all(s["status"] in ("approved", "generated") for s in hero_screens)


async def test_generate_screen_ids_overrides_tier(client, auth_headers, fake_llm_response):
    session_id = await _make_session(client, auth_headers)
    fake_client = AsyncMock()
    fake_client.model = "deepseek-chat"
    fake_client.chat_with_full_usage = AsyncMock(return_value=(fake_llm_response, 100, 50))
    with patch(
        "src.app.services.wireframe_plan_service.get_ai_client_for_role",
        new=AsyncMock(return_value=fake_client),
    ):
        await client.post(
            f"/api/sessions/{session_id}/wireframe/infer",
            json={"brief": "marketplace", "device": "desktop"},
            headers=auth_headers,
        )
    bg_db = AsyncMock()
    null_result = MagicMock()
    null_result.scalar_one_or_none = MagicMock(return_value=None)
    bg_db.execute = AsyncMock(return_value=null_result)
    factory = lambda: AsyncContextManagerMock(bg_db)  # noqa: E731
    with (
        patch(
            "src.app.routers.sessions._extract_diagram_inline",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "src.app.routers.sessions.get_session_factory",
            return_value=factory,
        ),
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/wireframe/generate",
            json={"tier": "hero", "screen_ids": ["settings"]},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert {s["id"] for s in body["screens"]} == {"settings"}


async def test_infer_plan_403_for_non_participant(client, auth_headers, fake_llm_response):
    """Another user's session is forbidden."""
    session_id = await _make_session(client, auth_headers)
    # Create a second user via the magic-link signup flow used by other tests.
    other = await client.post("/api/auth/dev-signin", json={"email": "stranger@example.com"})
    if other.status_code != 200:
        pytest.skip("dev-signin not available — env mismatch")
    stranger_token = other.json().get("access_token")
    if not stranger_token:
        pytest.skip("dev-signin payload shape changed")
    stranger_headers = {"Authorization": f"Bearer {stranger_token}"}
    resp = await client.post(
        f"/api/sessions/{session_id}/wireframe/infer",
        json={"brief": "x", "device": "desktop"},
        headers=stranger_headers,
    )
    assert resp.status_code in (403, 404)
