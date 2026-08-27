"""Resolve `BlueprintSnapshot.created_by` values to human-readable labels.

The column holds a mix of literal strings (``"system"``, ``"system_revert"``,
``"ai_extraction"``, ``"ai_facilitator"``, ``"ai-vision"``, ``"chat"``,
``"ai-agent"``) and User UUIDs (for manual edits via the user-facing route).
This helper centralizes the mapping so the API can return a consistent
``created_by_label`` field instead of pushing the resolution logic to every
client.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User

# Friendly labels for non-user actors. Anything not in this map AND not a
# resolvable user id falls through to "User" (covers legacy or one-off
# values without misleading the operator).
_ACTOR_LABELS: dict[str, str] = {
    "system": "System",
    "system_revert": "System (revert)",
    "system_reset": "System (reset)",
    "ai_extraction": "Voice Agent",
    "ai-agent": "Voice Agent",
    "ai_facilitator": "AI Facilitator",
    "ai-vision": "Vision",
    "chat": "Chat AI",
    # The session-create flow auto-distributes the user-typed initial idea
    # into blueprint sections via an LLM call. Distinct from a manual user
    # edit (which carries the user's UUID).
    "intake": "Initial intake",
    # Legacy data: pre-fix this flow wrote the literal string "user" instead
    # of the actual user UUID. Map it to the same friendly label so existing
    # rows render sanely.
    "user": "Initial intake",
}


def is_actor_literal(created_by: str) -> bool:
    return created_by in _ACTOR_LABELS


async def resolve_labels(
    created_bys: list[str],
    db: AsyncSession,
) -> dict[str, str]:
    """Return ``{created_by_value: label}`` for every distinct value.

    UUIDs are resolved via a single SELECT against ``users``; unknown values
    fall through to ``"User"``.
    """
    out: dict[str, str] = {}
    user_ids: list[str] = []
    for cb in set(created_bys):
        if not cb:
            out[cb] = "Unknown"
        elif cb in _ACTOR_LABELS:
            out[cb] = _ACTOR_LABELS[cb]
        else:
            user_ids.append(cb)

    if user_ids:
        rows = await db.execute(select(User.id, User.name, User.email).where(User.id.in_(user_ids)))
        for uid, name, email in rows.all():
            label = (name or "").strip() or (email.split("@")[0] if email else "User")
            out[uid] = label
        # Anything in user_ids that didn't resolve (deleted account, stale id):
        for uid in user_ids:
            out.setdefault(uid, "User")

    return out


def changed_sections(diff_from_previous: dict | None) -> list[str]:
    """Section slugs that changed in a snapshot, derived from the diff blob."""
    if not isinstance(diff_from_previous, dict):
        return []
    return sorted(diff_from_previous.keys())
