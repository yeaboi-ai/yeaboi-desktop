"""Per-style prompt fragments for the ticket-generation wizard.

The wizard splits style into two ORTHOGONAL axes that compose independently:

* **Granularity** (single-select, required) — how many tickets, how big each:
  ``minimal`` / ``balanced`` / ``many_small``. Drives the per-wave count
  guidance the model leans on.
* **Modifiers** (multi-select, 0+ allowed) — functional shape choices that
  combine freely: ``vertical_slices``, ``story_driven``, ``spike_first``,
  ``wave_optimised``, ``follow_practices``. The user can ask for, say,
  "many small + spike-first + user stories" — the three fragments stack.

The base rules (dependency mapping, cross-cutting tasks, wave/sequence
semantics) are orchestrator contracts and live in the wave prompts themselves
— they're not overridable from here.

``balanced`` granularity is a no-op fragment so users who don't pick anything
get exactly today's behaviour.

``follow_practices`` returns a placeholder when no analysed repo profile is
available; callers should pass the profile dict from
``repo_conventions_analyzer`` via :func:`compose_style_block` to get the
real fragment rendered.
"""

from __future__ import annotations

import logging
import re
from typing import Literal

logger = logging.getLogger(__name__)

# Collapses any run of whitespace (newlines, tabs, repeated spaces) to a
# single space. Used by render_follow_practices_fragment to neutralise
# prompt-injection attempts hidden in PR/issue titles.
_SCRUB_WS_RE = re.compile(r"\s+")

# Logged when a single generation stacks this many modifiers — useful to
# spot if real users actually pile the whole menu on, which would bloat the
# wave prompt. Not enforced; just observability.
_HEAVY_STACK_THRESHOLD = 6

# ── axis 1: granularity (mutually exclusive) ────────────────────────────────

GRANULARITY_SLUGS: tuple[str, ...] = ("minimal", "balanced", "many_small")
DEFAULT_GRANULARITY: str = "balanced"

# ── axis 2: modifiers (0+ allowed, compose freely) ──────────────────────────

MODIFIER_SLUGS: tuple[str, ...] = (
    # shape — how tickets are framed
    "vertical_slices",
    "story_driven",
    "spike_first",
    "wave_optimised",
    "follow_practices",
    # quality — production readiness
    "test_driven",
    "docs_bundled",
    "observability_first",
    "release_ready",
    # risk & compliance
    "risk_mitigated",
    "compliance_aware",
    "accessibility",
    # methodology
    "mvp_first",
    "gherkin_ac",
    "api_contract_first",
    "demo_waves",
)

# ── backwards-compat alias — the legacy "style" was a single slug from the
# union of both axes. New code should use granularity + modifiers, but tests
# and the get_style_fragment helper still reference the combined set.
STYLE_SLUGS: tuple[str, ...] = GRANULARITY_SLUGS + MODIFIER_SLUGS

StyleSlug = Literal[
    "minimal",
    "balanced",
    "many_small",
    "vertical_slices",
    "story_driven",
    "spike_first",
    "wave_optimised",
    "follow_practices",
]

DEFAULT_STYLE: StyleSlug = "balanced"


# Per-style prompt fragments. Each fragment is rendered into the wave prompt
# under a clearly-labelled ``STYLE GUIDANCE`` block, between the base rules
# and the ticket-template block. Keep them short — they're additive guidance,
# not full prompts.
STYLE_FRAGMENTS: dict[str, str] = {
    "minimal": (
        "STYLE GUIDANCE — minimal (few, larger tickets):\n"
        "- Target 3–6 total tickets across the whole plan. Aim for the lower end "
        "of every per-wave count.\n"
        "- Each ticket may span 3–5 days of work — merge related work into a "
        "single ticket rather than splitting.\n"
        "- Prefer 5- or 8-point story sizes; avoid 1s and 2s unless genuinely tiny.\n"
        "- Acceptance criteria can be slightly higher-level (3–5 bullets) since "
        "each ticket covers more ground."
    ),
    "balanced": "",  # No-op — today's default behaviour.
    "many_small": (
        "STYLE GUIDANCE — many small tickets:\n"
        "- Target 20–40 total tickets across the plan. Split aggressively at every "
        "natural seam: per endpoint, per screen, per validation rule, per migration step.\n"
        "- Each ticket should be ≤1 day of work — prefer 1- or 2-point story sizes; "
        "never go above 3.\n"
        "- Acceptance criteria stay tight (2–3 bullets) and each describes one "
        "observable outcome."
    ),
    "vertical_slices": (
        "STYLE GUIDANCE — vertical slices:\n"
        "- Every ticket must deliver END-TO-END value: a thin slice through UI, "
        "API, and DB together where applicable. Avoid frontend-only or backend-only "
        "tickets unless the work genuinely has no opposite side.\n"
        "- Acceptance criteria must include at least one user-observable outcome "
        "(what they can DO) and at least one persisted/integration outcome (what "
        "actually changes in the system).\n"
        "- Plays well with the autonomous orchestrator's 1-ticket = 1-PR model — "
        "each ticket should be a self-contained mergeable unit."
    ),
    "story_driven": (
        "STYLE GUIDANCE — user stories:\n"
        "- Title each ticket in the form \"As a <role>, I want <capability>, so that "
        "<outcome>.\" Use the personas from the blueprint if present, otherwise infer "
        "a sensible role (user / admin / developer).\n"
        "- Acceptance criteria are framed as observable user outcomes, not "
        "implementation steps — \"User sees X\" / \"System persists Y\" rather than "
        "\"Add Z to the controller.\"\n"
        "- Technical-debt or infrastructure tickets that don't fit the As-a/I-want "
        "shape may use an imperative title instead, but should be the minority."
    ),
    "spike_first": (
        "STYLE GUIDANCE — spike-first:\n"
        "- For each genuine unknown in the blueprint (\"open questions\", "
        "ambiguous architecture, unproven integrations), emit a SPIKE ticket "
        "BEFORE any implementation ticket that depends on the answer.\n"
        "- Tag spikes with the label \"spike\" and cap story points at 2.\n"
        "- Spike acceptance criteria describe a documented decision or written "
        "recommendation — not shipped code.\n"
        "- Implementation tickets that follow a spike should depend on it via "
        "``depends_on_indices``."
    ),
    "wave_optimised": (
        "STYLE GUIDANCE — wave-optimised for the autonomous orchestrator:\n"
        "- Maximise the number of WAVE 0 tickets (no dependencies). Aggressively "
        "look for work that can run in parallel — scaffolding, schema design, "
        "auth setup, infrastructure, design-system pieces — and emit each as a "
        "standalone wave-0 ticket.\n"
        "- Be EXTREMELY conservative with ``depends_on_indices``. Only add a "
        "dependency when one ticket literally cannot start until another is "
        "merged. When in doubt, leave deps empty.\n"
        "- Avoid sequencing tickets just because they're \"related\" — that's what "
        "``related_to_indices`` is for, and it does not block parallel execution."
    ),
    "spike_first_legacy_marker": "",  # placeholder to keep grep tests honest; unused
    "follow_practices": (
        "STYLE GUIDANCE — follow the team's existing practices:\n"
        "(No repo conventions profile was available — generating with the balanced "
        "default. The wizard should have surfaced a warning if you see this.)"
    ),
    # ── quality / production-readiness ───────────────────────────────────────
    "test_driven": (
        "STYLE GUIDANCE — test-driven:\n"
        "- Every implementation ticket must include at least one acceptance "
        "criterion that describes a test (\"Unit test covers …\", \"E2E test "
        "verifies …\"). Treat untested features as not done.\n"
        "- For non-trivial features, emit a paired \"Add tests for <feature>\" "
        "ticket sitting alongside the implementation. Tag those tickets with "
        "the \"testing\" label and 1–2 story points.\n"
        "- Bug-fix tickets must include a regression test acceptance criterion."
    ),
    "docs_bundled": (
        "STYLE GUIDANCE — docs bundled:\n"
        "- Every ticket touching a user-facing surface (API endpoint, UI screen, "
        "config flag) must include a \"docs updated\" acceptance criterion "
        "naming the doc that changes.\n"
        "- For each new public surface, emit a dedicated documentation ticket "
        "(README section, API reference page, changelog entry) tagged \"docs\" "
        "with 1–2 story points.\n"
        "- Internal-only refactors don't need docs tickets — keep it user-facing."
    ),
    "observability_first": (
        "STYLE GUIDANCE — observability-first:\n"
        "- Every implementation ticket must include logging, metrics, or tracing "
        "acceptance criteria — name the events / counters / spans the work emits "
        "so the team can debug production behaviour without re-deploying.\n"
        "- For each new service or background job, emit a dedicated observability "
        "ticket (dashboard, alert rules, SLO definition) tagged "
        "[\"observability\", \"devops\"].\n"
        "- Error paths must have explicit logging acceptance criteria, not just "
        "happy-path coverage."
    ),
    "release_ready": (
        "STYLE GUIDANCE — release-ready final wave:\n"
        "- The LAST execution wave must contain explicit tickets for: "
        "production deploy, feature-flag rollout plan, monitoring / alerting "
        "configuration, and a documented rollback procedure.\n"
        "- These cross-cutting tickets depend on EVERY implementation ticket "
        "they ship — list all prerequisites in ``depends_on_indices``.\n"
        "- Tag with [\"release\", \"devops\"]. Story points 2–3."
    ),
    # ── risk & compliance ────────────────────────────────────────────────────
    "risk_mitigated": (
        "STYLE GUIDANCE — risk-mitigated:\n"
        "- For each KNOWN risk listed in the blueprint's Risks & Unknowns "
        "section, emit a concrete mitigation ticket — the deliverable is a "
        "mechanism that reduces or contains the risk (timeout, retry, "
        "circuit breaker, graceful-degradation path, kill switch).\n"
        "- Mitigation acceptance criteria must include both the trigger "
        "condition AND the observable safe-state outcome.\n"
        "- Distinct from spike-first: this is for risks the team already "
        "understands, not unknowns needing investigation. Tag \"risk\"."
    ),
    "compliance_aware": (
        "STYLE GUIDANCE — compliance-aware:\n"
        "- When the blueprint's Security & Compliance section is populated, "
        "emit dedicated compliance tickets covering: audit logging of "
        "user actions, encryption at rest and in transit, access control "
        "enforcement, and data-retention / deletion controls.\n"
        "- Tag compliance tickets with [\"compliance\", \"security\"].\n"
        "- Every ticket that touches personal data, secrets, or auth must "
        "include a compliance acceptance criterion (which control or policy "
        "it satisfies)."
    ),
    "accessibility": (
        "STYLE GUIDANCE — accessibility (a11y):\n"
        "- Every UI ticket must include at least one a11y acceptance "
        "criterion — keyboard navigation, screen-reader labels, sufficient "
        "colour contrast, or focus management. Be specific (\"All interactive "
        "elements reachable via Tab\") rather than generic (\"a11y compliant\").\n"
        "- For each major UI surface, emit a dedicated a11y audit ticket "
        "tagged [\"a11y\", \"ui\"] that runs through WCAG AA checks.\n"
        "- Non-UI tickets are unaffected by this guidance."
    ),
    # ── methodology / workflow ───────────────────────────────────────────────
    "mvp_first": (
        "STYLE GUIDANCE — MVP-first:\n"
        "- Order tickets so wave 0 + wave 1 together deliver a DEPLOYABLE v0 — "
        "the smallest end-to-end product that a real user could open and try. "
        "Push polish, edge cases, and \"would be nice\" features into later "
        "waves.\n"
        "- The MVP must include enough auth (even if just a stub), data "
        "persistence, and one primary user flow to be evaluable.\n"
        "- Later-wave tickets describe ENHANCEMENTS to the MVP, not "
        "replacements — preserve the v0 contract."
    ),
    "gherkin_ac": (
        "STYLE GUIDANCE — Gherkin acceptance criteria:\n"
        "- Frame EVERY acceptance criterion as a Given / When / Then "
        "scenario:\n"
        "    Given <preconditions>\n"
        "    When <user or system action>\n"
        "    Then <observable outcome>\n"
        "- Use 2–4 scenarios per ticket. Avoid restating the ticket's title — "
        "scenarios describe observable behaviour the test would assert.\n"
        "- Composes with story_driven (titles) — together they yield BDD-shape "
        "tickets end to end."
    ),
    "api_contract_first": (
        "STYLE GUIDANCE — API-contract-first:\n"
        "- For any feature that crosses a frontend/backend boundary, emit a "
        "DEDICATED API contract ticket FIRST (OpenAPI schema, GraphQL SDL, "
        "or protobuf definition) before any implementation ticket that "
        "consumes the endpoint.\n"
        "- Tag contract tickets with [\"api\", \"contract\"]. 1–2 story points.\n"
        "- Implementation tickets MUST declare the contract ticket as a "
        "prerequisite via ``depends_on_indices``."
    ),
    "demo_waves": (
        "STYLE GUIDANCE — demo-able waves:\n"
        "- Each execution wave must end with at least one ticket whose "
        "acceptance criteria describe a STAKEHOLDER-DEMOABLE artifact — "
        "a screen the user can click through, an API the team can call, "
        "or a chart the PM can look at.\n"
        "- Push purely-internal plumbing into the same wave as the demoable "
        "ticket it serves, not a standalone wave that demos nothing.\n"
        "- Each demo-anchor ticket's description names the audience (\"PM\", "
        "\"design\", \"customer success\") it's meant for."
    ),
}
# Drop the placeholder key — kept above only so the literal block stays readable.
STYLE_FRAGMENTS.pop("spike_first_legacy_marker", None)


def get_style_fragment(style: str, repo_profile: dict | None = None) -> str:
    """Return the prompt fragment for a single style slug (legacy single-axis API).

    For ``follow_practices``, ``repo_profile`` (from
    ``repo_conventions_analyzer``) must be passed to get the real,
    profile-conditioned fragment. Without it, returns a self-deprecating
    placeholder so the model falls back to balanced behaviour rather than
    silently applying nothing.

    Unknown styles fall back to balanced (empty string) — the request-side
    validation should have caught these, but defending in depth.

    New code should prefer :func:`compose_style_block` which stacks a
    granularity choice with N modifiers.
    """
    if style == "follow_practices" and repo_profile:
        return render_follow_practices_fragment(repo_profile)
    return STYLE_FRAGMENTS.get(style, "")


def compose_style_block(
    granularity: str | None = None,
    modifiers: list[str] | None = None,
    repo_profile: dict | None = None,
    fragments_by_slug: dict[str, str] | None = None,
) -> str:
    """Compose the full style-guidance block from a granularity + modifiers pair.

    Order matters for prompt readability: granularity first (sets the
    headline count target), then each modifier in the order the user
    selected them. Empty / unknown slugs are silently skipped so an
    unrecognised modifier never crashes the worker.

    ``follow_practices`` in the modifier list pulls in the repo profile
    when one is supplied; otherwise the placeholder fragment is emitted
    so the model knows it was meant to mirror the repo but the analysis
    didn't land.

    ``fragments_by_slug`` is the iteration-6 path: the wave runner builds
    this dict from the org's editable :class:`GenerationGranularity` +
    :class:`GenerationModifier` rows so admin-customised prompt fragments
    actually reach the LLM. When ``None`` (legacy callers + most tests),
    the function falls back to the system :data:`STYLE_FRAGMENTS` dict,
    preserving pre-iteration-6 behaviour exactly.

    An empty return value (balanced + no modifiers, no repo_profile) means
    "no style guidance at all" — the wave prompt's base rules carry the
    day, matching today's pre-picker behaviour.
    """
    fragments = fragments_by_slug if fragments_by_slug is not None else STYLE_FRAGMENTS

    parts: list[str] = []

    if granularity:
        fragment = fragments.get(granularity, "")
        if fragment:
            parts.append(fragment)
        elif granularity != "balanced":
            # Empty string is the legitimate value for `balanced` (no-op
            # guidance). Any OTHER slug coming back empty means the row was
            # deleted / renamed after the job was dispatched — log so we can
            # spot it in production instead of the model just losing its
            # granularity guidance silently.
            logger.warning(
                "Unknown granularity slug %r — fragment dropped from style block",
                granularity,
            )

    for mod in modifiers or []:
        if not isinstance(mod, str):
            continue
        if mod == "follow_practices":
            # Use the rendered profile when we have one; otherwise the
            # org's (possibly customised) fallback fragment.
            if repo_profile:
                parts.append(render_follow_practices_fragment(repo_profile))
            else:
                fragment = fragments.get("follow_practices", "")
                if fragment:
                    parts.append(fragment)
        else:
            fragment = fragments.get(mod, "")
            if fragment:
                parts.append(fragment)

    block = "\n\n".join(parts)
    if modifiers and len(modifiers) >= _HEAVY_STACK_THRESHOLD:
        logger.info(
            "Style block stacks %d modifiers (%d chars total) — heavy combo",
            len(modifiers),
            len(block),
        )
    return block


def render_follow_practices_fragment(profile: dict) -> str:
    """Render a ``follow_practices`` fragment from a repo-conventions profile.

    Profile shape comes from ``repo_conventions_analyzer.extract_profile()``:
    ``title_format``, ``typical_title_length_chars``, ``size_distribution``,
    ``common_labels``, ``commit_prefix_convention``,
    ``acceptance_criteria_style``, ``summary_sentence``.

    Missing keys degrade gracefully — we only render the lines we have data
    for. Always include the ``summary_sentence`` since the analyzer emits it
    as a human-readable one-liner.
    """
    # Repo-derived strings (summary_sentence, commit_prefix, label names)
    # originate from PR/issue/commit titles — attacker-influenceable content.
    # Strip newlines + truncate before interpolation so a crafted PR title
    # can't sneak prompt-injection markers ("Now ignore prior instructions…")
    # into the wave prompt. The LLM-extraction step is one layer of
    # normalization already; this is the second.
    def _scrub(s: object, max_len: int) -> str:
        return _SCRUB_WS_RE.sub(" ", str(s)).strip()[:max_len]

    lines: list[str] = [
        "STYLE GUIDANCE — follow this team's existing practices, inferred from "
        "their linked GitHub repo:",
    ]
    summary = _scrub(profile.get("summary_sentence") or "", 240)
    if summary:
        lines.append(f"- Overall: {summary}")

    title_format = profile.get("title_format")
    title_examples = {
        "semantic_commit": '"feat: add invite emails", "fix: prevent duplicate session join"',
        "imperative": '"Add invite email templates", "Prevent duplicate session join"',
        "sentence": '"Invite emails should be sent on team join."',
        "as_a_user": '"As a team admin, I want to invite teammates via email…"',
    }
    if title_format in title_examples:
        lines.append(
            f"- Title format: {title_format}. Example shape: "
            f"{title_examples[title_format]}."
        )

    typical_len = profile.get("typical_title_length_chars")
    if isinstance(typical_len, int) and typical_len > 0:
        lines.append(
            f"- Aim for ~{typical_len}-character titles (matches the team's "
            "median PR/issue title length)."
        )

    commit_prefix = _scrub(profile.get("commit_prefix_convention") or "", 80)
    if commit_prefix:
        lines.append(
            f"- The team uses commit/PR prefixes: {commit_prefix}. Mirror this "
            "in titles where appropriate."
        )

    common_labels = profile.get("common_labels") or []
    if isinstance(common_labels, list) and common_labels:
        joined = ", ".join(_scrub(label, 32) for label in common_labels[:10] if str(label).strip())
        if joined:
            lines.append(
                f"- Pull labels from the team's actual taxonomy when they fit: {joined}."
            )

    size_dist = profile.get("size_distribution") or {}
    if isinstance(size_dist, dict) and size_dist:
        # Pick the dominant bucket — that's the team's de-facto target size.
        dominant = max(size_dist.items(), key=lambda kv: kv[1] if isinstance(kv[1], (int, float)) else 0)[0]
        size_to_guidance = {
            "small": "Lean toward small tickets (≤1 day, 1–2 story points).",
            "medium": "Lean toward medium tickets (1–3 days, 2–5 story points).",
            "large": "Lean toward larger tickets (3+ days, 5–8 story points).",
        }
        if dominant in size_to_guidance:
            lines.append(f"- Ticket size: {size_to_guidance[dominant]}")

    ac_style = profile.get("acceptance_criteria_style")
    ac_guidance = {
        "checklist": "- Acceptance criteria: short imperative checklist items.",
        "gherkin": "- Acceptance criteria: Given/When/Then Gherkin-style.",
        "none": "- The team rarely writes explicit AC — keep them terse (2 bullets max).",
    }
    if ac_style in ac_guidance:
        lines.append(ac_guidance[ac_style])

    return "\n".join(lines)
