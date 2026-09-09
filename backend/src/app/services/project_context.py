"""What a project already knows, in words a model can use.

A project carries the things it points at — a Jira issue, a repo, a Confluence
page — and the screenshots someone attached while describing it. The planning
session that opens on that project should start from them rather than asking
what the reader has already said, so these turn the stored rows into plain
lines for the blueprint seeding and the opening greeting.
"""

from __future__ import annotations

from typing import Any

# One project's worth; beyond this the opening context stops being an opening.
MAX_REFERENCE_LINES = 12


def _text(value: Any) -> str:
    return " ".join(str(value).split()) if value else ""


def reference_lines(references: list[dict] | None) -> list[str]:
    """One line per thing the project points at, newest-stored last.

    ``Referenced jira PROJ-12 "Login fails on Safari" — https://…``
    """
    lines: list[str] = []
    for reference in references or []:
        if not isinstance(reference, dict):
            continue
        source = _text(reference.get("source"))
        subject = _text(reference.get("subject"))
        label = _text(reference.get("label"))
        if not (source or subject or label):
            continue
        head = " ".join(part for part in ("Referenced", source, subject) if part)
        if label and label != subject:
            head = f'{head} "{label}"'
        url = _text(reference.get("url"))
        lines.append(f"{head} — {url}" if url else head)
        if len(lines) >= MAX_REFERENCE_LINES:
            break
    return lines


def attachment_line(filenames: list[str]) -> str:
    """The one line naming the screenshots, so the greeting can say it saw them."""
    if not filenames:
        return ""
    names = ", ".join(filenames)
    noun = "screenshot" if len(filenames) == 1 else "screenshots"
    return f"Attached {noun}: {names}"
