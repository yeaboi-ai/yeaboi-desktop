"""Retrieval for the team directory — picks the top-K relevant entries for a query.

Two backends, chosen by dialect:

- **Postgres**: uses the `search_tsv` tsvector column (GENERATED ALWAYS over
  title/description/content) plus `plainto_tsquery` and `ts_rank`. Fast,
  stemming-aware, handles punctuation — see migration ``r3s4t5u6v7w8``.
- **SQLite / fallback**: in-python ranked scorer over ILIKE candidates. The
  test suite runs on SQLite, and any env where the FTS column is missing
  gracefully falls back via this path (single retry on error).

Both paths share the same signature and result shape so consumers (facilitator
+ chat tools) don't care which backend served them.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import or_, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.directory import DirectoryEntry

logger = logging.getLogger(__name__)

# Stopwords stripped from queries before matching. Short list — we're not
# trying to replace a real tokeniser, just avoid "the" / "is" dominating the
# ranking.
_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "has",
    "have",
    "he",
    "her",
    "his",
    "i",
    "in",
    "is",
    "it",
    "its",
    "me",
    "my",
    "of",
    "on",
    "or",
    "our",
    "she",
    "that",
    "the",
    "their",
    "them",
    "these",
    "they",
    "this",
    "to",
    "us",
    "was",
    "we",
    "were",
    "will",
    "with",
    "you",
    "your",
    "can",
    "could",
    "should",
    "would",
    "may",
    "might",
    "how",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "do",
    "does",
    "did",
}

# Words under this length are skipped entirely (excluding important short
# acronyms; we let acronyms through by checking for ALL-CAPS separately).
_MIN_TOKEN_LEN = 3


def tokenise(query: str) -> list[str]:
    """Return a clean list of lowercase search tokens from the query string.

    Acronyms in the query (2-4 uppercase letters like AWS, API, SLO) are kept
    even if they'd otherwise be filtered by the min-length threshold.
    """
    if not query:
        return []

    tokens: list[str] = []
    seen: set[str] = set()
    for raw in re.findall(r"[A-Za-z][A-Za-z0-9\-]*", query):
        # Preserve short acronyms (all-uppercase, 2-4 chars) before lowering
        is_acronym = 2 <= len(raw) <= 4 and raw.isupper()
        token = raw.lower()
        if token in _STOPWORDS:
            continue
        if len(token) < _MIN_TOKEN_LEN and not is_acronym:
            continue
        if token in seen:
            continue
        seen.add(token)
        tokens.append(token)
    return tokens


# ---------------------------------------------------------------------------
# Ranked search
# ---------------------------------------------------------------------------

_TITLE_WEIGHT = 3.0
_CONTENT_WEIGHT = 1.0


def _score_entry(entry: DirectoryEntry, tokens: list[str]) -> float:
    """Return a relevance score for *entry* against *tokens*.

    Simple weighted count: title hits count for more than content hits. The
    content hit count is capped at 5 per token to prevent a single bloated
    entry dominating the rankings purely by length.
    """
    if not tokens:
        return 0.0

    title_lower = (entry.title or "").lower()
    content_lower = (entry.content or "").lower()

    score = 0.0
    for token in tokens:
        title_hits = title_lower.count(token)
        content_hits = min(content_lower.count(token), 5)
        score += title_hits * _TITLE_WEIGHT + content_hits * _CONTENT_WEIGHT
    return score


async def retrieve_for_query(
    team_id: str,
    query: str,
    db: AsyncSession,
    limit: int = 5,
    include_overview: bool = True,
) -> list[dict[str, Any]]:
    """Return top-K directory entries most relevant to *query*.

    The ``overview`` entry is included at position 0 when ``include_overview``
    is True and an overview exists — it's the baseline context the facilitator
    always benefits from. The remaining slots go to ranked search hits.

    Returns a list of dicts shaped ``{"id", "title", "path", "category",
    "description"}`` — description is the first bolded or non-empty line
    extracted from the entry's content (keeps injected tokens bounded).

    Fail-open: returns an empty list on any error.
    """
    try:
        overview_entry = await _load_overview(team_id, db) if include_overview else None

        tokens = tokenise(query)
        if not tokens:
            return _assemble_result(overview_entry, [], limit)

        candidates = await _search_candidates(team_id, db, query, tokens)

        return _assemble_result(overview_entry, candidates, limit)
    except Exception:
        logger.warning("Directory retrieval failed for team %s", team_id, exc_info=True)
        return []


async def _load_overview(team_id: str, db: AsyncSession) -> DirectoryEntry | None:
    result = await db.execute(
        select(DirectoryEntry).where(
            DirectoryEntry.team_id == team_id,
            DirectoryEntry.path == "overview",
        )
    )
    return result.scalar_one_or_none()


def _dialect_name(db: AsyncSession) -> str:
    try:
        return db.bind.dialect.name  # type: ignore[union-attr]
    except Exception:
        return ""


async def _search_candidates(
    team_id: str,
    db: AsyncSession,
    query: str,
    tokens: list[str],
) -> list[tuple[DirectoryEntry, float]]:
    """Dispatch to the Postgres FTS path when available, else the python scorer.

    Returns a score-ordered list of (entry, score) — caller merges with overview.
    """
    if _dialect_name(db) == "postgresql":
        try:
            return await _search_fts(team_id, db, query)
        except SQLAlchemyError:
            # Column or extension missing (e.g. migration not applied yet) —
            # fall through to the python scorer rather than breaking retrieval.
            logger.warning(
                "FTS retrieval failed for team %s, falling back to ILIKE",
                team_id,
                exc_info=True,
            )

    return await _search_ilike(team_id, db, tokens)


async def _search_fts(
    team_id: str,
    db: AsyncSession,
    query: str,
) -> list[tuple[DirectoryEntry, float]]:
    """Postgres FTS — uses ``search_tsv @@ plainto_tsquery('english', :q)`` and
    orders by ``ts_rank``. Handles stemming, stopwords, and phrase-ish queries
    natively. The 100-row cap matches the ILIKE path so downstream behaviour
    is equivalent in size.
    """
    sql = text(
        """
        SELECT
            id,
            ts_rank(search_tsv, plainto_tsquery('english', :q)) AS rank
        FROM directory_entries
        WHERE team_id = :team_id
          AND search_tsv @@ plainto_tsquery('english', :q)
        ORDER BY rank DESC
        LIMIT 100
        """
    )
    rows = (await db.execute(sql, {"q": query, "team_id": team_id})).all()
    if not rows:
        return []

    ids = [r.id for r in rows]
    ranks = {r.id: float(r.rank) for r in rows}

    # Pull the full entries in one query, then restore ts_rank order.
    entries_result = await db.execute(
        select(DirectoryEntry).where(DirectoryEntry.id.in_(ids))
    )
    by_id = {e.id: e for e in entries_result.scalars().all()}
    return [(by_id[i], ranks[i]) for i in ids if i in by_id]


async def _search_ilike(
    team_id: str,
    db: AsyncSession,
    tokens: list[str],
) -> list[tuple[DirectoryEntry, float]]:
    """SQLite (and fallback) — ranked ILIKE over title/content."""
    conditions = []
    for token in tokens:
        pattern = f"%{token}%"
        conditions.append(DirectoryEntry.title.ilike(pattern))
        conditions.append(DirectoryEntry.content.ilike(pattern))

    result = await db.execute(
        select(DirectoryEntry)
        .where(DirectoryEntry.team_id == team_id, or_(*conditions))
        .limit(100)
    )
    candidates = list(result.scalars().all())
    scored = [(e, _score_entry(e, tokens)) for e in candidates]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored


def _assemble_result(
    overview: DirectoryEntry | None,
    scored: list[tuple[DirectoryEntry, float]],
    limit: int,
) -> list[dict[str, Any]]:
    """Merge overview + ranked hits, dedupe, cap at *limit*."""
    seen_ids: set[str] = set()
    out: list[dict[str, Any]] = []

    if overview is not None:
        out.append(_serialise(overview))
        seen_ids.add(overview.id)

    for entry, score in scored:
        if len(out) >= limit:
            break
        if entry.id in seen_ids:
            continue
        if score <= 0:
            continue
        out.append(_serialise(entry))
        seen_ids.add(entry.id)

    return out


def _serialise(entry: DirectoryEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "title": entry.title,
        "path": entry.path,
        "category": entry.category,
        "description": _extract_description(entry.content),
    }


def _extract_description(content: str | None, max_chars: int = 220) -> str:
    """Pull a compact one-line description from entry content.

    Prefers a `**bold**` first line (scan connectors format their summaries
    this way), otherwise falls back to the first non-empty line truncated.
    """
    if not content:
        return ""
    for line in content.split("\n", 10):
        stripped = line.strip()
        if stripped.startswith("**") and stripped.endswith("**") and len(stripped) > 4:
            return stripped[2:-2].strip()[:max_chars]
        if stripped:
            return stripped[:max_chars]
    return ""


# ---------------------------------------------------------------------------
# Facilitator-facing formatter
# ---------------------------------------------------------------------------


def format_for_prompt(entries: list[dict[str, Any]]) -> str:
    """Render the retrieved entries as a compact prompt section.

    The output is designed to fit in ≲500 tokens for the default limit=5.
    """
    if not entries:
        return ""

    lines = ["TEAM CONTEXT (from directory — most relevant entries):"]
    for entry in entries:
        title = entry.get("title", "Untitled")
        path = entry.get("path", "")
        category = entry.get("category", "")
        description = entry.get("description", "")
        header = f"- {title}"
        if category:
            header += f" [{category}]"
        if path:
            header += f" · {path}"
        lines.append(header)
        if description:
            lines.append(f"  {description}")
    return "\n".join(lines) + "\n"
