from __future__ import annotations

import logging

from ..models.session_event import SessionContext, SessionEvent
from .facilitator import assess_coverage

logger = logging.getLogger(__name__)

EMPTY_DIRECTORY: dict = {
    "session": {"title": None, "phase": "planning", "participants": [], "message_count": 0},
    "decisions": [],
    "blueprint_coverage": {},
    "artifacts": [],
    "open_questions": [],
}


def _ensure_directory(ctx: SessionContext) -> dict:
    """Return ctx.directory, initialising to EMPTY_DIRECTORY structure if needed."""
    import copy

    if not ctx.directory:
        ctx.directory = copy.deepcopy(EMPTY_DIRECTORY)
        return ctx.directory

    d = ctx.directory
    if "session" not in d:
        d["session"] = {"title": None, "phase": "planning", "participants": [], "message_count": 0}
    if "message_count" not in d["session"]:
        d["session"]["message_count"] = 0
    if "decisions" not in d:
        d["decisions"] = []
    if "blueprint_coverage" not in d:
        d["blueprint_coverage"] = {}
    if "artifacts" not in d:
        d["artifacts"] = []
    if "open_questions" not in d:
        d["open_questions"] = []
    return d


def materialise(ctx: SessionContext, event: SessionEvent) -> None:
    """Mutate ctx.directory in place based on the event type.

    Pure Python — no DB calls, no LLM calls.
    """
    d = _ensure_directory(ctx)
    et = event.event_type
    payload = event.payload or {}

    if et == "message":
        d["session"]["message_count"] = d["session"].get("message_count", 0) + 1

    elif et == "blueprint_edit":
        section = payload.get("section", "")
        content = payload.get("content", "")
        if section:
            result = assess_coverage({section: content})
            score = result.get("scores", {}).get(section, 0)
            d["blueprint_coverage"][section] = score

    elif et == "diagram_update":
        artifact_type = payload.get("diagram_type", "diagram")
        title = payload.get("title", "")
        turn = d["session"].get("message_count", 0)
        artifact = {"id": event.id, "type": artifact_type, "title": title, "turn": turn}
        # Replace existing artifact of same type, or append
        artifacts: list = d["artifacts"]
        for i, existing in enumerate(artifacts):
            if existing.get("type") == artifact_type:
                artifacts[i] = artifact
                break
        else:
            artifacts.append(artifact)

    elif et == "wireframe_generated":
        title = payload.get("screen_name", payload.get("title", ""))
        turn = d["session"].get("message_count", 0)
        artifact = {"id": event.id, "type": "wireframe", "title": title, "turn": turn}
        d["artifacts"].append(artifact)

    elif et == "decision":
        text = payload.get("text", "")
        rationale = payload.get("rationale", "")
        related_section = payload.get("related_section", "")
        d["decisions"].append({
            "id": event.id, "text": text, "rationale": rationale, "related_section": related_section,
        })

    elif et == "canvas_sync":
        element_count = payload.get("element_count", 0)
        d["session"]["canvas_elements"] = element_count

    elif et == "system":
        # No change
        pass

    else:
        logger.debug("materialise: unhandled event_type=%s, skipping", et)
