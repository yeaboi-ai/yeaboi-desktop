"""add ticket_templates.field_layout + backfill defaults

Adds a unified ``field_layout`` JSON to the templates table — an ordered list
of every field (built-in + custom) the ticket detail panel renders. Existing
rows are backfilled with a layout derived from the template's slug + its
existing ``field_schema`` custom fields.

Revision ID: dd4e5f6a7b8c
Revises: 022b103b4eb4
Create Date: 2026-05-10 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "dd4e5f6a7b8c"
down_revision: str | Sequence[str] | None = "022b103b4eb4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Default built-in layout used for every system slug. Custom fields from the
# row's existing ``field_schema`` are appended after this list during backfill.
_BUILTIN_LAYOUT = [
    {"key": "title", "label": "Title", "type": "title", "source": "builtin",
     "placement": "header", "visible": True, "required": True},
    {"key": "description", "label": "Description", "type": "rich_text", "source": "builtin",
     "placement": "main", "visible": True, "required": False},
    {"key": "acceptance_criteria", "label": "Acceptance criteria", "type": "acceptance_criteria",
     "source": "builtin", "placement": "main", "visible": True, "required": False},
    {"key": "attachments", "label": "Attachments", "type": "attachments", "source": "builtin",
     "placement": "main", "visible": True, "required": False},
    {"key": "activity", "label": "Activity", "type": "activity", "source": "builtin",
     "placement": "main", "visible": True, "required": False},
    {"key": "status", "label": "Status", "type": "status", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "priority", "label": "Priority", "type": "priority", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "assignee", "label": "Assignee", "type": "assignee", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "story_points", "label": "Story points", "type": "story_points", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "labels", "label": "Labels", "type": "labels", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "sync", "label": "Sync", "type": "sync", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "links", "label": "Links", "type": "links", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
]


def _custom_to_layout(field_schema: list) -> list[dict]:
    """Convert a row's ``field_schema`` (custom-only) into layout entries."""
    out: list[dict] = []
    for entry in field_schema or []:
        if not isinstance(entry, dict):
            continue
        key = entry.get("key")
        label = entry.get("label")
        if not key or not label:
            continue
        ftype = entry.get("type") or "text"
        # Long-form types lean main; short identifier-like fields go sidebar.
        placement = "main" if ftype in ("rich_text", "text") and len(str(label)) > 20 else "sidebar"
        out.append({
            "key": f"custom:{key}",
            "label": label,
            "type": ftype,
            "source": "custom",
            "placement": placement,
            "visible": True,
            "required": bool(entry.get("required", False)),
            "options": entry.get("options") or None,
        })
    return out


def upgrade() -> None:
    op.add_column(
        "ticket_templates",
        sa.Column("field_layout", sa.JSON(), nullable=False, server_default="[]"),
    )

    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, field_schema FROM ticket_templates")
    ).fetchall()

    import json as _json

    for row in rows:
        tid = row[0]
        raw = row[1]
        if isinstance(raw, str):
            try:
                schema = _json.loads(raw) if raw else []
            except (ValueError, TypeError):
                schema = []
        elif isinstance(raw, list):
            schema = raw
        else:
            schema = []
        layout = list(_BUILTIN_LAYOUT) + _custom_to_layout(schema)
        bind.execute(
            sa.text("UPDATE ticket_templates SET field_layout = :layout WHERE id = :id"),
            {"layout": _json.dumps(layout), "id": tid},
        )


def downgrade() -> None:
    op.drop_column("ticket_templates", "field_layout")
