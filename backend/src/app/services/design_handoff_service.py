"""Design code hand-off bundle builder.

Takes the output of `generate-design-system` (tokens + memo + routing +
variation picks) and produces a multi-format hand-off bundle that the
orchestrator or a human developer can drop into a scaffolded repo.

Shape:
- `DESIGN.md`            — human + agent readable; replaces the generic
                           template with one that encodes the memo, the
                           anti-patterns, the DO/DON'T list, and recipe
                           guidance.
- `design-tokens.json`   — machine-parseable tokens (approximates the
                           W3C Design Tokens community spec for colors /
                           typography / dimensions).
- `design-tokens.css`    — `:root { --color-primary: ... }` custom
                           properties ready to import.
- `tailwind.design.js`   — Tailwind preset with `theme.extend` for
                           Tailwind projects.

The builder is pure — it takes dicts in, returns a `HandoffBundle` out.
No I/O, no persistence. Callers decide whether to serve via endpoint,
write into a scaffold, or attach to an orchestrator prompt.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field

logger = logging.getLogger(__name__)

# File paths the bundle writes to (relative to repo root, conventionally
# under `docs/` or the project root). Kept here so callers don't drift.
HANDOFF_PATHS = {
    "design_md": "docs/DESIGN.md",
    "tokens_json": "docs/design-tokens.json",
    "tokens_css": "app/design-tokens.css",
    "tailwind_preset": "tailwind.design.js",
}


@dataclass
class HandoffBundle:
    """Multi-format hand-off bundle for a generated design system."""

    design_md: str
    tokens_json: dict  # machine-readable tokens tree
    tokens_css: str
    tailwind_preset: str
    meta: dict = field(default_factory=dict)

    def to_files(self) -> dict[str, str]:
        """Return a {path: content} map suitable for writing to disk.

        `tokens_json` is serialised with 2-space indent.
        """
        return {
            HANDOFF_PATHS["design_md"]: self.design_md,
            HANDOFF_PATHS["tokens_json"]: json.dumps(self.tokens_json, indent=2),
            HANDOFF_PATHS["tokens_css"]: self.tokens_css,
            HANDOFF_PATHS["tailwind_preset"]: self.tailwind_preset,
        }

    def to_dict(self) -> dict:
        return asdict(self)


# --- Input shape (documented, not enforced) --------------------------------
#
# design_system (from generate-design-system):
#   {
#     "colors": {"primary": {"hex": "#...", "name": "...", "usage": "..."}, ...},
#     "typography": {"headingFont": "...", "bodyFont": "...", "scale": [...], ...},
#     "spacing": {"unit": 4, "scale": [...], "note": "..."},
#     "borderRadius": {"sm": "...", "md": "...", "lg": "...", "full": "..."},
#     "shadows": {"sm": "...", "md": "...", "lg": "..."},
#     "style": "one-sentence direction"
#   }
#
# design_memo:
#   {
#     "recipe": "B — SaaS / Product",
#     "personality": "...",
#     "modifiers": {"density": "...", "energy": "...", "era": "..."},
#     "variation_picks": {...},
#     "why_this_fits": "...",
#     "anti_patterns_avoided": [...],
#     "subversions": [...]
#   }
#
# routing: see design_library_service.Classification (serialised)
# variation: see design_library_service.VariationPicks.to_dict()


# --- DESIGN.md builder -----------------------------------------------------


def _safe(val, default: str = "") -> str:
    """Coerce missing/None to a safe fallback string."""
    if val is None:
        return default
    s = str(val).strip()
    return s or default


def _format_color_table(colors: dict) -> str:
    if not colors:
        return "_No colors defined._"
    rows = ["| Token | Hex | Usage |", "|-------|-----|-------|"]
    for key, val in colors.items():
        if not isinstance(val, dict):
            continue
        hex_code = _safe(val.get("hex"), "—")
        usage = _safe(val.get("usage"), "—")
        rows.append(f"| `{key}` | `{hex_code}` | {usage} |")
    return "\n".join(rows)


def _format_list(items: list, bullet: str = "-") -> str:
    if not items:
        return f"{bullet} _(none)_"
    return "\n".join(f"{bullet} {item}" for item in items)


def _format_variation_picks(picks: dict) -> str:
    if not picks:
        return "_No variation picks recorded._"
    rows = ["| Pool | Pick |", "|------|------|"]
    for pool, pick in picks.items():
        rows.append(f"| {pool} | `{pick}` |")
    return "\n".join(rows)


def build_design_md(
    *,
    project_name: str,
    design_system: dict,
    design_memo: dict,
    routing: dict,
    variation: dict | None = None,
) -> str:
    """Build the DESIGN.md contents for a scaffolded repo."""
    variation = variation or (design_memo.get("variation_picks") or {})
    colors = design_system.get("colors") or {}
    typography = design_system.get("typography") or {}
    spacing = design_system.get("spacing") or {}
    radius = design_system.get("borderRadius") or {}
    shadows = design_system.get("shadows") or {}

    recipe = _safe(design_memo.get("recipe") or routing.get("recipe_name"), "—")
    personality = _safe(design_memo.get("personality") or routing.get("personality"), "—")
    modifiers = design_memo.get("modifiers") or {
        "density": routing.get("density"),
        "energy": routing.get("energy"),
        "era": routing.get("era"),
    }
    why = _safe(design_memo.get("why_this_fits") or routing.get("rationale"), "—")
    anti = design_memo.get("anti_patterns_avoided") or []
    subs = design_memo.get("subversions") or []

    font_scale = typography.get("scale") or []
    font_scale_str = ", ".join(str(x) for x in font_scale) if font_scale else "—"

    spacing_scale = spacing.get("scale") or []
    spacing_scale_str = ", ".join(str(x) for x in spacing_scale) if spacing_scale else "—"

    d = _safe(modifiers.get("density"))
    e = _safe(modifiers.get("energy"))
    r = _safe(modifiers.get("era"))

    sections = [
        f"# Design — {project_name}",
        "",
        "> Generated by the design library router. This file is the agent's",
        "> source of truth when implementing screens. Read it before every UI task.",
        "",
        "## Recipe",
        "",
        f"- **Recipe:** {recipe}",
        f"- **Personality:** {personality}",
        f"- **Modifiers:** density={d}, energy={e}, era={r}",
        f"- **Why this fits:** {why}",
        "",
        "## Variation constraints (MUST honour)",
        "",
        _format_variation_picks(variation),
        "",
        "These picks are the fingerprint of this output. Do not quietly drop",
        "them during implementation — they're the difference between this",
        "output and the last one.",
        "",
        "## Anti-patterns (MUST avoid)",
        "",
        _format_list(anti),
        "",
        "## Subversions (deliberate rule-breaks)",
        "",
        _format_list(subs),
        "",
        "## Colors",
        "",
        _format_color_table(colors),
        "",
        "## Typography",
        "",
        f"- **Heading font:** `{_safe(typography.get('headingFont'))}`",
        f"- **Body font:** `{_safe(typography.get('bodyFont'))}`",
        f"- **Scale:** {font_scale_str}",
        f"- **Line height:** {_safe(typography.get('lineHeight'), '1.5')}",
        f"- **Style note:** {_safe(typography.get('style'))}",
        "",
        "## Spacing",
        "",
        f"- **Unit:** {_safe(spacing.get('unit'), '4')}px",
        f"- **Scale:** {spacing_scale_str}",
        f"- **Note:** {_safe(spacing.get('note'))}",
        "",
        "## Border radius",
        "",
        f"- `sm` = `{_safe(radius.get('sm'))}`",
        f"- `md` = `{_safe(radius.get('md'))}`",
        f"- `lg` = `{_safe(radius.get('lg'))}`",
        f"- `full` = `{_safe(radius.get('full'), '9999px')}`",
        "",
        "## Shadows",
        "",
        f"- `sm` = `{_safe(shadows.get('sm'))}`",
        f"- `md` = `{_safe(shadows.get('md'))}`",
        f"- `lg` = `{_safe(shadows.get('lg'))}`",
        "",
        "## Token files in this repo",
        "",
        "- `docs/design-tokens.json` — machine-readable token tree",
        "- `app/design-tokens.css` — CSS custom properties (`:root`) — import once",
        "- `tailwind.design.js` — Tailwind preset (extend `theme`)",
        "",
        "Prefer referencing tokens via CSS variables or Tailwind classes over",
        "hard-coding hex / px values in components.",
        "",
    ]
    return "\n".join(sections)


# --- design-tokens.json builder --------------------------------------------


def build_tokens_json(design_system: dict) -> dict:
    """Produce a token tree approximating the W3C Design Tokens spec.

    Not a full implementation — just the subset the generator emits.
    """
    colors = design_system.get("colors") or {}
    typography = design_system.get("typography") or {}
    spacing = design_system.get("spacing") or {}
    radius = design_system.get("borderRadius") or {}
    shadows = design_system.get("shadows") or {}

    tree: dict = {"$schema": "https://design-tokens.github.io/community-group/format/"}

    if colors:
        tree["color"] = {
            key: {"$type": "color", "$value": _safe(val.get("hex"))}
            for key, val in colors.items()
            if isinstance(val, dict) and val.get("hex")
        }

    if typography:
        font = {}
        if typography.get("headingFont"):
            font["heading"] = {"$type": "fontFamily", "$value": typography["headingFont"]}
        if typography.get("bodyFont"):
            font["body"] = {"$type": "fontFamily", "$value": typography["bodyFont"]}
        scale = typography.get("scale") or []
        if scale:
            font["scale"] = {f"step-{i + 1}": {"$type": "dimension", "$value": step} for i, step in enumerate(scale)}
        if typography.get("lineHeight"):
            font["lineHeight"] = {"$type": "number", "$value": typography["lineHeight"]}
        if font:
            tree["font"] = font

    if spacing:
        sp: dict = {}
        if spacing.get("unit") is not None:
            sp["unit"] = {"$type": "dimension", "$value": f"{spacing['unit']}px"}
        for i, step in enumerate(spacing.get("scale") or []):
            sp[f"step-{i + 1}"] = {"$type": "dimension", "$value": f"{step}px"}
        if sp:
            tree["spacing"] = sp

    if radius:
        tree["radius"] = {key: {"$type": "dimension", "$value": val} for key, val in radius.items() if val}

    if shadows:
        tree["shadow"] = {key: {"$type": "shadow", "$value": val} for key, val in shadows.items() if val}

    return tree


# --- CSS custom properties -------------------------------------------------


def _safe_css_ident(name: str) -> str:
    """Sanitise a name into a CSS custom property identifier.

    `cardBackground` → `card-background`, strips anything non-alnum/dash.
    """
    out: list[str] = []
    for i, ch in enumerate(name):
        prev = name[i - 1] if i > 0 else ""
        if ch.isupper() and prev.isalnum():
            out.append("-")
            out.append(ch.lower())
        elif ch.isalnum() or ch in "-_":
            out.append(ch.lower())
        else:
            out.append("-")
    # Collapse runs of dashes
    s = "".join(out)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


def build_tokens_css(design_system: dict) -> str:
    """Build a CSS `:root { ... }` block with design tokens as custom properties."""
    lines = [":root {"]
    colors = design_system.get("colors") or {}
    for key, val in colors.items():
        if isinstance(val, dict) and val.get("hex"):
            lines.append(f"  --color-{_safe_css_ident(key)}: {val['hex']};")

    typography = design_system.get("typography") or {}
    if typography.get("headingFont"):
        lines.append(f"  --font-heading: {typography['headingFont']};")
    if typography.get("bodyFont"):
        lines.append(f"  --font-body: {typography['bodyFont']};")
    for i, step in enumerate(typography.get("scale") or []):
        lines.append(f"  --font-size-{i + 1}: {step};")
    if typography.get("lineHeight") is not None:
        lines.append(f"  --line-height: {typography['lineHeight']};")

    spacing = design_system.get("spacing") or {}
    if spacing.get("unit") is not None:
        lines.append(f"  --space-unit: {spacing['unit']}px;")
    for i, step in enumerate(spacing.get("scale") or []):
        lines.append(f"  --space-{i + 1}: {step}px;")

    radius = design_system.get("borderRadius") or {}
    for key, val in radius.items():
        if val:
            lines.append(f"  --radius-{_safe_css_ident(key)}: {val};")

    shadows = design_system.get("shadows") or {}
    for key, val in shadows.items():
        if val:
            lines.append(f"  --shadow-{_safe_css_ident(key)}: {val};")

    lines.append("}")
    return "\n".join(lines) + "\n"


# --- Tailwind preset -------------------------------------------------------


def build_tailwind_preset(design_system: dict) -> str:
    """Build a Tailwind preset module extending `theme` with the tokens.

    Returns a JS-ready string. Consumer imports it in `tailwind.config.js`:
        module.exports = { presets: [require('./tailwind.design.js')], ... }
    """
    colors = design_system.get("colors") or {}
    color_map: dict[str, str] = {}
    for key, val in colors.items():
        if isinstance(val, dict) and val.get("hex"):
            color_map[key] = val["hex"]

    typography = design_system.get("typography") or {}
    font_family: dict[str, list[str]] = {}
    if typography.get("headingFont"):
        font_family["heading"] = [typography["headingFont"], "sans-serif"]
    if typography.get("bodyFont"):
        font_family["body"] = [typography["bodyFont"], "sans-serif"]

    font_size: dict[str, str] = {}
    for i, step in enumerate(typography.get("scale") or []):
        font_size[f"step-{i + 1}"] = str(step)

    spacing = design_system.get("spacing") or {}
    spacing_map: dict[str, str] = {}
    for i, step in enumerate(spacing.get("scale") or []):
        spacing_map[f"step-{i + 1}"] = f"{step}px"

    radius = design_system.get("borderRadius") or {}
    radius_map = {k: v for k, v in radius.items() if v}

    shadows = design_system.get("shadows") or {}
    shadow_map = {k: v for k, v in shadows.items() if v}

    extend = {
        "colors": color_map,
        "fontFamily": font_family,
        "fontSize": font_size,
        "spacing": spacing_map,
        "borderRadius": radius_map,
        "boxShadow": shadow_map,
    }
    # Drop empty keys for a cleaner file
    extend = {k: v for k, v in extend.items() if v}

    # JSON → JS; Tailwind configs accept JSON verbatim.
    payload = json.dumps({"theme": {"extend": extend}}, indent=2)
    return f"/* Generated Tailwind preset — do not edit by hand. */\nmodule.exports = {payload};\n"


# --- End-to-end builder ----------------------------------------------------


def build_handoff(
    *,
    project_name: str,
    design_system: dict,
    design_memo: dict | None = None,
    routing: dict | None = None,
    variation: dict | None = None,
) -> HandoffBundle:
    """Produce the full hand-off bundle.

    `design_memo`, `routing`, `variation` are optional — missing values
    render as dashes in the markdown. This lets the builder work even when
    called with just a set of tokens (e.g. for back-filling a legacy scaffold).
    """
    design_memo = design_memo or {}
    routing = routing or {}

    design_md = build_design_md(
        project_name=project_name,
        design_system=design_system,
        design_memo=design_memo,
        routing=routing,
        variation=variation,
    )
    tokens_json = build_tokens_json(design_system)
    tokens_css = build_tokens_css(design_system)
    tailwind_preset = build_tailwind_preset(design_system)

    return HandoffBundle(
        design_md=design_md,
        tokens_json=tokens_json,
        tokens_css=tokens_css,
        tailwind_preset=tailwind_preset,
        meta={
            "project_name": project_name,
            "recipe": routing.get("recipe_letter") or design_memo.get("recipe"),
            "personality": routing.get("personality") or design_memo.get("personality"),
        },
    )
