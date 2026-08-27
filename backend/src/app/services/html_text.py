"""Tiny helpers for working with the rich-text HTML the ticket editor produces.

Used by the orchestrator (which feeds card descriptions into Claude prompts)
and by sync translators that need to flatten HTML for legacy plain-text
consumers. We intentionally avoid pulling in a full HTML parser dependency —
ticket descriptions are short and authored through a known-safe Tiptap schema,
so a regex-based strip is sufficient.
"""

from __future__ import annotations

import html as html_stdlib
import re
from typing import Any

# Block-level tags that should produce paragraph breaks in the flattened text.
_BLOCK_BREAKS = re.compile(
    r"</(?:p|div|li|h[1-6]|blockquote|tr|pre)>|<br\s*/?>",
    re.IGNORECASE,
)
_TAG = re.compile(r"<[^>]+>")
_WS_RUN = re.compile(r"\n{3,}")


def html_to_text(value: str | None) -> str:
    """Convert tiptap HTML (or any HTML-ish string) to readable plain text.

    Inserts newlines at block boundaries, strips remaining tags, and
    decodes HTML entities. Returns an empty string for None/empty input.
    """
    if not value:
        return ""
    if "<" not in value:
        return value.strip()
    text = _BLOCK_BREAKS.sub("\n", value)
    text = _TAG.sub("", text)
    text = html_stdlib.unescape(text)
    text = _WS_RUN.sub("\n\n", text)
    return text.strip()


def ac_text(item: Any) -> str:
    """Pull the human-readable text out of an acceptance-criterion item.

    Supports both the legacy bare-string shape and the new
    ``{"text": ..., "done": ...}`` object shape.
    """
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return str(item.get("text", "")).strip()
    return str(item)


def ac_done(item: Any) -> bool:
    """Return True when an acceptance criterion is marked complete."""
    if isinstance(item, dict):
        return bool(item.get("done", False))
    return False


def normalize_ac(items: list[Any] | None) -> list[dict[str, Any]]:
    """Coerce a mixed AC list into uniform ``[{text, done}]`` objects."""
    if not items:
        return []
    out: list[dict[str, Any]] = []
    for item in items:
        out.append({"text": ac_text(item), "done": ac_done(item)})
    return out
