"""AI-driven brand analysis.

Given a company URL (or hint), fetches the homepage, extracts color
evidence, and asks Claude to synthesize a complete theme + brand
metadata. Returns a ``BrandSuggestion`` that the frontend previews and the
admin then chooses to apply.

The heavy lifting is intentionally one Claude call: model gets the
gathered evidence, returns a strict JSON object. We validate the JSON
client-side via ``schemas.theme.TokenMap`` before returning.
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..schemas.brand import BrandGenerateRequest, BrandSuggestion
from ..schemas.theme import ThemeDoc, TokenMap
from . import theme_presets
from .ai_provider import get_ai_client_for_role

logger = logging.getLogger(__name__)

FETCH_TIMEOUT = 10.0
MAX_HTML_BYTES = 800_000
HEX_RE = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
RGB_RE = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})")
META_RE = re.compile(
    r'<meta[^>]+(?:property|name)\s*=\s*"([^"]+)"[^>]+content\s*=\s*"([^"]+)"',
    re.IGNORECASE,
)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
LINK_ICON_RE = re.compile(
    r'<link[^>]+rel\s*=\s*"[^"]*icon[^"]*"[^>]+href\s*=\s*"([^"]+)"',
    re.IGNORECASE,
)


async def fetch_brand_evidence(url: str) -> dict[str, Any]:
    """Pull what we can from the homepage. Best-effort — failures degrade."""
    parsed = urlparse(url if url.startswith("http") else f"https://{url}")
    if not parsed.netloc:
        raise ValueError("Invalid URL")
    base = f"{parsed.scheme or 'https'}://{parsed.netloc}"
    target = base + (parsed.path or "/")

    evidence: dict[str, Any] = {
        "url": target,
        "host": parsed.netloc,
        "title": None,
        "site_name": None,
        "description": None,
        "og_image": None,
        "favicon": None,
        "color_candidates": [],
    }

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=FETCH_TIMEOUT,
            headers={"User-Agent": "PlanningPlatformBrandBot/1.0"},
        ) as client:
            resp = await client.get(target)
        if resp.status_code >= 400:
            logger.info("brand fetch %s -> %s", target, resp.status_code)
            return evidence
        html = resp.text[:MAX_HTML_BYTES]
    except (httpx.HTTPError, httpx.RequestError) as exc:
        logger.warning("brand fetch failed %s: %s", target, exc)
        return evidence

    title_m = TITLE_RE.search(html)
    if title_m:
        evidence["title"] = title_m.group(1).strip()[:200]

    metas: dict[str, str] = {}
    for m in META_RE.finditer(html):
        metas[m.group(1).lower()] = m.group(2)
    evidence["site_name"] = metas.get("og:site_name") or metas.get("application-name")
    evidence["description"] = (
        metas.get("og:description") or metas.get("description") or metas.get("twitter:description")
    )
    if og := metas.get("og:image"):
        evidence["og_image"] = urljoin(target, og)

    icon_m = LINK_ICON_RE.search(html)
    if icon_m:
        evidence["favicon"] = urljoin(target, icon_m.group(1))
    else:
        evidence["favicon"] = urljoin(base, "/favicon.ico")

    # Pull every hex / rgb color from the HTML — top-N most-frequent
    # serve as evidence. CSS-in-HTML and inline-style attributes both
    # show up here, which is plenty for brand-color extraction.
    counts: Counter[str] = Counter()
    for m in HEX_RE.finditer(html):
        hex_val = m.group(1).lower()
        if len(hex_val) == 3:
            hex_val = "".join(c + c for c in hex_val)
        normalized = f"#{hex_val}"
        if _is_neutral(normalized):
            continue
        counts[normalized] += 1
    for m in RGB_RE.finditer(html):
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if max(r, g, b) > 255:
            continue
        normalized = f"#{r:02x}{g:02x}{b:02x}"
        if _is_neutral(normalized):
            continue
        counts[normalized] += 1
    evidence["color_candidates"] = [c for c, _ in counts.most_common(20)]

    return evidence


def _is_neutral(hex_color: str) -> bool:
    """Filter pure white/black/gray — they're noise, not brand colors."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return False
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    if r == g == b:
        return True
    if max(r, g, b) - min(r, g, b) < 8:
        return True
    return False


_HEX_TOKEN_KEYS = (
    "background, foreground, card, card-foreground, popover, popover-foreground, "
    "primary, primary-foreground, secondary, secondary-foreground, "
    "muted, muted-foreground, accent, accent-foreground, "
    "destructive, destructive-foreground, success, success-foreground, "
    "warning, warning-foreground, info, info-foreground, border, input, ring, "
    "chart-1, chart-2, chart-3, chart-4, chart-5, chart-6, chart-7, chart-8, "
    "chart-tooltip-bg, chart-tooltip-fg, "
    "canvas-bg, canvas-node-bg, canvas-node-fg, canvas-edge-selected, canvas-handle, "
    "livekit-tile-bg, livekit-screen-bg, "
    "selection-fg, scrollbar-thumb, scrollbar-thumb-hover, "
    "wireframe-bg, wireframe-fg, wireframe-accent"
)
_RGBA_TOKEN_KEYS = (
    "chart-grid, chart-axis, canvas-grid, canvas-grid-strong, canvas-node-border, "
    "canvas-edge-default, canvas-edge-hover, canvas-selection-fill, "
    "canvas-selection-stroke, canvas-minimap-mask, canvas-minimap-node, "
    "selection-bg, grid-placeholder-bg, grid-placeholder-border"
)

SYSTEM_PROMPT = f"""You are a brand designer rebranding a SaaS app for a specific company.

Given evidence about the company (website URL, title, description, and the
dominant colors found on the site), produce a complete theme that captures
the company's visual identity.

Return a single valid JSON object — no markdown, no commentary — shaped:

{{
  "app_name": "<short product name; sensible derivation of the company>",
  "tagline": "<short tagline based on the description, <=80 chars>",
  "color_scheme": "light" | "dark",
  "reasoning": "<one short paragraph explaining your color choices>",
  "tokens": {{ ... full token map ... }}
}}

The "tokens" object must contain EVERY one of these keys:

- Solid hex colors (#rrggbb, lowercase):
  {_HEX_TOKEN_KEYS}

- rgba() strings (low alpha for grids/overlays):
  {_RGBA_TOKEN_KEYS}

- box-shadow string: glow-primary-shadow

Constraints:
- The dominant brand color from the evidence becomes "primary".
- "primary-foreground" must have >= 4.5:1 contrast against "primary".
- "ring" should equal "primary".
- "background" / "foreground" / "card" should harmonize with primary but
  stay readable — favour near-black or near-white surfaces with a subtle
  hue lean toward primary.
- "destructive" stays a recognizably-red color regardless of brand.
- Charts 1..8 should be a balanced palette anchored on primary; do not
  just repeat primary.
- "chart-grid" / "canvas-grid": rgba with low alpha.
- All foreground/background pairs must hit >= 4.5:1 contrast.
- If the user specifies color_scheme, honor it; otherwise infer from mood.

Return ONLY the JSON object."""


def _build_user_prompt(req: BrandGenerateRequest, evidence: dict[str, Any]) -> str:
    parts: list[str] = ["Evidence about the company:"]
    if evidence.get("url"):
        parts.append(f"- URL: {evidence['url']}")
    if evidence.get("host"):
        parts.append(f"- Host: {evidence['host']}")
    if evidence.get("title"):
        parts.append(f"- Page title: {evidence['title']}")
    if evidence.get("site_name"):
        parts.append(f"- Site name: {evidence['site_name']}")
    if evidence.get("description"):
        parts.append(f"- Description: {evidence['description']}")
    if evidence.get("color_candidates"):
        joined = ", ".join(evidence["color_candidates"])
        parts.append(
            f"- Dominant non-neutral colors found on the site (most-frequent first): {joined}"
        )
    if evidence.get("favicon"):
        parts.append(f"- Favicon URL: {evidence['favicon']}")
    if evidence.get("og_image"):
        parts.append(f"- OG image (often the logo): {evidence['og_image']}")
    if req.color_hint:
        parts.append(f"- User-specified accent color hint: {req.color_hint}")
    if req.brand_description:
        parts.append(f"- User-supplied brand description: {req.brand_description}")
    if req.color_scheme:
        parts.append(f"- Required color scheme: {req.color_scheme}")
    parts.append("")
    parts.append("Return the JSON brand object now.")
    return "\n".join(parts)


async def generate_brand(
    db: AsyncSession,
    org_id: str | None,
    req: BrandGenerateRequest,
) -> BrandSuggestion:
    """Build the suggestion. Does not persist — caller decides whether to apply."""
    if not (req.url or req.color_hint or req.brand_description or req.logo_url):
        raise ValueError("Provide at least one of: url, color_hint, brand_description, logo_url")

    evidence: dict[str, Any] = {}
    if req.url:
        evidence = await fetch_brand_evidence(req.url)
    else:
        evidence = {"url": None, "host": None, "color_candidates": []}

    user_prompt = _build_user_prompt(req, evidence)
    client = await get_ai_client_for_role(org_id, db, role="brand")
    text = await client.chat(
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
        max_tokens=4096,
        temperature=0.3,
    )

    parsed = _parse_brand_json(text)
    theme_doc = _suggestion_to_theme_doc(parsed)

    return BrandSuggestion(
        app_name=str(parsed.get("app_name") or "").strip() or None,
        tagline=str(parsed.get("tagline") or "").strip() or None,
        logo_url=evidence.get("og_image"),
        favicon_url=evidence.get("favicon"),
        source_url=evidence.get("url") or req.url,
        theme=theme_doc,
        reasoning=str(parsed.get("reasoning") or "").strip() or None,
    )


def _parse_brand_json(text: str) -> dict[str, Any]:
    """Try to extract the JSON object even when the model wraps it in fences."""
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    # Slice from first '{' to last '}' — defensive against trailing prose.
    first = s.find("{")
    last = s.rfind("}")
    if first == -1 or last == -1 or last <= first:
        raise ValueError(f"No JSON object found in model output: {text[:200]}")
    try:
        return json.loads(s[first : last + 1])
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model returned invalid JSON: {exc}") from exc


def _suggestion_to_theme_doc(parsed: dict[str, Any]) -> ThemeDoc:
    tokens_in = parsed.get("tokens") or {}
    if not isinstance(tokens_in, dict):
        raise ValueError("tokens must be an object")
    color_scheme = parsed.get("color_scheme")
    if color_scheme not in ("light", "dark"):
        # Heuristic: dark if background is darker than foreground.
        color_scheme = "dark"

    base = theme_presets.get_builtin_preset(
        "preset:dark" if color_scheme == "dark" else "preset:light"
    )
    assert base is not None  # presets are static
    merged: dict[str, str] = {**base.tokens}
    for k, v in tokens_in.items():
        if isinstance(v, str) and v.strip():
            merged[k] = v.strip()
    # Validate via the strict schema (raises on unknown keys / bad hex).
    validated = TokenMap(tokens=merged).tokens
    return ThemeDoc(
        version=1,
        name=str(parsed.get("app_name") or "Brand").strip() or "Brand",
        base_preset=None,
        color_scheme=color_scheme,  # type: ignore[arg-type]
        tokens=validated,
    )
