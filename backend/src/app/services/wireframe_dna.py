"""Design DNA extractor — pulls a structured aesthetic snapshot out of a
hero wireframe so subsequent screens in the same session inherit the
*user's* design, not a hand-curated archetype template.

Architecture:
    1. Plan inference picks 8-14 screens.
    2. The first hero-tier `kind=screen` is generated with full creative
       latitude — no shell constraint, no archetype reference, full token
       budget. The model writes whatever institutional-finance / editorial
       / consumer-app aesthetic the brief warrants.
    3. `extract_design_dna(hero_html)` runs ONCE — calls a fast model with
       the hero's HTML and returns a JSON snapshot:
         - palette: the `:root` block (full extended token vocabulary)
         - shell_html: the header / sidebar / topbar block, ready to embed
           verbatim in subsequent screens
         - components: working specimens (button-primary, status-pill set,
           table-row, card, kpi-card) lifted directly from the hero
         - vibe_summary: one paragraph the model can use as a tone anchor
    4. Sub-screens get the DNA injected as their reference instead of a
       hand-curated `_FINANCE_DASHBOARD_REFERENCE`. The aesthetic is the
       user's, propagated mechanically.

The DNA snapshot is persisted at
`session.diagram_state.wireframe.design_dna` so it survives restarts and
gets reused on additive turns (e.g. "also add a help center").
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from .ai_provider import get_ai_client_for_role

logger = logging.getLogger(__name__)


_DNA_SYSTEM = """You extract design DNA from a hero wireframe HTML so other
screens in the same app can inherit its aesthetic. You do NOT generate new
HTML — you LIFT existing markup verbatim into a structured snapshot.

Return ONLY a JSON object, no prose, no code fences."""


_DNA_PROMPT_TEMPLATE = """Hero wireframe HTML:
```
{hero_html}
```

Extract the design DNA as a JSON object with this exact shape:

{{
  "palette_css": "<the full <style> block(s) containing :root and any global
                  CSS custom properties + reset + base body styles. Lift
                  VERBATIM from the hero. Include any .dark variant.>",

  "shell_html": "<the app-shell HTML — the header / topbar / sidebar / nav
                 block(s) that should appear on every screen. Lift VERBATIM
                 from the hero, but REPLACE the active screen's content area
                 with the literal placeholder <main data-slot='content'></main>.
                 If the hero has no shell (e.g. it's a landing page or auth
                 screen), return empty string \\"\\".>",

  "shell_present": true_or_false,

  "components": {{
    "button_primary":   "<one specimen, lifted verbatim>",
    "button_secondary": "<one specimen, lifted verbatim>",
    "button_ghost":     "<one specimen, lifted verbatim or empty string>",
    "input":            "<one specimen, lifted verbatim>",
    "status_pill_set":  "<all distinct status pills the hero uses, lifted
                         verbatim, separated by newlines. Must include the
                         dot indicator and the mono-uppercase label style.>",
    "card":             "<one card / panel specimen, lifted verbatim>",
    "kpi_card":         "<one KPI card specimen if present, else empty string>",
    "table_row":        "<one full table row including its avatar/data viz
                         elements, lifted verbatim, or empty string if no
                         table>",
    "avatar":           "<one avatar specimen lifted verbatim, or empty>"
  }},

  "type_scale": {{
    "page_title":    "<font-size + weight + tracking from hero, plain text>",
    "section_title": "<...>",
    "body":          "<...>",
    "mono_value":    "<font-size + weight for tabular numerals>"
  }},

  "density": "compact" | "balanced" | "spacious",

  "vibe_summary": "<2-3 sentence description of the aesthetic — palette
                   description, font pairing, density, what it reminds you
                   of (Linear / Stripe / Bloomberg / Notion / Vercel / etc.)>",

  "accent_color": "<the single accent value from :root, e.g. '#d4a574'>",

  "is_dark_theme": true_or_false
}}

Rules:
- LIFT markup verbatim. Don't paraphrase, don't simplify, don't reformat.
  The whole point is to give the next screen exactly the same vocabulary.
- Preserve all classes, data-attributes, inline styles, SVG markup.
- If a component type isn't present in the hero, return empty string —
  don't fabricate one.
- The palette_css block is what the next screen will INHERIT verbatim.
  Include @media (prefers-color-scheme: dark) variants if the hero has them.

Return the JSON object only."""


_DEFAULT_DNA: dict[str, Any] = {
    "palette_css": "",
    "shell_html": "",
    "shell_present": False,
    "components": {
        "button_primary": "",
        "button_secondary": "",
        "button_ghost": "",
        "input": "",
        "status_pill_set": "",
        "card": "",
        "kpi_card": "",
        "table_row": "",
        "avatar": "",
    },
    "type_scale": {},
    "density": "balanced",
    "vibe_summary": "",
    "accent_color": "",
    "is_dark_theme": False,
}


def _strip_fences(raw: str) -> str:
    """Drop the model's stray ```json fences if it ignored the no-fence rule."""
    s = (raw or "").strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


async def extract_design_dna(
    hero_html: str,
    *,
    org_id: str | None,
    db: AsyncSession,
) -> dict[str, Any]:
    """Run a single AI pass over the hero HTML to lift its design DNA.

    Returns a dict matching `_DEFAULT_DNA`'s shape. Failures fall back
    to the default (empty) DNA so the caller can proceed with vanilla
    sub-screen generation rather than crashing the whole pipeline.
    """
    if not hero_html or len(hero_html) < 200:
        logger.info("[DNA] hero_html too short (%d chars), skipping extraction", len(hero_html or ""))
        return dict(_DEFAULT_DNA)

    # Truncate hero HTML to keep the extraction prompt reasonable.
    # 60KB is plenty for any screen the wireframe model can produce
    # within its 32k output cap; clipping further loses load-bearing
    # markup the next screen needs to inherit.
    capped = hero_html if len(hero_html) <= 60_000 else hero_html[:60_000]

    # `flow` role uses sonnet by default — fast enough for an extraction
    # pass that runs once per pipeline. The user's account also has
    # `plan` on opus; we prefer sonnet here to stay cheap, and the task
    # is structural (lift markup, no taste required).
    try:
        ai = await get_ai_client_for_role(org_id, db, "flow")
    except Exception:
        # Fall back to the wireframe role's client if `flow` isn't
        # configured for this org.
        ai = await get_ai_client_for_role(org_id, db, "wireframe")

    prompt = _DNA_PROMPT_TEMPLATE.format(hero_html=capped)
    try:
        raw, in_tok, out_tok = await ai.chat_with_full_usage(
            system=_DNA_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=8192,
            temperature=0.0,
        )
    except Exception as e:
        logger.warning("[DNA] extractor AI call failed: %s", e)
        return dict(_DEFAULT_DNA)

    logger.info("[DNA] extraction call: model=%s in_tok=%d out_tok=%d", ai.model, in_tok, out_tok)
    cleaned = _strip_fences(raw)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.warning("[DNA] could not parse JSON (%s); raw[0:300]=%r", e, cleaned[:300])
        return dict(_DEFAULT_DNA)

    # Coerce — some keys may be missing if the model decided a component
    # isn't in the hero. Merge over defaults so consumers can rely on
    # the full shape.
    dna = dict(_DEFAULT_DNA)
    for key in dna:
        if key in parsed and parsed[key] is not None:
            if key == "components" and isinstance(parsed[key], dict):
                merged_components = dict(dna["components"])
                merged_components.update(parsed[key])
                dna["components"] = merged_components
            else:
                dna[key] = parsed[key]

    return dna


def dna_block_for_subscreen(dna: dict[str, Any] | None) -> str:
    """Render the DNA snapshot as an in-context block for sub-screen prompts.

    Returns empty string if DNA is empty or missing — caller should fall
    back to the legacy archetype reference path in that case.
    """
    if not dna or not isinstance(dna, dict):
        return ""
    palette = (dna.get("palette_css") or "").strip()
    components = dna.get("components") or {}
    vibe = (dna.get("vibe_summary") or "").strip()
    if not palette and not components and not vibe:
        return ""

    lines: list[str] = ["===== DESIGN DNA — match this aesthetic exactly ====="]
    if vibe:
        lines.append(f"VIBE: {vibe}")
    lines.append("")

    if palette:
        lines.append("PALETTE — embed VERBATIM as a <style> block at the top of your html:")
        lines.append(palette)
        lines.append("")

    # Order matters: list the most distinctive first so a model that
    # truncates context still sees the high-value specimens.
    spec_order = [
        ("status_pill_set", "STATUS PILLS"),
        ("kpi_card", "KPI CARD"),
        ("table_row", "TABLE ROW"),
        ("button_primary", "BUTTON · PRIMARY"),
        ("button_secondary", "BUTTON · SECONDARY"),
        ("button_ghost", "BUTTON · GHOST"),
        ("input", "INPUT"),
        ("card", "CARD"),
        ("avatar", "AVATAR"),
    ]
    rendered_any = False
    for key, label in spec_order:
        spec = (components.get(key) or "").strip()
        if not spec:
            continue
        lines.append(f"{label} — use the SAME class names + structure:")
        lines.append(spec)
        lines.append("")
        rendered_any = True
    if not rendered_any:
        lines.append(
            "(no individual component specimens were extracted — match the palette above and the hero's general density/spacing)"
        )
        lines.append("")

    density = dna.get("density")
    if density:
        lines.append(f"DENSITY: {density}")

    lines.append("===== END DESIGN DNA =====")
    return "\n".join(lines)


# Heuristic regex fallback — used only if the AI extraction fails AND we
# need at least the palette + shell from the hero. Cheaper than a second
# AI call. Doesn't catch component specimens.
_STYLE_RE = re.compile(r"<style[^>]*>([\s\S]*?)</style>", re.IGNORECASE)
_HEADER_RE = re.compile(
    r"<(header|nav|aside)[^>]*class=['\"][^'\"]*(brand|sidebar|topbar|nav)[^'\"]*['\"][^>]*>[\s\S]*?</\1>",
    re.IGNORECASE,
)


def heuristic_extract(hero_html: str) -> dict[str, Any]:
    """Last-resort extraction. Pulls just the <style> blocks and a likely
    shell-shaped block. Used when the AI extractor fails."""
    dna = dict(_DEFAULT_DNA)
    if not hero_html:
        return dna
    styles = _STYLE_RE.findall(hero_html)
    if styles:
        dna["palette_css"] = "\n".join(f"<style>{s}</style>" for s in styles)
    return dna
