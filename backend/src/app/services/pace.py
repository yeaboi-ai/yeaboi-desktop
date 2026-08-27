"""Per-session pace control — caps how many questions a persona asks before
recommending a hand-off to another persona.

Today the agent feels like "the only persona in the room": the prompt-level
rules about follow-up depth ("Max 2 follow-up questions per topic") are not
enforced, and `compute_persona_suggestion` only fires when the current
persona has hit 95% coverage of their focus areas — a bar rarely reached in
practice. Pace introduces three discrete budgets (Fast/Balanced/Deep) and
surfaces the persona-switch chip when the budget is spent, regardless of
coverage.

Storage shape:
- ``ai_config["pace"]``: "fast" | "balanced" | "deep" (default "balanced")
- ``agent_runtime_state["persona_stats"][persona_slug]``: ``{questions_asked: int, last_active_at: float}``

The chat path (facilitator.py) and voice path (worker.py) both import from
here so the budgets, prompt directive, and handoff logic stay in one place.
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)


PACE_BUDGETS: dict[str, dict[str, int]] = {
    "fast": {"questions_per_persona": 3, "max_followups": 1, "suggest_handoff_at": 2},
    "balanced": {"questions_per_persona": 5, "max_followups": 2, "suggest_handoff_at": 4},
    "deep": {"questions_per_persona": 8, "max_followups": 3, "suggest_handoff_at": 7},
}

PACE_LABELS: dict[str, str] = {
    "fast": "Fast",
    "balanced": "Balanced",
    "deep": "Deep",
}

DEFAULT_PACE = "balanced"

VALID_PACES = frozenset(PACE_BUDGETS.keys())

# Coverage threshold used when the budget has bypassed the usual 95% gate.
# Any other-persona focus section below 80% counts as a "fresh perspective"
# candidate. We deliberately stay below the 95% bar `compute_persona_suggestion`
# uses so a pace-driven handoff can fire without waiting for near-complete
# coverage.
_FRESH_PERSPECTIVE_THRESHOLD = 80


def get_budgets(pace: str | None) -> dict[str, int]:
    """Return the budget bundle for a pace level, falling back to balanced."""
    return PACE_BUDGETS.get(pace or DEFAULT_PACE, PACE_BUDGETS[DEFAULT_PACE])


def normalise_pace(pace: str | None) -> str:
    """Coerce an arbitrary value to a valid pace key (defaults to balanced)."""
    if isinstance(pace, str) and pace in VALID_PACES:
        return pace
    return DEFAULT_PACE


def get_persona_stats(runtime_state: dict | None, persona: str) -> dict:
    """Return the stats dict for a persona, with safe defaults."""
    if not runtime_state:
        return {"questions_asked": 0, "last_active_at": 0.0}
    all_stats = runtime_state.get("persona_stats") or {}
    stats = all_stats.get(persona)
    if not isinstance(stats, dict):
        return {"questions_asked": 0, "last_active_at": 0.0}
    return {
        "questions_asked": int(stats.get("questions_asked", 0) or 0),
        "last_active_at": float(stats.get("last_active_at", 0.0) or 0.0),
    }


def record_agent_reply(
    runtime_state: dict | None,
    persona: str,
    reply_text: str | None,
) -> dict:
    """Update persona_stats after an agent reply. Returns the mutated runtime_state.

    A reply counts as "one question used" if it contains at least one '?'
    character. We cap at one per reply because the existing prompt already
    enforces "exactly ONE question per response"; counting raw '?' would
    over-charge replies that quote a question back ("Sure — solo dev?").
    """
    state = dict(runtime_state or {})
    persona_stats = dict(state.get("persona_stats") or {})
    current = dict(persona_stats.get(persona) or {})
    asked_increment = 1 if reply_text and "?" in reply_text else 0
    current["questions_asked"] = int(current.get("questions_asked", 0) or 0) + asked_increment
    current["last_active_at"] = time.time()
    persona_stats[persona] = current
    state["persona_stats"] = persona_stats
    return state


def reset_persona_stats(runtime_state: dict | None, persona: str) -> dict:
    """Zero out a persona's counters — call on persona switch."""
    state = dict(runtime_state or {})
    persona_stats = dict(state.get("persona_stats") or {})
    persona_stats[persona] = {"questions_asked": 0, "last_active_at": time.time()}
    state["persona_stats"] = persona_stats
    return state


def get_persona_history(runtime_state: dict | None) -> list[str]:
    """Return the ordered list of personas that have ever been active.

    Used to hard-exclude already-used personas from handoff recommendations
    so the user is never told "try the PM" twice in one session. The list
    grows append-only via :func:`record_active_persona`.
    """
    if not runtime_state:
        return []
    history = runtime_state.get("persona_history")
    if not isinstance(history, list):
        return []
    return [str(p) for p in history if isinstance(p, str)]


def record_active_persona(runtime_state: dict | None, persona: str) -> dict:
    """Mark ``persona`` as active. Appends to persona_history if new.

    Called whenever the agent observes that the active persona has changed
    (either via the chip, the AI Settings Drawer, or the session launcher).
    Idempotent — calling it twice with the same persona is a no-op for
    history, but always updates ``active_persona`` to keep state coherent.
    """
    state = dict(runtime_state or {})
    history = list(get_persona_history(state))
    if persona and persona not in history:
        history.append(persona)
    state["persona_history"] = history
    state["active_persona"] = persona
    return state


def record_suggestion_fired(runtime_state: dict | None, persona: str | None) -> dict:
    """Stamp the runtime state with the persona we just suggested.

    The cooldown logic uses this stamp to keep the same chip from firing on
    every consecutive facilitator turn. Pass ``None`` to clear (e.g. when
    no suggestion was emitted).
    """
    state = dict(runtime_state or {})
    if persona:
        state["last_suggested_persona"] = persona
        state["last_suggested_at"] = time.time()
    else:
        # Clearing the stamp lets the next legitimate suggestion fire
        # immediately rather than waiting out the cooldown.
        state.pop("last_suggested_persona", None)
        state.pop("last_suggested_at", None)
    return state


# Minimum seconds between identical persona suggestions. Tuned for chat: a
# user typing 2-3 quick replies often sees the facilitator generate as many
# responses back-to-back, and we don't want the same chip to re-render in
# that 30s window. Voice calls naturally have longer gaps so this rarely
# bites there.
_SUGGESTION_COOLDOWN_SECONDS = 30


def should_resurface_suggestion(
    runtime_state: dict | None,
    candidate_persona: str,
    now: float | None = None,
) -> bool:
    """Decide whether to fire the chip for ``candidate_persona`` again.

    Returns ``False`` only when we just suggested this same persona inside
    the cooldown window. Suggestions for *different* personas always fire
    — the cooldown is per-persona, not global.
    """
    if not runtime_state:
        return True
    last = runtime_state.get("last_suggested_persona")
    if last != candidate_persona:
        return True
    last_at = runtime_state.get("last_suggested_at")
    if not isinstance(last_at, (int, float)):
        return True
    elapsed = (now if now is not None else time.time()) - float(last_at)
    return elapsed >= _SUGGESTION_COOLDOWN_SECONDS


def build_pace_directive(
    pace: str | None,
    persona_label: str,
    persona_stats: dict,
    next_persona_label: str | None = None,
    gap_section_labels: list[str] | None = None,
) -> str:
    """Build the prose block injected into the LLM system prompt.

    Replaces the old hardcoded "Max 2 follow-up questions per topic" rule
    with a budget-aware block. The block is short (≤ 6 lines) so prompt
    cost stays flat across pace settings.
    """
    budgets = get_budgets(pace)
    asked = int(persona_stats.get("questions_asked", 0))
    cap = budgets["questions_per_persona"]
    suggest_at = budgets["suggest_handoff_at"]
    max_fu = budgets["max_followups"]
    pace_label = PACE_LABELS.get(normalise_pace(pace), "Balanced")
    fu_word = "follow-up question" if max_fu == 1 else "follow-up questions"

    lines = [
        "## Pace",
        f"- PACE: {pace_label}.",
        f"- Budget: {asked}/{cap} questions used as {persona_label}.",
        f"- Max {max_fu} {fu_word} per topic, then MOVE ON.",
    ]
    target = next_persona_label or "another persona"
    gaps = ""
    if gap_section_labels:
        gaps = " (" + ", ".join(gap_section_labels[:3]) + ")"
    if asked >= cap:
        lines.append(
            f"- BUDGET EXHAUSTED. Do NOT ask another question this turn. "
            f"Summarise in one short sentence and explicitly hand off to "
            f"{target}{gaps}."
        )
    elif asked >= suggest_at:
        lines.append(
            f"- You've used {asked}/{cap} of your question budget. STRONGLY "
            f"consider handing off to {target}{gaps} — they'll bring a fresh "
            f"perspective."
        )
    return "\n".join(lines)


def next_persona_for_handoff(
    scores: dict[str, int],
    current_persona: str,
    persona_stats: dict,
    pace: str | None,
    persona_focus_sections: dict[str, list[str]],
    persona_labels: dict[str, str],
    section_labels: dict[str, str],
    used_personas: set[str] | list[str] | None = None,
) -> dict | None:
    """Pick the next persona to recommend, gated by the pace budget.

    Returns ``None`` when the current persona has not yet hit
    ``suggest_handoff_at``. When the budget has been reached, returns the
    persona with the most pending gaps in *their* focus areas — overriding
    the 95%-coverage gate that makes `compute_persona_suggestion` rarely fire.

    ``used_personas`` (typically ``persona_history`` from the runtime state)
    is hard-excluded from candidates: once a persona has been active in this
    session we never recommend them again. Without this guard the chip
    would happily re-pitch "try the PM" after the user already switched to
    and away from the PM — which is the credibility-killing loop the user
    flagged.
    """
    budgets = get_budgets(pace)
    asked = int(persona_stats.get("questions_asked", 0))
    if asked < budgets["suggest_handoff_at"]:
        return None

    used = set(used_personas or [])
    used.add(current_persona)  # always exclude whoever is currently active

    other_persona_gaps: dict[str, list[str]] = {}
    for p_id, p_sections in persona_focus_sections.items():
        if p_id in used or not p_sections:
            continue
        p_gaps = [s for s in p_sections if scores.get(s, 0) < _FRESH_PERSPECTIVE_THRESHOLD]
        if p_gaps:
            other_persona_gaps[p_id] = p_gaps

    if not other_persona_gaps:
        return None

    best_persona = max(other_persona_gaps, key=lambda p: len(other_persona_gaps[p]))
    best_gaps = other_persona_gaps[best_persona]
    gap_labels = [section_labels.get(s, s) for s in best_gaps[:3]]
    label = persona_labels.get(best_persona, best_persona)
    return {
        "persona": best_persona,
        "label": label,
        "reason": f"fresh perspective on {', '.join(gap_labels)}",
        "gap_sections": best_gaps[:5],
        "trigger": "pace_budget",
    }
