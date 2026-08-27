"""Deterministic bullet-level merge for blueprint sections.

The voice agent's extraction LLM emits only NEW bullets discovered in the
conversation; this module unions them with whatever's already in the section
without trusting the LLM to re-emit prior content (which it under-generates
on persona switches and topic shifts, silently dropping bullets).
"""

from __future__ import annotations

import re

_BULLET_PREFIX = re.compile(r"^[\s]*[-*•]\s*")
_WHITESPACE = re.compile(r"\s+")


def _normalize(line: str) -> str:
    """Normalize a bullet line for dedup comparison.

    Strip leading bullet markers, collapse whitespace, lowercase.
    """
    stripped = _BULLET_PREFIX.sub("", line).strip()
    return _WHITESPACE.sub(" ", stripped).lower()


def split_bullets(text: str) -> list[tuple[str, str]]:
    """Split section text into (raw_line, normalized) pairs.

    Empty lines are dropped. Plain (non-bullet) text is treated as one bullet.
    Order is preserved.
    """
    if not text:
        return []
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for raw in text.splitlines():
        norm = _normalize(raw)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        out.append((raw.rstrip(), norm))
    return out


def _ensure_bullet_prefix(raw: str) -> str:
    """Ensure a line starts with '- ' so merged output is uniformly bulleted."""
    stripped = raw.lstrip()
    if not stripped:
        return raw
    if stripped.startswith(("-", "*", "•")):
        return raw
    return f"- {stripped}"


def merge_bullets(existing: str, incoming: str, removed: set[str] | None = None) -> str:
    """Union of existing + incoming bullets, normalized & deduped.

    - Existing bullets always come first, in original order.
    - Incoming bullets are appended only if their normalized form isn't already
      present and isn't in `removed` (bullets the user explicitly deleted).
    - Output is uniformly bulleted with "- " prefix.
    """
    removed = removed or set()
    existing_pairs = split_bullets(existing)
    out_lines = [_ensure_bullet_prefix(raw) for raw, _ in existing_pairs]
    seen = {norm for _, norm in existing_pairs}

    for raw, norm in split_bullets(incoming):
        if norm in seen or norm in removed:
            continue
        seen.add(norm)
        out_lines.append(_ensure_bullet_prefix(raw))

    return "\n".join(out_lines)


def detect_removed(prior: str, replacement: str) -> set[str]:
    """Bullets present in `prior` but missing from `replacement`.

    Returned as normalized forms — callers store these so future agent merges
    don't re-add bullets the user explicitly deleted.
    """
    prior_norms = {norm for _, norm in split_bullets(prior)}
    new_norms = {norm for _, norm in split_bullets(replacement)}
    return prior_norms - new_norms


def compute_bullet_sources(
    final_text: str,
    prior_bullet_sources: dict | None,
    new_source: str,
) -> dict[str, str]:
    """Per-bullet provenance for one section's final content.

    Bullets that existed in the prior snapshot keep their recorded source;
    bullets that are new in ``final_text`` are tagged with ``new_source``.
    Bullets that have been dropped are not carried over. The result is a
    ``{normalized_bullet: source}`` map suitable for persisting on
    ``BlueprintSnapshot.bullet_sources[section]``.

    Used by the document view to render a stated/confirmed/inferred chip
    next to each bullet.
    """
    prior = prior_bullet_sources or {}
    out: dict[str, str] = {}
    for _, norm in split_bullets(final_text):
        out[norm] = prior.get(norm, new_source)
    return out
