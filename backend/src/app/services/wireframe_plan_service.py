"""Inference + edit logic for the wireframe-plan feature.

Two responsibilities:
1. **Infer** — given a brief, classify into archetypes + extract domain
   screens via a single LLM call (DeepSeek for cost), assemble the
   tiered plan, persist to `session.diagram_state.wireframe.plan`.
2. **Patch** — apply user edits (rename, retier, add, remove) to the
   stored plan, returning the new state.

The service is provider-agnostic: it depends on `get_ai_client_for_role`
+ the `"plan"` role registered in `_ROLE_DEFAULTS`. Swap the default
provider in `_ROLE_DEFAULTS` (or set `ROLE_PLAN_PROVIDER` at runtime)
without touching this module.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..schemas.wireframe_plan import (
    PlanPatchRequest,
    ScreenPlan,
    WireframePlan,
)
from .ai_provider import get_ai_client_for_role
from .screen_archetypes import (
    ARCHETYPE_NAMES,
    ARCHETYPES,
    union_screens,
)

logger = logging.getLogger(__name__)


_INFER_SYSTEM = """You design the screen plan for a software product from a single brief.
You think in terms of WHAT THIS SPECIFIC APP NEEDS, not generic templates.
Return ONLY a JSON object — no prose, no markdown fences."""


def _build_infer_prompt(brief: str, device: str) -> str:
    """Build the inference prompt.

    Past versions gave the LLM a fixed archetype table and unioned its
    base screens onto the user's named ones. Result: a Sentinel
    user-management brief got "Record Detail" and "Workspace" bolted on,
    which the wireframe pipeline then rendered as a generic project
    record / kanban. The screens were no longer about the user's app.

    New shape: archetypes act as REFERENCE for the kinds of surfaces an
    app like this usually contains (auth, settings, list, detail,
    overlays). The LLM is responsible for synthesising the COMPLETE,
    DOMAIN-CONTEXTUALISED screen list. No bolting-on, no generic
    "List View" leakage.
    """
    archetype_list = "\n".join(f"  - {a}" for a in ARCHETYPE_NAMES)

    # Light-touch reference — show one or two archetype base sets
    # inline so the LLM sees what "kinds of screens" are typical, not
    # so it copies them. Keeping the block small keeps DeepSeek-fast
    # output tight; the model is told to TRANSLATE these into the
    # brief's domain, not to mirror them.
    sample_arch_lines: list[str] = []
    for ref in ("b2b-saas", "b2b-admin", "consumer-content"):
        screens = ARCHETYPES.get(ref, [])
        if not screens:
            continue
        names = ", ".join(s["name"] for s in screens[:5])
        sample_arch_lines.append(f"  - {ref}: usually has things like {names}")
    sample_arch_block = "\n".join(sample_arch_lines)

    return f"""Brief:
{brief.strip()}

Target device: {device}

Your job: produce the COMPLETE screen plan for THIS specific app.

Step 1 — Pick 1–3 archetypes that best classify the brief (ranked by relevance, 0..1).
Available archetypes:
{archetype_list}

Step 2 — Produce the FULL screen list for this app. For each screen:
  - id (snake_case, no spaces) — domain-specific (e.g. "user_detail" not "record_detail")
  - name (Title Case, short) — labelled IN THE BRIEF'S DOMAIN, not generic
  - intent (ONE sentence describing what this screen does FOR THIS APP)
  - kind ∈ ("screen" | "modal" | "drawer" | "popover" | "landing")
    Use "landing" for ONE-page long-scroll surfaces (marketing landing pages,
    blog/article reading views, long-form sales pages). The whole page —
    every section listed in the brief — collapses into a SINGLE landing
    screen, not one screen per section.
  - tier ∈ ("hero" | "secondary" | "optional")
  - nav_visible (bool) — TRUE for surfaces that belong in the app's primary
    nav (sidebar / tab-bar). FALSE for drill-in details (e.g. User Detail
    accessed by clicking a row), auth screens (Login, Forgot Password),
    onboarding/welcome flows, profile pages accessed via avatar menu, and
    any screen reached only from another screen's interactive element.
    Default to TRUE for top-level destinations a user navigates to from
    the nav itself. A typical B2B admin tool has 4–6 nav_visible screens,
    not 10.

Hard rules — read carefully:
- DO NOT copy archetype-template names verbatim. "List View" / "Record Detail" / "Workspace" / "Item Detail"
  are *patterns*, not screens. Translate them. For a user-management app:
  the "list" is "Users Dashboard"; the "detail" is "User Profile"; "workspace"
  may not even apply.
- Cover everything the brief explicitly names — surfaces (modals, drawers, screens) the user described
  MUST appear with that wording, that kind. Don't drop them.
- KIND DEFAULT — drawer/modal over screen (mandatory): Detail / drill-in / configure-record surfaces
  default to `kind="drawer"` (or `kind="modal"` for very short tasks like confirm / post payment).
  Reserve `kind="screen"` for surfaces a user navigates TO from the primary nav. Concrete:
    • "X Detail" / "View X" / "X Profile" / "Member Profile" / "User Profile" / "Loan Detail" /
      "Borrower Profile" / "Order Detail" / "Patient Record"  →  kind="drawer", nav_visible=false
      (slides in over the list/dashboard the user came from; they keep their context)
    • "Edit X" / "Configure X" / "Change role"  →  kind="drawer", nav_visible=false
    • "Confirm X" / "Suspend X" / "Delete X" / "Charge off"  →  kind="modal", nav_visible=false
    • "Post payment" / "Quick action" / "Send invite" — short single-purpose forms  →  kind="modal"
    • "Multi-step wizard / application" — multi-page form  →  kind="drawer" with progress rail
    • Top-level operational surfaces (Dashboard, Workspace, Queue, Pipeline, Reports, Settings,
      Compliance, Audit Log)  →  kind="screen", nav_visible=true
    • Auth (Sign in / Sign up / Reset)  →  kind="screen", nav_visible=false
  ONLY override the default when the brief explicitly says "Loan detail page" or "User detail screen"
  (with the literal word "page" or "screen"). If the brief just says "Loan detail" or "User profile",
  default to drawer.
- LANDING PAGES are ONE screen, not many. If the brief describes a long-scroll page where all sections
  share the same URL — Hero, Social Proof, How It Works, Feature Grid, Pricing, Testimonials, FAQ, Final
  CTA, Footer, etc. — emit ONE screen with kind="landing" whose `intent` lists ALL the sections it must
  contain. Do NOT split sections into separate screens. The ONLY time a marketing-site section deserves
  its own screen is when clicking it navigates away (separate Pricing page, separate /docs, etc.).
- Add the surfaces a complete app would have but the brief didn't name (auth, settings, profile,
  notifications, etc.) ONLY if they make sense for this domain.
- Tier honestly: hero = the 3–6 surfaces a user opens daily; secondary = supporting (auth, settings,
  audit log, billing); optional = onboarding/empty-states/edge-cases.
- Aim for 8–14 screens total. Don't pad.

Reference — what these archetypes usually contain (translate, don't copy):
{sample_arch_block}

Output shape:
{{"archetypes":[["b2b-admin",0.9]],"screens":[
  {{"id":"users_dashboard","name":"Users Dashboard","intent":"Searchable table of every user with status, role, last login, risk flags","kind":"screen","tier":"hero","nav_visible":true}},
  {{"id":"user_detail","name":"User Detail","intent":"Full audit trail for one user — recent logins, role changes, accessed resources, MFA status","kind":"screen","tier":"hero","nav_visible":false}},
  {{"id":"login","name":"Login","intent":"Email + SSO entry","kind":"screen","tier":"secondary","nav_visible":false}},
  ...
]}}

Return ONLY the JSON object."""


def _strip_fences(raw: str) -> str:
    s = (raw or "").strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()
    return s


def _coerce_archetype_pairs(value: Any) -> list[tuple[str, float]]:
    """Normalize the LLM's archetype list into [(name, confidence)] pairs.

    Models occasionally emit `[{"name":..,"confidence":..}]` instead of
    the requested tuple shape; tolerate both.
    """
    if not isinstance(value, list):
        return []
    out: list[tuple[str, float]] = []
    for entry in value:
        if isinstance(entry, list | tuple) and len(entry) >= 2:
            name, conf = entry[0], entry[1]
        elif isinstance(entry, dict):
            name = entry.get("name") or entry.get("archetype") or entry.get("id")
            conf = entry.get("confidence") or entry.get("score") or 0.0
        else:
            continue
        if not isinstance(name, str):
            continue
        if name not in ARCHETYPE_NAMES:
            continue
        try:
            conf_f = float(conf)
        except (TypeError, ValueError):
            conf_f = 0.0
        out.append((name, conf_f))
    return out


def _coerce_screen(entry: Any, *, archetype_source: str | None) -> ScreenPlan | None:
    """Normalise an LLM-emitted screen entry into a ScreenPlan.

    Caller passes archetype_source so the screen carries provenance
    (used purely for badge display on the plan card; the screen itself
    is treated as fully synthesised from the brief).
    """
    if not isinstance(entry, dict):
        return None
    sid = entry.get("id") or entry.get("slug")
    name = entry.get("name") or entry.get("label")
    intent = entry.get("intent") or entry.get("description") or ""
    if not isinstance(sid, str) or not isinstance(name, str):
        return None
    kind_raw = entry.get("kind", "screen")
    kind = kind_raw if kind_raw in ("screen", "modal", "drawer", "popover", "landing") else "screen"
    # Force-upgrade: if the screen's own name contains "landing", it IS a
    # landing page even if the LLM emitted kind="screen". Catches Opus
    # ignoring the new enum value.
    if kind == "screen" and _LANDING_NAME_RE.search(name or ""):
        kind = "landing"
    # Force-convert: single-record drill-in surfaces ("Loan Detail",
    # "Borrower Profile", "User Profile") default to drawer, not screen.
    # They're accessed by clicking a row on a list/dashboard — making
    # them separate screens forces them into the sidebar nav, which is
    # the wrong UX. Skip when the name explicitly says "page"/"view".
    if kind == "screen" and _DRILL_DRAWER_RE.search(name or ""):
        kind = "drawer"
    # Same for confirm/edit micro-tasks → modal.
    if kind == "screen" and _DRILL_MODAL_RE.search(name or ""):
        kind = "modal"
    tier_raw = entry.get("tier", "secondary")
    tier = tier_raw if tier_raw in ("hero", "secondary", "optional") else "secondary"
    # nav_visible: trust an explicit boolean from the LLM; otherwise apply
    # a conservative heuristic — drill-in / auth / onboarding screens are
    # not nav destinations even if the LLM forgot to flag them.
    nv_raw = entry.get("nav_visible")
    if isinstance(nv_raw, bool):
        nav_visible = nv_raw
    else:
        nav_visible = _heuristic_nav_visible(name, kind)
    return ScreenPlan(
        id=sid.strip().lower().replace(" ", "_").replace("/", "_"),
        name=name.strip(),
        intent=intent.strip(),
        kind=kind,
        tier=tier,
        archetype_source=archetype_source,
        domain_source=True,
        status="pending",
        nav_visible=nav_visible,
    )


_NON_NAV_TOKENS = re.compile(
    r"\b(detail|profile|login|sign\s*in|sign\s*up|register|signup|forgot|reset\s*password|"
    r"onboarding|welcome|edit|create|new|verify|verification|setup|set\s*up)\b",
    re.IGNORECASE,
)


# Tokens that signal a screen is really a SECTION of a long-scroll landing
# page, not a standalone surface. Used by `_collapse_landing_sections` to
# detect when the LLM emitted `Hero` / `Pricing` / `FAQ` / etc. as separate
# screens instead of one landing page — which it does often despite the
# explicit prompt rule.
_LANDING_SECTION_TOKENS = re.compile(
    r"\b(hero|social\s*proof|logo\s*strip|how\s+it\s+works|how\s+\w+\s+works|"
    r"feature\s+grid|features?\s+section|pricing\s+section|pricing|testimonials?|"
    r"faq|cta\s+banner|final\s+cta|footer|problem\s+statement)\b",
    re.IGNORECASE,
)

# A screen whose own name contains "landing page" / "landing" SHOULD be
# kind="landing" — but Opus often emits kind="screen" because the new enum
# value is unfamiliar. Force-upgrade it on the way in.
_LANDING_NAME_RE = re.compile(r"\blanding(\s*page)?\b", re.IGNORECASE)

# Names that scream "single-record drill-in" — these belong as drawers,
# not separate screens. Opus often defaults to kind="screen" because the
# brief inflected them that way ("Loan detail screen"); we force-convert
# unless the user explicitly said "page" / "view" in the screen name.
_DRILL_DRAWER_RE = re.compile(
    r"\b(detail|profile)\b(?!.*\b(page|view|listing|list)\b)",
    re.IGNORECASE,
)
# Single-purpose confirm/edit micro-tasks → modal. Same defaulting logic.
_DRILL_MODAL_RE = re.compile(
    r"\b(confirm|suspend|delete|cancel|approve|post\s+payment|send\s+invite)\b(?!.*\b(page|view|workflow)\b)",
    re.IGNORECASE,
)


def _collapse_landing_sections(screens: list[ScreenPlan]) -> list[ScreenPlan]:
    """If the LLM emitted multiple landing-section screens (Hero, Pricing,
    FAQ, etc.) instead of one landing page, collapse them into a single
    `kind=landing` screen whose intent enumerates the sections.

    Trigger: 3+ section-named screens in the plan AND no existing
    kind=landing screen. We're conservative — only collapse when the
    pattern is unmistakable, otherwise app-style screens with section-y
    names ("Pricing" page in a SaaS dashboard) get incorrectly merged.
    """
    section_screens = [s for s in screens if _LANDING_SECTION_TOKENS.search(s.name)]
    if len(section_screens) < 3:
        return screens
    if any(s.kind == "landing" for s in screens):
        # Already have a landing page — leave the section screens as-is;
        # they're probably legitimate dashboard sections, not page sections.
        return screens

    section_ids = {s.id for s in section_screens}
    sections_intent = "; ".join(s.name for s in section_screens)

    # Build the synthesised landing screen. Reuse the first section's
    # archetype_source so the badge stays meaningful.
    landing = ScreenPlan(
        id="landing_page",
        name="Landing Page",
        intent=(
            f"One long-scroll marketing page containing the following sections, in order: "
            f"{sections_intent}. Render every section stacked vertically inside a single "
            f"landing-kind frame, not as separate screens."
        ),
        kind="landing",
        tier="hero",
        archetype_source=section_screens[0].archetype_source,
        domain_source=True,
        status="pending",
        nav_visible=False,
    )
    kept = [s for s in screens if s.id not in section_ids]
    return [landing, *kept]


def _heuristic_nav_visible(name: str, kind: str) -> bool:
    """Best-effort guess when the LLM didn't supply nav_visible.

    Modals / drawers / popovers are never in the nav. Screens whose name
    contains drill-in / auth / onboarding tokens default to non-nav.
    Anything else stays nav-visible.
    """
    if kind != "screen":
        return False
    if _NON_NAV_TOKENS.search(name or ""):
        return False
    return True


def _fallback_archetype_plan(
    archetypes: list[tuple[str, float]],
    *,
    confidence_floor: float = 0.4,
) -> list[ScreenPlan]:
    """Safety net: when the LLM ships zero parseable screens, fall back
    to the chosen archetypes' base sets so the plan card still renders
    something rather than going empty. Generic names — but better than
    a blank plan that breaks downstream generation.
    """
    chosen = [aid for aid, conf in archetypes if conf >= confidence_floor]
    if not chosen and archetypes:
        chosen = [archetypes[0][0]]
    base = union_screens(chosen)
    primary = chosen[0] if chosen else None
    return [
        ScreenPlan(
            id=s["id"],
            name=s["name"],
            intent=s["intent"],
            kind=s["kind"],
            tier=s["tier"],
            archetype_source=primary,
            domain_source=False,
            status="pending",
        )
        for s in base
    ]


async def infer_plan(
    brief: str,
    device: str,
    *,
    org_id: str | None,
    db: AsyncSession,
) -> WireframePlan:
    """Call the LLM, parse, return the plan (no persistence).

    The LLM is fully responsible for the screen list — synthesised from
    the brief with archetypes only as classification + reference. We
    don't union archetype base sets onto the result anymore: that was
    leaking generic "Record Detail" / "Workspace" naming into bespoke
    apps.
    """
    ai = await get_ai_client_for_role(org_id, db, "plan")
    prompt = _build_infer_prompt(brief, device)
    raw, in_tok, out_tok = await ai.chat_with_full_usage(
        system=_INFER_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        # Bumped from 900 — the new prompt asks for 8-14 fully-described
        # screens (id + name + intent + kind + tier each), which can run
        # ~1.6k tokens for a complete reply.
        max_tokens=2400,
        temperature=0.2,
    )
    logger.info(
        "[wireframe-plan] inferred via %s (in=%d out=%d) brief_chars=%d",
        ai.model,
        in_tok,
        out_tok,
        len(brief),
    )
    cleaned = _strip_fences(raw)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("[wireframe-plan] LLM returned non-JSON, falling back to b2b-saas archetype")
        parsed = {"archetypes": [["b2b-saas", 0.5]], "screens": []}
    archetypes = _coerce_archetype_pairs(parsed.get("archetypes"))
    if not archetypes:
        archetypes = [("b2b-saas", 0.5)]
    primary_archetype = archetypes[0][0] if archetypes else None

    # New top-level key is `screens`; tolerate the legacy `domain_screens`
    # for any cached/old prompts that still ship the previous shape.
    raw_screens = parsed.get("screens")
    if not isinstance(raw_screens, list):
        raw_screens = parsed.get("domain_screens") or []
    screens: list[ScreenPlan] = []
    seen_ids: set[str] = set()
    for entry in raw_screens if isinstance(raw_screens, list) else []:
        sp = _coerce_screen(entry, archetype_source=primary_archetype)
        if sp and sp.id not in seen_ids:
            seen_ids.add(sp.id)
            screens.append(sp)

    if not screens:
        # LLM emitted nothing parseable — fall back to the archetype
        # base set so the plan card has *something* and the user can
        # rename / delete from there.
        logger.warning("[wireframe-plan] LLM produced 0 usable screens; falling back to archetype base set")
        screens = _fallback_archetype_plan(archetypes)

    # Belt-and-braces: even with the explicit prompt rule, Opus regularly
    # emits Hero / Pricing / FAQ / Footer as separate screens for a
    # marketing landing brief. Collapse them into one kind=landing screen.
    pre_collapse = len(screens)
    screens = _collapse_landing_sections(screens)
    if len(screens) != pre_collapse:
        logger.info(
            "[wireframe-plan] collapsed %d landing sections into one landing screen",
            pre_collapse - len(screens),
        )

    now = datetime.now(UTC)
    return WireframePlan(
        archetypes=archetypes,
        screens=screens,
        inferred_at=now,
        last_edited_at=now,
    )


def _diagram_state_with_plan(state: dict | None, plan: WireframePlan) -> dict:
    new_state = dict(state or {})
    wf = dict(new_state.get("wireframe") or {})
    wf["plan"] = json.loads(plan.model_dump_json())
    new_state["wireframe"] = wf
    return new_state


def get_plan(state: dict | None) -> WireframePlan | None:
    if not isinstance(state, dict):
        return None
    wf = state.get("wireframe")
    if not isinstance(wf, dict):
        return None
    raw = wf.get("plan")
    if not isinstance(raw, dict):
        return None
    try:
        return WireframePlan.model_validate(raw)
    except Exception:
        return None


def select_for_generation(
    plan: WireframePlan,
    *,
    tier: str | None = None,
    screen_ids: list[str] | None = None,
) -> list[ScreenPlan]:
    """Pick the screens that a Phase-3 generate call should produce.

    Always excludes `status="removed"` screens. If `screen_ids` is given,
    that set wins. Else if `tier` is given, all non-removed screens at
    that tier. Else all non-removed screens.
    """
    active = [s for s in plan.screens if s.status != "removed"]
    if screen_ids:
        wanted = set(screen_ids)
        return [s for s in active if s.id in wanted]
    if tier and tier != "all":
        return [s for s in active if s.tier == tier]
    return active


def mark_screens_status(
    plan: WireframePlan,
    screen_ids: list[str],
    status: str,
) -> WireframePlan:
    """Set `status` on the named screens, leaving everything else alone."""
    if not screen_ids:
        return plan
    wanted = set(screen_ids)
    new_screens: list[ScreenPlan] = []
    changed = False
    for s in plan.screens:
        if s.id in wanted and s.status != status:
            new_screens.append(s.model_copy(update={"status": status}))
            changed = True
        else:
            new_screens.append(s)
    if not changed:
        return plan
    return WireframePlan(
        archetypes=plan.archetypes,
        screens=new_screens,
        inferred_at=plan.inferred_at,
        last_edited_at=datetime.now(UTC),
    )


def merge_pipeline_entries(
    plan: WireframePlan,
    entries: list[dict],
    *,
    default_tier: str = "secondary",
) -> tuple[WireframePlan, list[str]]:
    """Merge `[{name, kind, trigger_from?}]` entries (from chat-driven
    preflight) into the plan, returning the new plan + the ids of
    entries that were newly added.

    - Existing plan entries (by slug-id) are bumped to `status="approved"`
      so the card visualises that they were re-affirmed by chat.
    - New entries are appended with `domain_source=True`,
      `tier=default_tier`, `status="approved"`.
    """
    if not entries:
        return plan, []

    def _slug(name: str) -> str:
        return (name or "").strip().lower().replace(" ", "_").replace("/", "_")

    by_id: dict[str, ScreenPlan] = {s.id: s for s in plan.screens}
    added: list[str] = []
    changed = False
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        sid = _slug(name)
        kind_raw = entry.get("kind", "screen")
        kind = kind_raw if kind_raw in ("screen", "modal", "drawer", "popover") else "screen"
        intent = entry.get("trigger_from") or entry.get("intent") or ""
        if sid in by_id:
            existing = by_id[sid]
            if existing.status not in ("approved", "generated"):
                by_id[sid] = existing.model_copy(update={"status": "approved"})
                changed = True
        else:
            # Default nav_visible from the entry if supplied, else
            # heuristic (drill-in / auth / overlay defaults to false).
            _nv_raw = entry.get("nav_visible")
            _nv = _nv_raw if isinstance(_nv_raw, bool) else _heuristic_nav_visible(name, kind)
            by_id[sid] = ScreenPlan(
                id=sid,
                name=name.strip(),
                intent=str(intent).strip(),
                kind=kind,
                tier=default_tier,
                archetype_source=None,
                domain_source=True,
                status="approved",
                nav_visible=_nv,
            )
            added.append(sid)
            changed = True
    if not changed:
        return plan, []
    return WireframePlan(
        archetypes=plan.archetypes,
        screens=list(by_id.values()),
        inferred_at=plan.inferred_at,
        last_edited_at=datetime.now(UTC),
    ), added


def screens_to_pipeline_entries(screens: list[ScreenPlan]) -> list[dict]:
    """Format planned screens for `_extract_diagram_inline`'s
    `screen_plan_override` parameter.

    The pipeline expects `[{"name": str, "kind": str, "id"?: str, "intent"?: str, "trigger_from"?: str}]`.
    `id` matters: the per-screen pipeline previously derived the screen
    id from `name` only, which silently mismatched the plan's id when
    the LLM picked a slightly different slug (e.g. plan.id="user_detail",
    name-derived="user_detail_screen"). Carrying id forward keeps the
    plan's status reconciliation working end-to-end.
    `intent` matters because without it the per-screen generator only
    sees a name like "Record Detail" and renders a generic version,
    ignoring what the screen is actually FOR in this app.
    """
    out: list[dict] = []
    for s in screens:
        entry: dict = {
            "name": s.name,
            "kind": s.kind,
            "id": s.id,
            "nav_visible": s.nav_visible,
            "tier": s.tier,
        }
        if s.intent:
            entry["intent"] = s.intent
        out.append(entry)
    return out


def patch_plan(plan: WireframePlan, patch: PlanPatchRequest) -> WireframePlan:
    """Apply a list of patches to a plan, returning the new plan.

    - Existing screen with matching id is updated in place
    - Unknown id with `name` + `intent` is appended as a new screen
    - `status="removed"` keeps the entry in the list (so the user can
      restore it) but marks it removed; the generation pipeline filters
      removed entries out
    """
    by_id: dict[str, ScreenPlan] = {s.id: s for s in plan.screens}
    for p in patch.screens:
        existing = by_id.get(p.id)
        if existing is None:
            if p.name and p.intent:
                by_id[p.id] = ScreenPlan(
                    id=p.id,
                    name=p.name,
                    intent=p.intent,
                    kind=p.kind or "screen",
                    tier=p.tier or "secondary",
                    archetype_source=None,
                    domain_source=True,
                    status=p.status or "pending",
                )
            continue
        update_kwargs: dict[str, Any] = {}
        if p.name is not None:
            update_kwargs["name"] = p.name
        if p.intent is not None:
            update_kwargs["intent"] = p.intent
        if p.kind is not None:
            update_kwargs["kind"] = p.kind
        if p.tier is not None:
            update_kwargs["tier"] = p.tier
        if p.status is not None:
            update_kwargs["status"] = p.status
        by_id[p.id] = existing.model_copy(update=update_kwargs)
    return WireframePlan(
        archetypes=plan.archetypes,
        screens=list(by_id.values()),
        inferred_at=plan.inferred_at,
        last_edited_at=datetime.now(UTC),
    )
