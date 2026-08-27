"""Live loader for the full HTML samples in the design-library `samples/` dir.

The wireframe generator is anchored to concrete exemplars (see
``wireframe_references.py``). Historically those exemplars were hand-distilled
strings pasted into that module — which meant improving a sample required a
code edit. This loader makes ``design-library/samples/`` the live source:
drop a full HTML app in there, add a line to ``manifest.json`` describing which
briefs it serves, and the pipeline picks it up automatically.

A full sample (e.g. ``loans-ledger.html`` ~370KB) can never go into a prompt,
so each is *distilled* on read: scripts stripped, long SVG path data elided,
runs of repeated rows collapsed, CSS and body each capped, total capped to
``MAX_CHARS``. The result is a structural skeleton (~10-14KB) showing layout,
density, component grammar, and design tokens — exactly what the model needs
as "inspiration, do not copy" and nothing more.

Distillation is cached per (file, mtime) so editing a sample invalidates the
cache without a restart.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

SAMPLES_DIR = Path(__file__).resolve().parents[1] / "diagram_harness" / "design-library" / "samples"
MANIFEST_PATH = SAMPLES_DIR / "manifest.json"

# Size budget for a distilled sample. References share the per-screen prompt
# with the design system + shell + triggers, so keep this comparable to the
# hand-distilled inline references (~5KB) but allow a richer skeleton.
MAX_CHARS = 16_000
_STYLE_CAP = 3_800
_BODY_HEAD = 5_600
_TABLE_CAP = 3_400
_CHART_CAP = 2_000
# SVG `d` attributes longer than this are pathological (huge fills / map data)
# and get truncated to a valid prefix. Normal chart/sparkline curves are
# shorter and kept intact — eliding them taught the model to draw EMPTY charts.
_PATH_MAX = 220

# (file, mtime) -> distilled block
_DISTILL_CACHE: dict[tuple[str, float], str] = {}


def _collapse_repeats(html: str, tag: str, keep: int = 3) -> str:
    """Collapse a run of >keep consecutive ``<tag>…</tag>`` siblings to the
    first ``keep`` plus an elision comment. Relies on the tag not nesting
    inside itself (true for tr/option/li in well-formed tables/lists)."""
    unit = rf"(?:<{tag}\b[^>]*>.*?</{tag}>\s*)"
    pattern = rf"({unit}{{{keep}}})(?:{unit})+"
    return re.sub(pattern, rf"\1<!-- … more {tag} rows … -->\n", html, flags=re.DOTALL | re.IGNORECASE)


def _collapse_class_repeats(html: str, classname: str, keep: int = 4) -> str:
    """Collapse a run of >keep consecutive ``<div class="…classname…">`` siblings.
    Safe only for flat elements (no nested ``<div>``) like sidebar nav items."""
    div = rf'(?:<div\b[^>]*class="[^"]*\b{re.escape(classname)}\b[^"]*"[^>]*>.*?</div>\s*)'
    pattern = rf"({div}{{{keep}}})(?:{div})+"
    return re.sub(pattern, rf"\1<!-- … more {classname} … -->\n", html, flags=re.DOTALL | re.IGNORECASE)


def _first_chart_svg(html: str) -> str | None:
    """Return the first data-chart ``<svg>`` (large viewBox) rather than a tiny
    icon or sparkline — the exemplar the model needs to draw a populated chart."""
    for m in re.finditer(r"<svg\b[^>]*>.*?</svg>", html, flags=re.DOTALL | re.IGNORECASE):
        svg = m.group(0)
        vb = re.search(r'viewBox="0 0 (\d+)\s+\d+"', svg)
        if vb and int(vb.group(1)) >= 240 and "<path" in svg:
            return svg
    return None


def distill_html(html: str, label: str) -> str:
    """Reduce a full HTML sample to a compact structural skeleton."""
    # 1 — drop all scripts (the bulk of an interactive sample's weight)
    html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # 2 — trim only pathologically long SVG paths to a valid prefix. Chart and
    # sparkline curves are kept intact so the model learns charts carry real
    # data paths (fully eliding them produced empty chart frames).
    def _trim_path(m: re.Match) -> str:
        d = m.group(1)
        if len(d) <= _PATH_MAX:
            return m.group(0)
        cut = d.rfind(" ", 0, _PATH_MAX) or _PATH_MAX
        return f'd="{d[: cut if cut > 0 else _PATH_MAX]}"'

    html = re.sub(r'd="([^"]*)"', _trim_path, html)
    # 3 — pull out the stylesheet (design tokens: palette, spacing, type) and cap it
    style_m = re.search(r"<style\b[^>]*>(.*?)</style>", html, flags=re.DOTALL | re.IGNORECASE)
    css = (style_m.group(1).strip() if style_m else "")[:_STYLE_CAP]
    # 4 — pull out the body structure and collapse repetition
    body_m = re.search(r"<body\b[^>]*>(.*?)</body>", html, flags=re.DOTALL | re.IGNORECASE)
    body = body_m.group(1) if body_m else html
    for tag, keep in (("tr", 3), ("option", 4), ("li", 4)):
        body = _collapse_repeats(body, tag, keep)
    # Collapse repetitive sidebar/list scaffolding so the salient topbar / KPI
    # strip / table surface within the head slice instead of being pushed out.
    for cls in ("nav-item", "doctype-row"):
        body = _collapse_class_repeats(body, cls, keep=4)
    body = re.sub(r"\n[ \t]*\n[ \t]*\n+", "\n\n", body).strip()
    # The head of the body captures shell/nav/topbar/KPIs. Tables (a key
    # pattern) often sit deeper than a linear cut would reach, so if no table
    # made the head slice, splice in the first one explicitly.
    head = body[:_BODY_HEAD]
    parts = [head]
    if "<table" not in head.lower():
        table_m = re.search(r"<table\b.*?</table>", body, flags=re.DOTALL | re.IGNORECASE)
        if table_m:
            parts.append("<!-- … skipped to first table … -->")
            parts.append(table_m.group(0)[:_TABLE_CAP])
    # Splice in a real data chart (axis lines + gradient + curve) so the model
    # has a concrete chart-with-data exemplar — dashboards otherwise render
    # empty chart frames. Pick the first large-viewBox svg with a curve path.
    chart = _first_chart_svg(body)
    if chart and chart not in head:
        parts.append("<!-- … chart pattern (real data path) … -->")
        parts.append(chart[:_CHART_CAP])
    body_out = "\n".join(parts)
    block = (
        f"<!-- ===== REFERENCE: {label} ===== -->\n"
        f"<style>\n{css}\n</style>\n{body_out}"
    )
    return block[:MAX_CHARS]


def _load_manifest() -> list[dict]:
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        logger.warning("Malformed samples manifest at %s — ignoring", MANIFEST_PATH)
        return []


def _distilled_for(entry: dict) -> str | None:
    """Distill the sample named by a manifest entry, cached by mtime."""
    path = SAMPLES_DIR / entry.get("file", "")
    try:
        mtime = path.stat().st_mtime
    except OSError:
        logger.warning("Sample file missing for manifest entry: %s", entry.get("file"))
        return None
    cache_key = (str(path), mtime)
    cached = _DISTILL_CACHE.get(cache_key)
    if cached is not None:
        return cached
    label = entry.get("label") or path.stem.replace("-", " ").upper()
    block = distill_html(path.read_text(encoding="utf-8"), label)
    _DISTILL_CACHE[cache_key] = block
    return block


def sample_block_for_screen(screen_name: str, screen_kind: str = "screen", app_context: str = "") -> str | None:
    """Return a distilled sample block when a manifest entry's keywords match
    the screen OR the surrounding app context, else None.

    ``app_context`` is the app domain signal (title + sibling screen names +
    intents). It's what lets a loan/debt app's screen named "Dashboard" route
    to the finance sample — matching on the bare screen name alone would miss
    it, which is why generic-named screens previously got a generic reference.
    """
    haystack = f"{screen_name} {screen_kind} {app_context}".lower()
    for entry in _load_manifest():
        keywords = entry.get("keywords") or []
        if any(str(kw).lower() in haystack for kw in keywords):
            return _distilled_for(entry)
    return None
