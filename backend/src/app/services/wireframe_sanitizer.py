"""Wireframe HTML sanitiser.

The AI per-screen pipeline regularly emits inline literal hex colours
(`style="color:#f59e0b"`) instead of CSS variables, even when the prompt
forbids it. That makes wireframes opaque to design-token swaps — every
restyle requires a full AI roundtrip.

This module rewrites inline colour values in wireframe HTML to
`var(--color-*)` references based on the closest semantic match in the
design system's palette. After sanitising, a token swap in localStorage
is enough to restyle every wireframe instantly, no AI involvement.

Public API:
    sanitize_wireframe_html(html: str, design_system: dict) -> str
"""

from __future__ import annotations

import re
from collections.abc import Iterable

# All inline colour patterns we recognise. Matches inside `style="..."` AND
# `style='...'` because the AI uses both quote styles.
_HEX_RE = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")
_RGB_RE = re.compile(r"rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*[0-9.]+)?\s*\)")
_NAMED_COLOURS = {
    "white": "#ffffff",
    "black": "#000000",
    "red": "#ff0000",
    "green": "#008000",
    "blue": "#0000ff",
    "gray": "#808080",
    "grey": "#808080",
}

# Mapping: design-system palette key → CSS variable. Order matters — the
# resolver picks the FIRST var whose hex value is closest to the target.
# Putting structural tokens first means accent/state tokens win for
# saturated colours, while bg/text/surface win for neutrals.
_PALETTE_TO_VAR: list[tuple[str, str]] = [
    ("background", "--color-bg"),
    ("surface", "--color-surface"),
    ("text", "--color-text"),
    ("muted", "--color-text-muted"),
    ("primary", "--color-primary"),
    ("accent", "--color-accent"),
    ("border", "--color-border"),
    ("success", "--color-success"),
    ("warning", "--color-warning"),
    ("error", "--color-error"),
]


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int] | None:
    h = hex_str.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return None
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return None


def _color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    """Euclidean distance in RGB. Good enough for nearest-neighbour mapping."""
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def _build_palette_index(design_system: dict) -> list[tuple[tuple[int, int, int], str]]:
    """Return a list of (rgb, css_var) pairs for every palette entry that
    has a parseable hex value. Caller iterates and picks the closest."""
    colours = design_system.get("colors") or {}
    if not isinstance(colours, dict):
        return []
    index: list[tuple[tuple[int, int, int], str]] = []
    for key, var_name in _PALETTE_TO_VAR:
        entry = colours.get(key)
        if entry is None:
            continue
        # Tokens are objects {hex, name, usage} or plain hex strings.
        if isinstance(entry, dict):
            hex_val = entry.get("hex")
        elif isinstance(entry, str):
            hex_val = entry
        else:
            continue
        if not isinstance(hex_val, str):
            continue
        rgb = _hex_to_rgb(hex_val)
        if rgb is None:
            continue
        index.append((rgb, var_name))
    return index


def _nearest_var(rgb: tuple[int, int, int], index: Iterable[tuple[tuple[int, int, int], str]]) -> str | None:
    best: tuple[float, str] | None = None
    for palette_rgb, var_name in index:
        d = _color_distance(rgb, palette_rgb)
        if best is None or d < best[0]:
            best = (d, var_name)
    return best[1] if best else None


def _replace_in_style_attr(value: str, palette_index: list[tuple[tuple[int, int, int], str]]) -> str:
    """Replace hex / rgb / named colours in a style-attribute value with
    var() references. Leaves the rest of the value untouched."""
    if not palette_index:
        return value

    def hex_sub(m: re.Match[str]) -> str:
        rgb = _hex_to_rgb(m.group(0))
        if rgb is None:
            return m.group(0)
        var_name = _nearest_var(rgb, palette_index)
        return f"var({var_name})" if var_name else m.group(0)

    value = _HEX_RE.sub(hex_sub, value)

    def rgb_sub(m: re.Match[str]) -> str:
        try:
            r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        except ValueError:
            return m.group(0)
        var_name = _nearest_var((r, g, b), palette_index)
        return f"var({var_name})" if var_name else m.group(0)

    value = _RGB_RE.sub(rgb_sub, value)

    for name, hex_val in _NAMED_COLOURS.items():
        if name not in value:
            continue
        rgb = _hex_to_rgb(hex_val)
        if rgb is None:
            continue
        var_name = _nearest_var(rgb, palette_index)
        if not var_name:
            continue
        # Word-boundary so 'red' doesn't match inside 'reduce'.
        value = re.sub(rf"\b{name}\b", f"var({var_name})", value)
    return value


_STYLE_ATTR_RE = re.compile(r"""style\s*=\s*(?P<q>['"])(?P<body>[^'"]*)(?P=q)""")


# Sanitise `:root { ... }` blocks the AI emits inside `<style>` tags.
# We used to strip these wholesale because Gemini would clobber the
# platform-managed `--color-*` tokens with hardcoded hex. With opus in
# hero mode we now WANT extended-palette definitions (`--bg-soft`,
# `--accent-soft`, `--good`, etc.) to survive — those don't exist in
# the platform's 10-token palette and the rest of the screen depends
# on them. So we remove ONLY the lines that redefine platform-managed
# `--color-*` tokens, keeping everything else.
_ROOT_BLOCK_RE = re.compile(r"(:root\s*\{)([^}]*)(\})", re.DOTALL)
_PLATFORM_TOKEN_RE = re.compile(
    r"\s*--color-(?:bg|surface|text|text-muted|primary|accent|on-accent|border|success|warning|error)\s*:[^;]+;",
    re.IGNORECASE,
)


def _strip_platform_token_redefinitions(html: str) -> str:
    """Walk every <style>...</style>:root{} block; remove ONLY the lines
    redeclaring platform-managed `--color-*` tokens. Extended tokens
    (--bg-soft, --good, --accent-soft, etc.) stay so the hero's rich
    palette survives. If a :root block ends up empty after stripping,
    drop it. Other CSS in the <style> is preserved."""
    style_block_re = re.compile(r"(<style[^>]*>)(.*?)(</style>)", re.DOTALL | re.IGNORECASE)

    def root_repl(m: re.Match[str]) -> str:
        open_brace, body, close_brace = m.group(1), m.group(2), m.group(3)
        cleaned = _PLATFORM_TOKEN_RE.sub("", body).strip()
        if not cleaned:
            return ""  # whole :root was platform-token redefs — drop it
        return f"{open_brace}{cleaned}{close_brace}"

    def style_repl(m: re.Match[str]) -> str:
        opening, body, closing = m.group(1), m.group(2), m.group(3)
        cleaned_body = _ROOT_BLOCK_RE.sub(root_repl, body).strip()
        if not cleaned_body:
            # Nothing left after stripping :root — drop the empty <style>.
            return ""
        return f"{opening}{cleaned_body}{closing}"

    return style_block_re.sub(style_repl, html)


def sanitize_wireframe_html(html: str, design_system: dict | None) -> str:
    """Rewrite every inline colour value inside style="..." attributes to
    var(--color-*) references AND strip `:root` re-declarations from
    embedded <style> blocks.

    Untouched: layout properties (display, grid, flex, padding, margin,
    width, height, position) — only colour-bearing values are mapped.

    Returns input unchanged when no palette is available."""
    if not html or not isinstance(html, str):
        return html
    # Strip ONLY platform-managed `--color-*` redefinitions from :root,
    # keeping the hero's extended palette (--bg-soft, --good, etc.) intact.
    html = _strip_platform_token_redefinitions(html)
    if not design_system or not isinstance(design_system, dict):
        return html
    palette_index = _build_palette_index(design_system)
    if not palette_index:
        return html

    def style_sub(m: re.Match[str]) -> str:
        body = m.group("body")
        new_body = _replace_in_style_attr(body, palette_index)
        return f"style={m.group('q')}{new_body}{m.group('q')}"

    return _STYLE_ATTR_RE.sub(style_sub, html)
