"""Tests for the design library router + bundle loader."""

from __future__ import annotations

import pytest

from src.app.services import design_library_service as dls


class _FakeAI:
    """Minimal stand-in for AIClient.chat — returns a scripted string."""

    def __init__(self, response: str):
        self._response = response

    async def chat(self, *, system=None, messages=None, max_tokens=1024):
        return self._response


# --- Taxonomy sanity -------------------------------------------------------


def test_recipe_names_cover_alphabet():
    assert set(dls.RECIPE_NAMES.keys()) == set(dls.RECIPE_LETTERS)


def test_personality_avoid_keys_are_valid_pools():
    for personality, pool_map in dls.PERSONALITY_AVOID.items():
        assert personality in dls.PERSONALITIES, personality
        for pool_name, picks in pool_map.items():
            assert pool_name in dls.POOLS, f"{personality} → unknown pool {pool_name}"
            for pick in picks:
                assert pick in dls.POOLS[pool_name], f"{personality}.{pool_name} → unknown pick {pick}"


def test_every_recipe_file_exists():
    for letter in dls.RECIPE_LETTERS:
        path = dls._recipe_path(letter)
        assert path.exists(), f"missing recipe file for {letter}"


# --- Recipe parsing --------------------------------------------------------


def test_parse_files_to_read_strips_subsection_pointers():
    text = """## Quick ref

- **When:** landing.
- **Token budget:** ~20k.
- **Files to read:** `07-page-archetypes.md` > SaaS Landing Page, `04-components.md`, `09-ergonomics.md`
- **Personality fit:** Professional.
"""
    assert dls._parse_files_to_read(text) == [
        "07-page-archetypes.md",
        "04-components.md",
        "09-ergonomics.md",
    ]


def test_parse_files_to_read_returns_empty_when_missing():
    assert dls._parse_files_to_read("no such line here") == []


def test_every_recipe_declares_files_to_read():
    for letter in dls.RECIPE_LETTERS:
        path = dls._recipe_path(letter)
        files = dls._parse_files_to_read(path.read_text(encoding="utf-8"))
        assert files, f"recipe {letter} has no Files-to-read line"


# --- Variation picker ------------------------------------------------------


def test_pick_variation_deterministic_with_seed():
    a = dls.pick_variation("professional", seed=42)
    b = dls.pick_variation("professional", seed=42)
    assert a.to_dict() == b.to_dict()


def test_pick_variation_respects_personality_avoid():
    for _ in range(50):
        v = dls.pick_variation("luxury")
        assert v.motion != "snap-transitions"
        assert v.color != "high-contrast-poster"
        assert v.density != "dashboard-hero"


def test_pick_variation_respects_forbid_list():
    forbid = [
        {"layout": "asymmetric-split", "color": "newsprint"},
        {"layout": "overlap-stack", "color": "two-colour-constraint"},
        {"layout": "horizontal-rail", "color": "newsprint"},
    ]
    for seed in range(10):
        v = dls.pick_variation("editorial", seed=seed, forbid_list=forbid)
        assert v.layout not in {"asymmetric-split", "overlap-stack", "horizontal-rail"}


def test_pick_variation_returns_valid_picks():
    v = dls.pick_variation("bold-adventurous", seed=7)
    for pool_name, pick in v.to_dict().items():
        assert pick in dls.POOLS[pool_name]


# --- Classification --------------------------------------------------------


@pytest.mark.asyncio
async def test_classify_brief_parses_llm_json():
    ai = _FakeAI(
        """{"recipe_letter":"b","personality":"professional","density":"mid",
        "energy":"low","era":"neutral","subvert":false,"admin":false,
        "rationale":"SaaS landing page for dev tool"}"""
    )
    c = await dls.classify_brief("build me a SaaS landing page for a dev tool", ai)
    assert c.recipe_letter == "b"
    assert c.personality == "professional"
    assert c.density == "mid"
    assert c.energy == "low"
    # "neutral" isn't a valid level → normalised to mid
    assert c.era == "mid"
    assert c.subvert is False


@pytest.mark.asyncio
async def test_classify_brief_strips_code_fences():
    ai = _FakeAI(
        """```json
{"recipe_letter":"g","personality":"technical","density":"high","energy":"mid",
 "era":"mid","subvert":false,"admin":true,"rationale":"dashboard"}
```"""
    )
    c = await dls.classify_brief("admin dashboard for ops", ai)
    assert c.recipe_letter == "g"
    assert c.admin is True


@pytest.mark.asyncio
async def test_classify_brief_rejects_invalid_letter():
    ai = _FakeAI(
        '{"recipe_letter":"9","personality":"professional","density":"mid",'
        '"energy":"mid","era":"mid","subvert":false,"admin":false,"rationale":""}'
    )
    with pytest.raises(ValueError):
        await dls.classify_brief("brief", ai)


def test_fallback_classify_finds_keywords():
    c = dls.fallback_classify("internal CRUD admin tool for inventory")
    assert c.recipe_letter == "g"  # matches "admin panel" family
    assert c.admin is True


def test_fallback_classify_defaults_to_saas():
    c = dls.fallback_classify("a product page")
    assert c.recipe_letter == "b"


# --- Bundle loading --------------------------------------------------------


def test_load_bundle_loads_recipe_and_declared_files():
    c = dls.Classification(
        recipe_letter="b",
        personality="professional",
        density="mid",
        energy="low",
        era="mid",
        rationale="test",
    )
    bundle = dls.load_bundle(c, seed=1)

    # Always-loaded
    assert "HARNESS.md" in bundle.files_loaded
    assert "anti-similarity.md" in bundle.files_loaded
    # Recipe
    assert "recipes/b-saas.md" in bundle.files_loaded
    # At least one declared Files-to-read entry
    assert "04-components.md" in bundle.files_loaded


def test_load_bundle_loads_utility_interfaces_when_admin():
    c = dls.Classification(
        recipe_letter="g",
        personality="technical",
        density="high",
        energy="mid",
        era="mid",
        rationale="",
        admin=True,
    )
    bundle = dls.load_bundle(c, seed=1)
    assert "utility-interfaces.md" in bundle.files_loaded
    assert "08-dashboards.md" in bundle.files_loaded


def test_load_bundle_loads_subvert_for_editorial():
    c = dls.Classification(
        recipe_letter="f",
        personality="editorial",
        density="mid",
        energy="mid",
        era="mid",
        rationale="",
    )
    bundle = dls.load_bundle(c, seed=1)
    assert "when-to-subvert.md" in bundle.files_loaded


def test_load_bundle_skips_subvert_for_saas():
    c = dls.Classification(
        recipe_letter="b",
        personality="professional",
        density="mid",
        energy="mid",
        era="mid",
        rationale="",
    )
    bundle = dls.load_bundle(c, seed=1)
    assert "when-to-subvert.md" not in bundle.files_loaded


def test_load_bundle_loads_webgl_when_energy_high_and_recipe_supports():
    # Recipe K (hardware) lists WebGL enhancement in its file.
    c = dls.Classification(
        recipe_letter="k",
        personality="bold-adventurous",
        density="mid",
        energy="high",
        era="mid",
        rationale="",
    )
    bundle = dls.load_bundle(c, seed=1)
    # Only assert if the recipe actually declares WebGL content
    if dls._webgl_recipe_applies("k"):
        assert "webgl-core.md" in bundle.files_loaded


def test_load_bundle_skips_webgl_when_energy_low():
    c = dls.Classification(
        recipe_letter="k",
        personality="professional",
        density="mid",
        energy="low",
        era="mid",
        rationale="",
    )
    bundle = dls.load_bundle(c, seed=1)
    assert "webgl-core.md" not in bundle.files_loaded


def test_compose_prompt_block_includes_routing_and_constraints():
    c = dls.Classification(
        recipe_letter="b",
        personality="professional",
        density="mid",
        energy="low",
        era="mid",
        rationale="SaaS landing",
    )
    v = dls.pick_variation("professional", seed=1)
    block = dls.compose_prompt_block(c, v, [])
    assert "Recipe: B" in block
    assert "professional" in block
    assert "VARIATION CONSTRAINTS" in block
    assert "FORBID LIST" in block
    assert "DESIGN MEMO JSON" in block


def test_token_estimate_is_nonzero():
    c = dls.Classification(
        recipe_letter="b",
        personality="professional",
        density="mid",
        energy="low",
        era="mid",
        rationale="",
    )
    bundle = dls.load_bundle(c, seed=1)
    assert bundle.token_estimate > 1000  # loaded several kb of content


# --- End-to-end ------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_design_bundle_falls_back_on_llm_error():
    class _BrokenAI:
        async def chat(self, *, system=None, messages=None, max_tokens=1024):
            raise RuntimeError("provider down")

    bundle = await dls.build_design_bundle("a fintech dashboard", _BrokenAI(), seed=3)
    # Fallback classifier should have routed to fintech OR dashboard
    assert bundle.classification.recipe_letter in {"g", "u"}
    assert "HARNESS.md" in bundle.files_loaded


# --- Multi-character recipe codes (aa, ab, ac) ----------------------------


def test_recipe_letters_includes_multichar_codes():
    assert "aa" in dls.RECIPE_LETTERS
    assert "ab" in dls.RECIPE_LETTERS
    assert "ac" in dls.RECIPE_LETTERS


@pytest.mark.asyncio
async def test_classify_brief_accepts_multichar_code():
    ai = _FakeAI(
        '{"recipe_letter":"aa","personality":"technical","density":"mid",'
        '"energy":"low","era":"mid","subvert":false,"admin":false,'
        '"rationale":"AI chat product"}'
    )
    c = await dls.classify_brief("build me a Claude clone", ai)
    assert c.recipe_letter == "aa"
    assert c.recipe_name == "AI Product / Assistant"


def test_fallback_classify_routes_ai_brief_to_aa():
    c = dls.fallback_classify("an AI chat assistant for support teams")
    assert c.recipe_letter == "aa"


def test_fallback_classify_routes_habit_brief_to_ab():
    c = dls.fallback_classify("a habit tracker that logs my mood each day")
    assert c.recipe_letter == "ab"


def test_fallback_classify_routes_game_brief_to_ac():
    c = dls.fallback_classify("a wordle-style browser game")
    assert c.recipe_letter == "ac"


def test_load_bundle_loads_aa_recipe():
    c = dls.Classification(
        recipe_letter="aa",
        personality="technical",
        density="mid",
        energy="low",
        era="mid",
        rationale="",
    )
    bundle = dls.load_bundle(c, seed=1)
    assert "recipes/aa-ai-product.md" in bundle.files_loaded


def test_load_bundle_loads_ab_recipe():
    c = dls.Classification(
        recipe_letter="ab",
        personality="warm-human",
        density="low",
        energy="low",
        era="mid",
        rationale="",
    )
    bundle = dls.load_bundle(c, seed=1)
    assert "recipes/ab-wellness-tracker.md" in bundle.files_loaded


def test_load_bundle_loads_ac_recipe():
    c = dls.Classification(
        recipe_letter="ac",
        personality="playful",
        density="mid",
        energy="high",
        era="mid",
        rationale="",
    )
    bundle = dls.load_bundle(c, seed=1)
    assert "recipes/ac-game-interactive.md" in bundle.files_loaded


def test_compose_prompt_block_handles_multichar_code():
    c = dls.Classification(
        recipe_letter="aa",
        personality="technical",
        density="mid",
        energy="low",
        era="mid",
        rationale="AI chat",
    )
    v = dls.pick_variation("technical", seed=1)
    block = dls.compose_prompt_block(c, v, [])
    # Uppercase form should preserve both characters of the code.
    assert "Recipe: AA" in block
    assert "AI Product / Assistant" in block
