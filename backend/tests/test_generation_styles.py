"""Unit tests for ticket-generation style fragments and the wave-prompt
composition that splices them in.

For each style we assert that:
- The fragment contains its signature phrasing (the bits the LLM is meant to act on).
- The composed wave prompt contains the fragment string verbatim.

The `balanced` style is a no-op (empty fragment) so we just check the wave
prompt still renders without the placeholder leaking through.

`follow_practices` is two-mode: with no profile, the placeholder fragment is
used; with a profile dict, the renderer emits per-field guidance lines that
reflect the profile content.
"""

from __future__ import annotations

import pytest

from src.app.services.generation_styles import (
    DEFAULT_GRANULARITY,
    DEFAULT_STYLE,
    GRANULARITY_SLUGS,
    MODIFIER_SLUGS,
    STYLE_FRAGMENTS,
    STYLE_SLUGS,
    compose_style_block,
    get_style_fragment,
    render_follow_practices_fragment,
)
from src.app.services.task_generator_waves import _build_wave_prompt

# ── style fragments themselves ──────────────────────────────────────────────


def test_default_style_is_balanced():
    assert DEFAULT_STYLE == "balanced"


def test_style_slugs_complete_and_unique():
    # 3 granularity (minimal/balanced/many_small) + 16 modifiers (5 shape + 4
    # quality + 3 risk + 4 methodology).
    assert len(STYLE_SLUGS) == 19
    assert len(set(STYLE_SLUGS)) == 19


def test_balanced_fragment_is_empty():
    """Balanced is the current behaviour — its fragment must be empty so legacy
    generations are byte-for-byte unchanged from before the picker landed."""
    assert get_style_fragment("balanced") == ""


@pytest.mark.parametrize(
    "slug, must_contain",
    [
        # ── granularity ──
        ("minimal", "3–6"),
        ("many_small", "≤1 day"),
        # ── shape modifiers ──
        ("vertical_slices", "END-TO-END"),
        ("story_driven", "As a <role>"),
        ("spike_first", "spike"),
        ("wave_optimised", "WAVE 0"),
        # ── quality modifiers ──
        ("test_driven", "test"),
        ("docs_bundled", "docs updated"),
        ("observability_first", "logging"),
        ("release_ready", "rollback"),
        # ── risk / compliance modifiers ──
        ("risk_mitigated", "Risks & Unknowns"),
        ("compliance_aware", "audit logging"),
        ("accessibility", "a11y"),
        # ── methodology modifiers ──
        ("mvp_first", "v0"),
        ("gherkin_ac", "Given"),
        ("api_contract_first", "OpenAPI"),
        ("demo_waves", "DEMOABLE"),
    ],
)
def test_each_style_fragment_carries_its_signature(slug, must_contain):
    fragment = get_style_fragment(slug)
    assert fragment, f"{slug} fragment must be non-empty"
    assert must_contain in fragment, (
        f"{slug} fragment missing signature {must_contain!r}: {fragment!r}"
    )


def test_unknown_style_falls_back_to_empty():
    """Unknown slugs should never raise — they're caught at the request layer.
    Defending in depth keeps the wave loop alive if a stray slug somehow lands
    on a job row (e.g. via a stale frontend during a deploy)."""
    assert get_style_fragment("not_a_style") == ""


# ── follow_practices renderer ───────────────────────────────────────────────


def test_follow_practices_without_profile_uses_placeholder():
    fragment = get_style_fragment("follow_practices", repo_profile=None)
    assert "balanced default" in fragment
    assert "STYLE GUIDANCE" in fragment


def test_follow_practices_renders_profile_summary():
    profile = {
        "summary_sentence": "Short tickets, semantic-commit titles.",
        "title_format": "semantic_commit",
        "typical_title_length_chars": 42,
        "common_labels": ["frontend", "backend", "bug"],
        "commit_prefix_convention": "feat: / fix: / chore:",
        "acceptance_criteria_style": "checklist",
        "size_distribution": {"small": 0.7, "medium": 0.2, "large": 0.1},
    }
    fragment = render_follow_practices_fragment(profile)
    assert "Short tickets, semantic-commit titles." in fragment
    assert "semantic_commit" in fragment
    assert "42-character" in fragment
    assert "feat: / fix: / chore:" in fragment
    assert "frontend" in fragment
    assert "checklist" in fragment
    # Dominant size bucket = small → small guidance line should appear.
    assert "small tickets" in fragment


def test_follow_practices_degrades_gracefully_with_missing_keys():
    """Missing optional keys must not crash — only the summary is required."""
    fragment = render_follow_practices_fragment({"summary_sentence": "Minimal data."})
    assert "Minimal data." in fragment


# ── wave-prompt splicing ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_wave_zero_prompt_includes_granularity_fragment():
    prompt = await _build_wave_prompt(
        blueprint_text="A simple project.",
        prev_tasks=[],
        wave_idx=0,
        templates_block="(none)",
        feedback_context=None,
        granularity="minimal",
    )
    assert "STYLE GUIDANCE — minimal" in prompt
    assert "Wave 0 only" in prompt or "FOUNDATIONAL" in prompt


@pytest.mark.asyncio
async def test_wave_n_prompt_includes_modifier_fragment():
    prev = [
        {"title": "Setup repo", "wave": 0, "depends_on_indices": []},
        {"title": "Auth model", "wave": 0, "depends_on_indices": []},
    ]
    prompt = await _build_wave_prompt(
        blueprint_text="A simple project.",
        prev_tasks=prev,
        wave_idx=1,
        templates_block="(none)",
        feedback_context=None,
        granularity="balanced",
        modifiers=["wave_optimised"],
    )
    assert "STYLE GUIDANCE — wave-optimised" in prompt
    assert "Setup repo" in prompt  # prior tasks block rendered


@pytest.mark.asyncio
async def test_wave_prompt_balanced_no_modifiers_is_no_op():
    """Balanced + no modifiers means no `STYLE GUIDANCE` at all — the prompt
    must be byte-identical to the pre-picker behaviour."""
    prompt = await _build_wave_prompt(
        blueprint_text="A simple project.",
        prev_tasks=[],
        wave_idx=0,
        templates_block="(none)",
        feedback_context=None,
        granularity="balanced",
        modifiers=[],
    )
    assert "STYLE GUIDANCE" not in prompt


@pytest.mark.asyncio
async def test_follow_practices_modifier_renders_profile_into_block():
    """follow_practices in the modifier list with a profile must surface the
    summary sentence in the composed wave prompt so the model actually sees
    it. Granularity stacks on top."""
    profile = {
        "summary_sentence": "Team uses semantic commits and small tickets.",
        "title_format": "semantic_commit",
    }
    prompt = await _build_wave_prompt(
        blueprint_text="A simple project.",
        prev_tasks=[],
        wave_idx=0,
        templates_block="(none)",
        feedback_context=None,
        granularity="many_small",
        modifiers=["follow_practices"],
        repo_profile=profile,
    )
    assert "Team uses semantic commits and small tickets." in prompt
    assert "semantic_commit" in prompt
    assert "many small tickets" in prompt  # granularity fragment still present


# ── compose_style_block ─────────────────────────────────────────────────────


def test_compose_stacks_granularity_with_multiple_modifiers():
    """User's example: 'spikes with many stories' → many_small + spike_first
    + story_driven — all three fragments must be present in the block."""
    block = compose_style_block(
        granularity="many_small",
        modifiers=["spike_first", "story_driven"],
    )
    assert "many small tickets" in block
    assert "spike-first" in block.lower()
    assert "user stories" in block.lower()


def test_compose_skips_unknown_modifiers_silently():
    """An unknown modifier from a stale frontend must not crash the worker.
    Known parts still render."""
    block = compose_style_block(
        granularity="balanced",
        modifiers=["spike_first", "nonsense_modifier"],
    )
    assert "spike-first" in block.lower()


def test_compose_balanced_no_modifiers_is_empty():
    assert compose_style_block(granularity="balanced", modifiers=[]) == ""


def test_compose_stacks_many_modifiers_across_categories():
    """The full menu must compose cleanly — pick one modifier from each
    category and confirm every signature phrase is present in the block.
    Also exercises the heavy-stack code path (6+ modifiers)."""
    block = compose_style_block(
        granularity="many_small",
        modifiers=[
            "spike_first",          # shape
            "test_driven",          # quality
            "observability_first",  # quality
            "risk_mitigated",       # risk
            "mvp_first",            # methodology
            "demo_waves",           # methodology
        ],
    )
    # Granularity holds.
    assert "many small tickets" in block
    # Every chosen modifier's signature must appear.
    assert "spike" in block.lower()
    assert "test" in block.lower()
    assert "logging" in block.lower()
    assert "Risks & Unknowns" in block
    assert "v0" in block
    assert "DEMOABLE" in block.upper()


def test_compose_modifier_count_matches_modifier_slugs():
    """Every slug in MODIFIER_SLUGS must produce a non-empty fragment when
    composed individually — guards against a slug being added to the enum
    but forgotten in STYLE_FRAGMENTS."""
    for slug in MODIFIER_SLUGS:
        # follow_practices needs a profile; pass a stub so it renders something.
        repo_profile = {"summary_sentence": "stub"} if slug == "follow_practices" else None
        block = compose_style_block(
            granularity="balanced",
            modifiers=[slug],
            repo_profile=repo_profile,
        )
        assert block, f"slug {slug!r} produced empty fragment in compose_style_block"


def test_default_granularity_is_balanced():
    assert DEFAULT_GRANULARITY == "balanced"


def test_axes_partition_style_slugs():
    """GRANULARITY + MODIFIER slugs must exactly partition the legacy STYLE_SLUGS
    set — anything else would create silent drift between the two APIs."""
    assert set(GRANULARITY_SLUGS) | set(MODIFIER_SLUGS) == set(STYLE_SLUGS)
    assert set(GRANULARITY_SLUGS) & set(MODIFIER_SLUGS) == set()


# ── STYLE_FRAGMENTS dict integrity ──────────────────────────────────────────


def test_every_slug_has_a_fragment_entry():
    """Every slug in STYLE_SLUGS must have an entry in STYLE_FRAGMENTS,
    otherwise get_style_fragment silently falls back to empty for it."""
    for slug in STYLE_SLUGS:
        assert slug in STYLE_FRAGMENTS, f"missing fragment for slug {slug!r}"
