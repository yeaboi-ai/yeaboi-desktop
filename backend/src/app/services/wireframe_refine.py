"""Iterative hero-wireframe refinement loop.

A cheap DeepSeek draft is lifted toward expensive-single-shot quality by an
Opus critic: critique → enrich → re-critique until the richness score clears
a threshold or the pass cap is hit. The loop is pure orchestration over two
injected callables so it's unit-testable without real models:

    critique_fn(html) -> Critique | None   # None = unavailable/malformed
    enrich_fn(html, gaps) -> str | None     # None = generator failed

The caller (routers/sessions.py) supplies closures that wrap the role-routed
AI clients + the prompt builders/parser in this module. Every failure path
degrades to the best draft seen — the loop must never raise into generation.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_SEVERITY_ORDER = {"high": 0, "med": 1, "medium": 1, "low": 2}
# Enriched html shorter than this fraction of the draft is a regression
# (the model dropped content instead of adding it).
_MIN_LENGTH_RATIO = 0.8
# Fraction of sampled structural anchors that must survive an enrichment.
_MIN_ANCHOR_RETENTION = 0.6
_MAX_ANCHORS = 20


@dataclass
class Gap:
    area: str
    patch_instruction: str
    severity: str = "med"


@dataclass
class Critique:
    score: int
    gaps: list[Gap] = field(default_factory=list)


@dataclass
class RefineResult:
    html: str
    final_score: int | None
    passes: int
    history: list[int]


def _structural_anchors(html: str) -> list[str]:
    """Sample distinct class tokens from the html as structural anchors.

    Used by the validation guard to detect a patch that mangled the page
    rather than enriching it. Class tokens are a good cheap proxy for
    'the shell/layout the draft established'.
    """
    seen: list[str] = []
    for m in re.finditer(r"""class\s*=\s*['"]([^'"]+)['"]""", html):
        for tok in m.group(1).split():
            if tok not in seen:
                seen.append(tok)
            if len(seen) >= _MAX_ANCHORS:
                return seen
    return seen


def _is_valid_enrichment(old: str, new: str | None) -> bool:
    """True when `new` is a plausible enrichment of `old`, not a regression.

    Rejects: empty/whitespace, non-html (no angle brackets), drastic shrink
    (< 80% of old length), and loss of more than 40% of the draft's
    structural anchors. Heuristic and dependency-free by design — the cost of
    a false reject is one wasted retry; the cost of a false accept is a
    mangled hero that poisons every sub-screen's DNA.
    """
    new = (new or "").strip()
    if not new:
        return False
    if "<" not in new or ">" not in new:
        return False
    if len(new) < _MIN_LENGTH_RATIO * len(old):
        return False
    anchors = _structural_anchors(old)
    if anchors:
        present = sum(1 for a in anchors if a in new)
        if present < _MIN_ANCHOR_RETENTION * len(anchors):
            return False
    return True


def _ordered_gaps(gaps: list[Gap]) -> list[Gap]:
    """High-severity gaps first so the most impactful patches are described
    earliest in the enrich prompt."""
    return sorted(gaps, key=lambda g: _SEVERITY_ORDER.get((g.severity or "med").lower(), 1))


async def run_refinement(
    *,
    initial_html: str,
    critique_fn: Callable[[str], Awaitable[Critique | None]],
    enrich_fn: Callable[[str, list[Gap]], Awaitable[str | None]],
    threshold: int = 85,
    max_passes: int = 3,
) -> RefineResult:
    """Run the critique → enrich loop and return the best-scoring hero.

    `passes` counts the draft (always 1) plus each accepted enrich round, so
    max_passes=3 means draft + up to 2 enrich rounds (and up to 3 critiques).
    Returns the highest-scoring html seen, guaranteeing final >= draft score.
    """
    current = initial_html
    passes = 1
    crit = await critique_fn(current)
    if crit is None:
        return RefineResult(html=initial_html, final_score=None, passes=passes, history=[])

    best_html, best_score = current, crit.score
    history = [crit.score]

    while crit is not None and crit.gaps and crit.score < threshold and passes < max_passes:
        gaps = _ordered_gaps(crit.gaps)
        enriched = await enrich_fn(current, gaps)
        if not _is_valid_enrichment(current, enriched):
            enriched = await enrich_fn(current, gaps)  # one retry
            if not _is_valid_enrichment(current, enriched):
                logger.warning("[REFINE] enrichment invalid after retry; keeping last valid draft")
                break
        current = enriched  # type: ignore[assignment]  # guard guarantees str
        passes += 1
        crit = await critique_fn(current)
        if crit is not None:
            history.append(crit.score)
            if crit.score > best_score:
                best_html, best_score = current, crit.score

    return RefineResult(html=best_html, final_score=best_score, passes=passes, history=history)


# ── Richness rubric (the explicit encoding of "what rich means") ────────────
RICHNESS_RUBRIC = """\
Score the screen 0-100 by summing these weighted dimensions:
- Specific, varied data (30): named entities, varied numbers/dates/IDs; ZERO
  placeholder / "Item 1" / "Lorem" / repeated identical rows.
- Density (20): appropriate to the surface — multi-column tables, KPI strips,
  real lists; not a few lonely cards in whitespace.
- Secondary detail (20): deltas, sparklines, micro/risk bars, semantic status
  + flag pills, counts, timestamps, trend arrows.
- Domain texture (15): content that fits the app's domain (e.g. finance →
  rates / terms / risk / flags / covenants).
- States (10): at least one non-default state where natural (overdue,
  flagged, empty, loading, selected).
- Polish (5): tabular/mono numerics, alignment, restrained accent usage."""

CRITIC_SYSTEM = (
    "You are a senior product-design reviewer auditing a single generated UI "
    "screen for RICHNESS and realism. You do not rewrite the screen — you "
    "score it and return surgical, high-leverage patch instructions. Be "
    "exacting: a generic, sparse, placeholder-filled screen scores below 50."
)

_CRITIC_INSTRUCTIONS = """\
Audit the screen HTML below against the rubric. Return ONLY a JSON object,
no prose, no code fence:

{{"score": <int 0-100>, "gaps": [
  {{"area": "<short dimension name>",
   "patch_instruction": "<one imperative, surgical change — what to add and where>",
   "severity": "high|med|low"}}
]}}

Rules:
- If the screen already scores >= 85, return it with an empty "gaps" array.
- Each patch_instruction must be concrete and additive ("Add a 6-column
  delinquency table with named borrowers, balances, days-past-due, and a
  red/amber status pill"), never vague ("make it richer").
- Order gaps by impact. Return at most 5 gaps.
- Do NOT ask to change the colour palette, fonts, or the shell/nav — only
  content richness, density, and detail.

RUBRIC:
{rubric}

SCREEN HTML:
{html}"""

ENRICH_SYSTEM = (
    "You are a front-end engineer applying a reviewer's targeted patches to an "
    "existing HTML screen. You make ONLY the requested changes and reproduce "
    "everything else verbatim. You never restyle the palette, fonts, or shell."
)

_ENRICH_INSTRUCTIONS = """\
Apply EVERY patch below to the HTML screen. Modify only what the patches
describe; reproduce all other markup, classes, inline styles, and the shell
EXACTLY as given. Keep using the existing CSS variables / classes — do not
introduce a new palette or restructure the layout.

Return ONLY the full updated HTML (the same outer element you were given),
no prose, no code fence, no JSON.

PATCHES (apply in order, highest impact first):
{patches}

CURRENT HTML:
{html}"""

# Cap the html we feed the critic/enrich prompts. Matches the DNA extractor's
# ceiling — beyond this the model can't act on the tail anyway.
_HTML_PROMPT_CAP = 60_000


def build_critic_prompt(html: str) -> str:
    capped = html if len(html) <= _HTML_PROMPT_CAP else html[:_HTML_PROMPT_CAP]
    return _CRITIC_INSTRUCTIONS.format(rubric=RICHNESS_RUBRIC, html=capped)


def build_enrich_prompt(html: str, gaps: list[Gap]) -> str:
    capped = html if len(html) <= _HTML_PROMPT_CAP else html[:_HTML_PROMPT_CAP]
    lines = [f"{i + 1}. [{g.severity}] {g.patch_instruction}" for i, g in enumerate(gaps)]
    return _ENRICH_INSTRUCTIONS.format(patches="\n".join(lines), html=capped)


def _strip_fence(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


def parse_critique(raw: str | None) -> Critique | None:
    """Tolerantly parse the critic's JSON. Returns None on anything malformed
    so the loop degrades to the current draft (never crashes generation)."""
    if not raw or not raw.strip():
        return None
    text = _strip_fence(raw)
    # Pull the first {...} object if the model wrapped it in prose.
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        text = text[start : end + 1]
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("score"), int):
        return None
    gaps: list[Gap] = []
    for g in data.get("gaps", []) or []:
        if not isinstance(g, dict):
            continue
        instr = (g.get("patch_instruction") or "").strip()
        if not instr:
            continue
        gaps.append(
            Gap(
                area=(g.get("area") or "general").strip(),
                patch_instruction=instr,
                severity=(g.get("severity") or "med").strip().lower(),
            )
        )
    return Critique(score=int(data["score"]), gaps=gaps)
