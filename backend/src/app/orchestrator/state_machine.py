"""Card agent state machine — valid transitions between agent statuses."""

import logging

logger = logging.getLogger(__name__)

AGENT_STATES: dict[str | None, set[str]] = {
    None: {"investigating"},  # Card has no agent → start investigating
    "idle": {"investigating"},
    "investigating": {"implementing", "failed"},
    "implementing": {"reviewing", "failed"},
    "reviewing": {"pr_open", "implementing", "failed"},  # Review can send back to implementing
    "pr_open": {"done", "implementing"},  # Approve → done, Reject → back to implementing
    "done": set(),
    "failed": {"investigating", "idle"},  # Retry from start
}


def can_transition(current: str | None, target: str) -> bool:
    """Return True if the transition from current to target is allowed."""
    return target in AGENT_STATES.get(current, set())


def get_allowed_transitions(current: str | None) -> set[str]:
    """Return the set of valid next states from current."""
    return AGENT_STATES.get(current, set())
