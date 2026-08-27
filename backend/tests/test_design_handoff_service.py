"""Tests for the design code hand-off bundle builder."""

from __future__ import annotations

import json

import pytest

from src.app.services import design_handoff_service as dhs


@pytest.fixture
def tokens() -> dict:
    """A representative design_system payload — close to what the
    generate-design-system endpoint returns."""
    return {
        "colors": {
            "primary": {"hex": "#22d3ee", "name": "Primary", "usage": "CTAs"},
            "text": {"hex": "#e5e7eb", "name": "Text", "usage": "Body text"},
            "cardBackground": {"hex": "#111316", "name": "Card", "usage": "Panels"},
        },
        "typography": {
            "headingFont": "Geist",
            "bodyFont": "Inter",
            "scale": ["12px", "14px", "16px", "20px", "32px"],
            "lineHeight": 1.5,
            "style": "Technical, monospace-accented",
        },
        "spacing": {"unit": 4, "scale": [4, 8, 12, 16, 24, 32], "note": "4px grid"},
        "borderRadius": {"sm": "2px", "md": "4px", "lg": "6px", "full": "9999px"},
        "shadows": {"sm": "0 1px 2px rgba(0,0,0,0.05)", "md": "0 4px 8px rgba(0,0,0,0.1)"},
        "style": "Dense, data-forward",
    }


@pytest.fixture
def memo() -> dict:
    return {
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
        "why_this_fits": "Observability tools need density + precision.",
        "anti_patterns_avoided": ["Bouncy animations", "Centered heroes"],
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
        "rationale": "Observability dashboard",
    }


# --- DESIGN.md -------------------------------------------------------------


def test_design_md_contains_recipe_and_variation(tokens, memo, routing):
    md = dhs.build_design_md(
        project_name="Observa",
        design_system=tokens,
        design_memo=memo,
        routing=routing,
        variation=memo["variation_picks"],
    )
    assert "# Design — Observa" in md
    assert "Dashboard / Data Product" in md
    assert "technical" in md
    assert "margin-note-column" in md
    assert "tabular-numerics" in md
    assert "Bouncy animations" in md
    assert "#22d3ee" in md
    assert "Geist" in md


def test_design_md_handles_empty_memo_gracefully(tokens):
    md = dhs.build_design_md(
        project_name="Nothing",
        design_system=tokens,
        design_memo={},
        routing={},
    )
    # Should still render with dashes where memo was missing
    assert "# Design — Nothing" in md
    assert "_(none)_" in md  # empty anti-patterns / subversions list


def test_design_md_uses_routing_when_memo_missing(tokens):
    md = dhs.build_design_md(
        project_name="Demo",
        design_system=tokens,
        design_memo={},
        routing={
            "recipe_name": "SaaS / Product",
            "personality": "playful",
            "density": "low",
            "energy": "high",
            "era": "mid",
            "rationale": "startup landing",
        },
    )
    assert "SaaS / Product" in md
    assert "playful" in md
    assert "startup landing" in md


# --- tokens.json -----------------------------------------------------------


def test_tokens_json_matches_w3c_shape(tokens):
    tree = dhs.build_tokens_json(tokens)
    assert tree["$schema"].startswith("https://design-tokens.github.io")
    assert tree["color"]["primary"] == {"$type": "color", "$value": "#22d3ee"}
    assert tree["font"]["heading"]["$value"] == "Geist"
    assert tree["font"]["scale"]["step-1"] == {"$type": "dimension", "$value": "12px"}
    assert tree["spacing"]["unit"]["$value"] == "4px"
    assert tree["spacing"]["step-1"]["$value"] == "4px"
    assert tree["radius"]["full"]["$value"] == "9999px"
    assert tree["shadow"]["sm"]["$value"].startswith("0 1px")


def test_tokens_json_skips_missing_sections():
    tree = dhs.build_tokens_json({"colors": {}})
    # Only the schema key — nothing else populated
    assert set(tree.keys()) == {"$schema"}


# --- tokens.css ------------------------------------------------------------


def test_tokens_css_emits_root_block_with_tokens(tokens):
    css = dhs.build_tokens_css(tokens)
    assert css.startswith(":root {")
    assert "--color-primary: #22d3ee;" in css
    assert "--color-card-background: #111316;" in css  # camelCase → kebab
    assert "--font-heading: Geist;" in css
    assert "--font-size-1: 12px;" in css
    assert "--space-unit: 4px;" in css
    assert "--radius-full: 9999px;" in css
    assert "--shadow-sm:" in css
    assert css.rstrip().endswith("}")


# --- Tailwind preset -------------------------------------------------------


def test_tailwind_preset_parses_as_json_payload(tokens):
    preset = dhs.build_tailwind_preset(tokens)
    assert preset.startswith("/* Generated")
    # The JS module exports a JSON-compatible object literal
    payload = preset[preset.find("{") : preset.rfind("}") + 1]
    parsed = json.loads(payload)
    extend = parsed["theme"]["extend"]
    assert extend["colors"]["primary"] == "#22d3ee"
    assert extend["fontFamily"]["heading"] == ["Geist", "sans-serif"]
    assert extend["spacing"]["step-1"] == "4px"
    assert extend["borderRadius"]["full"] == "9999px"
    assert "boxShadow" in extend


def test_tailwind_preset_drops_empty_sections():
    preset = dhs.build_tailwind_preset({"colors": {"primary": {"hex": "#000", "name": "P", "usage": ""}}})
    payload = preset[preset.find("{") : preset.rfind("}") + 1]
    parsed = json.loads(payload)
    extend = parsed["theme"]["extend"]
    assert set(extend.keys()) == {"colors"}


# --- End-to-end ------------------------------------------------------------


def test_build_handoff_returns_all_four_artifacts(tokens, memo, routing):
    bundle = dhs.build_handoff(
        project_name="Observa",
        design_system=tokens,
        design_memo=memo,
        routing=routing,
    )
    assert bundle.design_md.startswith("# Design — Observa")
    assert "primary" in bundle.tokens_json["color"]
    assert "--color-primary" in bundle.tokens_css
    assert "module.exports" in bundle.tailwind_preset
    assert bundle.meta["recipe"] == "g"
    assert bundle.meta["personality"] == "technical"


def test_handoff_to_files_maps_to_conventional_paths(tokens, memo, routing):
    bundle = dhs.build_handoff(project_name="Observa", design_system=tokens, design_memo=memo, routing=routing)
    files = bundle.to_files()
    assert set(files.keys()) == {
        "docs/DESIGN.md",
        "docs/design-tokens.json",
        "app/design-tokens.css",
        "tailwind.design.js",
    }
    # tokens_json serialises cleanly
    parsed = json.loads(files["docs/design-tokens.json"])
    assert "color" in parsed


def test_handoff_safe_css_ident():
    assert dhs._safe_css_ident("primary") == "primary"
    assert dhs._safe_css_ident("cardBackground") == "card-background"
    assert dhs._safe_css_ident("text_muted") == "text_muted"
    assert dhs._safe_css_ident("Bad Name!") == "bad-name"
