"""Card → external-tracker payload translators (Jira / ADO).

Pure functions, easy to unit-test with no httpx mocks. Markdown is converted to
the small ADF subset Jira renders well (paragraphs, headings, lists, code,
links) plus a checkbox-style task list for acceptance criteria. ADO accepts
HTML directly and uses JSON-Patch for create / update so we render to that.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from ..html_text import ac_done, ac_text, html_to_text

# ─── Field-mapping shape used by IntegrationProjectMapping ──────────────────


@dataclass
class FieldMappings:
    """Per-project translation knobs lifted out of `IntegrationProjectMapping.field_mappings`.

    Stored as a free-form JSON dict on the row; this dataclass is just a typed
    view for the translator. Missing keys fall back to sensible defaults.
    """

    priority: dict[str, str]
    story_points_field: str  # Jira custom-field id, e.g. "customfield_10016"
    labels_as: str  # "labels" (Jira) | "tags" (ADO)
    assignee_strategy: str  # "email_lookup" | "explicit_map"
    assignee_overrides: dict[str, str]

    @classmethod
    def from_row(cls, raw: dict | None) -> FieldMappings:
        raw = raw or {}
        return cls(
            priority=raw.get("priority")
            or {"critical": "Highest", "high": "High", "medium": "Medium", "low": "Low"},
            story_points_field=raw.get("story_points_field") or "customfield_10016",
            labels_as=raw.get("labels_as") or "labels",
            assignee_strategy=raw.get("assignee_strategy") or "email_lookup",
            assignee_overrides=raw.get("assignee_overrides") or {},
        )


# ─── Markdown → ADF (Jira) ──────────────────────────────────────────────────


_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def _adf_text_with_links(text: str) -> list[dict[str, Any]]:
    """Convert plain text with `[label](url)` markers into ADF text + link nodes."""
    nodes: list[dict[str, Any]] = []
    cursor = 0
    for match in _LINK_RE.finditer(text):
        if match.start() > cursor:
            nodes.append({"type": "text", "text": text[cursor : match.start()]})
        label, url = match.group(1), match.group(2)
        nodes.append(
            {
                "type": "text",
                "text": label,
                "marks": [{"type": "link", "attrs": {"href": url}}],
            }
        )
        cursor = match.end()
    if cursor < len(text):
        nodes.append({"type": "text", "text": text[cursor:]})
    if not nodes:
        nodes.append({"type": "text", "text": ""})
    return nodes


def markdown_to_adf(md: str | None) -> dict[str, Any]:
    """Render a small markdown subset to ADF: heading, paragraph, bullet/ordered
    list, inline code, fenced code, links. Anything else collapses to a paragraph.

    The point isn't a perfect Markdown→ADF — this is the Atlassian Cloud REST
    API expecting an ``adf`` document in the issue body, and Jira renders the
    common subset cleanly.
    """
    md = (md or "").rstrip()
    if not md:
        return {"version": 1, "type": "doc", "content": []}

    content: list[dict[str, Any]] = []
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Fenced code block
        if stripped.startswith("```"):
            lang = stripped[3:].strip() or None
            i += 1
            code_lines: list[str] = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing fence
            attrs: dict[str, Any] = {}
            if lang:
                attrs["language"] = lang
            content.append(
                {
                    "type": "codeBlock",
                    "attrs": attrs,
                    "content": [{"type": "text", "text": "\n".join(code_lines)}],
                }
            )
            continue

        # Heading (#, ##, ###)
        m = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if m:
            level = len(m.group(1))
            content.append(
                {
                    "type": "heading",
                    "attrs": {"level": level},
                    "content": _adf_text_with_links(m.group(2)),
                }
            )
            i += 1
            continue

        # Bullet / ordered list (consume the contiguous block)
        bullet = re.match(r"^\s*[-*]\s+(.+)$", line)
        ordered = re.match(r"^\s*\d+\.\s+(.+)$", line)
        if bullet or ordered:
            list_type = "bulletList" if bullet else "orderedList"
            item_re = re.compile(r"^\s*(?:[-*]|\d+\.)\s+(.+)$")
            items: list[dict[str, Any]] = []
            while i < len(lines) and item_re.match(lines[i]):
                m = item_re.match(lines[i])
                assert m is not None
                items.append(
                    {
                        "type": "listItem",
                        "content": [
                            {"type": "paragraph", "content": _adf_text_with_links(m.group(1))}
                        ],
                    }
                )
                i += 1
            content.append({"type": list_type, "content": items})
            continue

        # Empty line → paragraph break
        if not stripped:
            i += 1
            continue

        # Default: paragraph
        content.append({"type": "paragraph", "content": _adf_text_with_links(stripped)})
        i += 1

    return {"version": 1, "type": "doc", "content": content}


def _adf_acceptance_criteria(criteria: list[Any]) -> dict[str, Any]:
    """Append an 'Acceptance criteria' heading + a bullet list.

    Accepts both legacy bare-string entries and the new ``{text, done}`` shape.
    Done items are prefixed with ``[x]`` so the Jira-side reader still gets a
    completion signal even though Jira's ADF lacks a native task-list node in
    the small subset we support.
    """
    if not criteria:
        return {"version": 1, "type": "doc", "content": []}
    return {
        "version": 1,
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 3},
                "content": [{"type": "text", "text": "Acceptance criteria"}],
            },
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": _adf_text_with_links(
                                    f"[{'x' if ac_done(c) else ' '}] {ac_text(c)}"
                                ),
                            }
                        ],
                    }
                    for c in criteria
                ],
            },
        ],
    }


def _merge_adf(*docs: dict[str, Any]) -> dict[str, Any]:
    """Concatenate the `content` arrays of multiple ADF docs into one."""
    merged: list[dict[str, Any]] = []
    for d in docs:
        merged.extend(d.get("content", []))
    return {"version": 1, "type": "doc", "content": merged}


# ─── Card → Jira payload ────────────────────────────────────────────────────


def card_to_jira_payload(
    *,
    title: str,
    description: str | None,
    priority: str | None,
    story_points: int | None,
    labels: list[str] | None,
    acceptance_criteria: list[Any] | None,
    issue_type: str,
    project_id: str,
    field_mappings: FieldMappings,
    assignee_account_id: str | None = None,
) -> dict[str, Any]:
    """Render the body for ``POST /rest/api/3/issue`` (or PUT-style update fields).

    All field translation lives here so tests can pin down the contract without
    booting an httpx client.
    """
    # Description may be HTML (new ticket editor) or markdown (legacy / sessions).
    # Flatten HTML to text first so the markdown→ADF pipeline produces sensible
    # paragraphs instead of literal tag soup.
    description_doc = markdown_to_adf(html_to_text(description) if description else None)
    if acceptance_criteria:
        description_doc = _merge_adf(description_doc, _adf_acceptance_criteria(acceptance_criteria))

    fields: dict[str, Any] = {
        "summary": title,
        "issuetype": {"name": issue_type},
        "project": {"id": project_id},
    }

    if description_doc.get("content"):
        fields["description"] = description_doc

    if priority:
        mapped = field_mappings.priority.get(priority)
        if mapped:
            fields["priority"] = {"name": mapped}

    if story_points is not None and field_mappings.story_points_field:
        fields[field_mappings.story_points_field] = story_points

    cleaned_labels = [
        re.sub(r"\s+", "-", label.strip())
        for label in (labels or [])
        if label and label.strip()
    ]
    if cleaned_labels:
        fields["labels"] = cleaned_labels

    if assignee_account_id:
        fields["assignee"] = {"accountId": assignee_account_id}

    return {"fields": fields}


# ─── Card → ADO JSON-Patch ──────────────────────────────────────────────────


def _markdown_to_html(md: str | None) -> str:
    """Tiny markdown → HTML fallback used for ADO when markdown_it isn't a dep yet.

    Handles paragraphs, headings, simple lists, bold/italic and links. Good
    enough for ADO's WIQL renderer — anything richer can come when we add
    markdown-it-py to the deps.
    """
    src = (md or "").strip()
    if not src:
        return ""

    out: list[str] = []
    in_ul = False
    in_ol = False

    def close_lists() -> None:
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False

    for line in src.splitlines():
        stripped = line.strip()
        if not stripped:
            close_lists()
            continue

        m = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if m:
            close_lists()
            level = len(m.group(1))
            out.append(f"<h{level}>{_inline_html(m.group(2))}</h{level}>")
            continue

        if re.match(r"^[-*]\s+", stripped):
            if not in_ul:
                close_lists()
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{_inline_html(stripped[2:])}</li>")
            continue

        if re.match(r"^\d+\.\s+", stripped):
            if not in_ol:
                close_lists()
                out.append("<ol>")
                in_ol = True
            after = re.sub(r"^\d+\.\s+", "", stripped)
            out.append(f"<li>{_inline_html(after)}</li>")
            continue

        close_lists()
        out.append(f"<p>{_inline_html(stripped)}</p>")

    close_lists()
    return "\n".join(out)


def _inline_html(text: str) -> str:
    """Bold (**x**), italic (*x*), links."""
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", text)
    return text


def card_to_ado_patch_doc(
    *,
    title: str,
    description: str | None,
    priority: str | None,
    story_points: int | None,
    labels: list[str] | None,
    acceptance_criteria: list[Any] | None,
    field_mappings: FieldMappings,
) -> list[dict[str, Any]]:
    """Build the JSON-Patch body for ``POST/PATCH _apis/wit/workitems/$<type>``.

    Adds ``System.Title``/``Description``, ``Microsoft.VSTS.Common.Priority``,
    ``Microsoft.VSTS.Scheduling.StoryPoints``, and folds AC into the
    ``Microsoft.VSTS.Common.AcceptanceCriteria`` HTML field.
    """
    ops: list[dict[str, Any]] = [
        {"op": "add", "path": "/fields/System.Title", "value": title},
    ]

    # ADO accepts HTML directly. If the description already looks like HTML
    # (Tiptap output), pass it through untouched; otherwise treat it as
    # markdown and convert.
    description_html = description if description and "<" in description else _markdown_to_html(description)
    if description_html:
        ops.append(
            {
                "op": "add",
                "path": "/fields/System.Description",
                "value": description_html,
            }
        )

    if acceptance_criteria:
        ac_html = "\n".join(
            f'<li>{("<s>" + _inline_html(ac_text(c)) + "</s>") if ac_done(c) else _inline_html(ac_text(c))}</li>'
            for c in acceptance_criteria
        )
        ops.append(
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
                "value": f"<ul>{ac_html}</ul>",
            }
        )

    if priority:
        mapped_name = field_mappings.priority.get(priority)
        if mapped_name:
            # ADO Priority is numeric 1-4; map our names → ADO numbers.
            ado_priority = {"Highest": 1, "High": 2, "Medium": 3, "Low": 4}.get(mapped_name, 3)
            ops.append(
                {
                    "op": "add",
                    "path": "/fields/Microsoft.VSTS.Common.Priority",
                    "value": ado_priority,
                }
            )

    if story_points is not None:
        ops.append(
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.Scheduling.StoryPoints",
                "value": story_points,
            }
        )

    cleaned_labels = [
        re.sub(r"\s+", "-", label.strip()) for label in (labels or []) if label and label.strip()
    ]
    if cleaned_labels:
        # ADO tags are a single string with `; ` separators.
        ops.append(
            {
                "op": "add",
                "path": "/fields/System.Tags",
                "value": "; ".join(cleaned_labels),
            }
        )

    return ops
