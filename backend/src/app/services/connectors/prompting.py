"""Shared prompt framing for all scan connectors.

Every connector produces content that feeds two consumers:
  1. An AI facilitator running planning sessions — it surfaces directory entries
     as context ("your team's AWS has X, most active repo is Y, recent sprint
     missed N tickets")
  2. Team members browsing the directory — they read entries directly

The framing tells the AI what the output is *for* so it generates useful prose
rather than generic summaries.
"""

from __future__ import annotations

PLANR_FRAMING = (
    "You are analysing a team's {provider} data for Planr, an AI-powered "
    "planning platform. Your output will be indexed in a team knowledge "
    "directory consumed by an AI facilitator during planning sessions, and "
    "by team members browsing the directory.\n\n"
    "Write for both audiences:\n"
    "  - Be concrete. Cite specific items (repo names, service counts, sprint "
    "numbers, cost figures) rather than generic phrases.\n"
    "  - Prioritise signal useful for planning: tech stack, ownership patterns, "
    "delivery rhythm, risk areas, gaps.\n"
    "  - When the data is thin, say so honestly rather than padding with "
    "marketing-style prose.\n"
    "  - No sycophancy, no filler, no 'this project demonstrates excellent "
    "engineering practices' unless backed by specifics."
)


def system_prompt(provider: str, role: str = "") -> str:
    """Build a system prompt that anchors the AI in Planr's use case.

    Args:
        provider: human-readable provider name (e.g. "GitHub", "AWS")
        role: optional role hint (e.g. "senior cloud architect")
    """
    framing = PLANR_FRAMING.format(provider=provider)
    if role:
        framing = f"You are a {role}. " + framing
    return framing
