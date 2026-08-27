"""ticket overhaul phase 0 — friendly ids, templates, attachments, links, sync, events

Adds the foundation tables and columns for the planning-platform ticket-system overhaul:

* projects.key + projects.card_counter (per-project monotonic ticket counter)
* cards.project_id (denormalized FK), number, friendly_id, template_id, template_version,
  custom_fields, plus unique(project_id, number) and unique(friendly_id)
* ticket_templates, card_attachments, card_links, card_events
* card_external_links, integration_project_mappings, sync_events

Also backfills:
* project.key for every existing project (derived from name, deduped within org)
* card.project_id, number, friendly_id for every existing card (per-project sequential
  ordered by created_at, id), and project.card_counter to match the high-water mark
* card_links rows from existing cards.depends_on JSON arrays (link_type='blocks')

cards.depends_on is intentionally retained for one release; a later migration will drop
it once read paths have been swapped to query card_links.

Revision ID: aa1b2c3d4e5f
Revises: z1a2b3c4d5e6
Create Date: 2026-05-09 14:00:00.000000
"""

import re
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "aa1b2c3d4e5f"
down_revision: str | None = "z1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_KEY_RE = re.compile(r"[^A-Z0-9]")
_FALLBACK_KEY = "PROJ"


def _candidate_key(name: str) -> str:
    cleaned = _KEY_RE.sub("", (name or "").upper())
    if len(cleaned) >= 3 and cleaned[0].isalpha():
        return cleaned[:4]
    return _FALLBACK_KEY


def upgrade() -> None:
    # ── 1. ticket_templates (referenced by cards.template_id) ───────────────────
    op.create_table(
        "ticket_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=True, index=True),
        sa.Column("slug", sa.String(60), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(30), nullable=False, server_default="zap"),
        sa.Column("default_priority", sa.String(20), nullable=True),
        sa.Column("default_story_points", sa.Integer(), nullable=True),
        sa.Column("default_labels", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("prompt_fragment", sa.Text(), nullable=False, server_default=""),
        sa.Column("field_schema", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("acceptance_criteria_template", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("applicability", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "project_id", "slug", "deleted_at", name="uq_ticket_templates_scope_slug"),
    )

    # ── 2. projects.key + card_counter ──────────────────────────────────────────
    op.add_column("projects", sa.Column("key", sa.String(10), nullable=True))
    op.add_column(
        "projects",
        sa.Column("card_counter", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_unique_constraint("uq_projects_org_key", "projects", ["org_id", "key"])

    # ── 3. card columns ─────────────────────────────────────────────────────────
    op.add_column("cards", sa.Column("project_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_cards_project_id", "cards", "projects", ["project_id"], ["id"])
    op.create_index("ix_cards_project_id", "cards", ["project_id"])

    op.add_column("cards", sa.Column("number", sa.Integer(), nullable=True))
    op.create_index("ix_cards_number", "cards", ["number"])

    op.add_column("cards", sa.Column("friendly_id", sa.String(20), nullable=True))
    op.create_unique_constraint("uq_cards_friendly_id", "cards", ["friendly_id"])
    op.create_index("ix_cards_friendly_id", "cards", ["friendly_id"])

    op.add_column("cards", sa.Column("template_id", sa.String(36), nullable=True))
    op.create_foreign_key(
        "fk_cards_template_id", "cards", "ticket_templates", ["template_id"], ["id"], ondelete="SET NULL"
    )
    op.add_column("cards", sa.Column("template_version", sa.Integer(), nullable=True))
    op.add_column("cards", sa.Column("custom_fields", sa.JSON(), nullable=False, server_default="{}"))

    op.create_unique_constraint("uq_cards_project_number", "cards", ["project_id", "number"])

    # ── 4. card_attachments ─────────────────────────────────────────────────────
    op.create_table(
        "card_attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "card_id", sa.String(36), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True
        ),
        sa.Column("uploaded_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── 5. card_links ───────────────────────────────────────────────────────────
    op.create_table(
        "card_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "source_card_id",
            sa.String(36),
            sa.ForeignKey("cards.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "target_card_id",
            sa.String(36),
            sa.ForeignKey("cards.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("link_type", sa.String(20), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("source_card_id", "target_card_id", "link_type", name="uq_card_link_triple"),
        sa.CheckConstraint("source_card_id <> target_card_id", name="ck_card_link_no_self"),
    )

    # ── 6. card_events ──────────────────────────────────────────────────────────
    op.create_table(
        "card_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("card_id", sa.String(36), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_card_events_card_created", "card_events", ["card_id", "created_at"])

    # ── 7. card_external_links ──────────────────────────────────────────────────
    op.create_table(
        "card_external_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("card_id", sa.String(36), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "org_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True
        ),
        sa.Column(
            "integration_id",
            sa.String(36),
            sa.ForeignKey("org_integrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(64), nullable=False),
        sa.Column("external_key", sa.String(64), nullable=True),
        sa.Column("external_url", sa.String(500), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_local_change_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_remote_change_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_state", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version_token", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("card_id", "provider", name="uq_card_external_links_card_provider"),
    )
    op.create_index(
        "ix_card_external_links_provider_external_id",
        "card_external_links",
        ["provider", "external_id"],
    )
    op.create_index(
        "ix_card_external_links_integration_state",
        "card_external_links",
        ["integration_id", "sync_state"],
    )

    # ── 8. integration_project_mappings ────────────────────────────────────────
    op.create_table(
        "integration_project_mappings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "integration_id",
            sa.String(36),
            sa.ForeignKey("org_integrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "internal_project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("external_project_key", sa.String(120), nullable=False),
        sa.Column("external_project_id", sa.String(64), nullable=True),
        sa.Column("default_issue_type", sa.String(40), nullable=False, server_default="Task"),
        sa.Column("field_mappings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("sync_direction", sa.String(16), nullable=False, server_default="bidirectional"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("webhook_secret_encrypted", sa.Text(), nullable=True),
        sa.Column("webhook_external_id", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "integration_id",
            "internal_project_id",
            name="uq_integration_project_mappings_integration_project",
        ),
    )

    # ── 9. sync_events ──────────────────────────────────────────────────────────
    op.create_table(
        "sync_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("card_id", sa.String(36), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=True),
        sa.Column(
            "link_id",
            sa.String(36),
            sa.ForeignKey("card_external_links.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("direction", sa.String(8), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("request_id", sa.String(60), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_sync_events_card_created", "sync_events", ["card_id", "created_at"])

    # ── 10. backfill ────────────────────────────────────────────────────────────
    bind = op.get_bind()

    # 10a. Project keys, deduped within each org.
    projects = bind.execute(
        sa.text("SELECT id, name, org_id FROM projects ORDER BY org_id, created_at, id")
    ).fetchall()

    used_keys_by_org: dict[str, set[str]] = {}
    project_keys: dict[str, str] = {}
    for proj_id, name, org_id in projects:
        used = used_keys_by_org.setdefault(org_id, set())
        base = _candidate_key(name)
        candidate = base
        suffix = 2
        while candidate in used:
            max_base = 10 - len(str(suffix))
            candidate = f"{base[:max_base]}{suffix}"
            suffix += 1
        used.add(candidate)
        project_keys[proj_id] = candidate
        bind.execute(
            sa.text("UPDATE projects SET key = :k WHERE id = :id"),
            {"k": candidate, "id": proj_id},
        )

    # 10b. Backfill card.project_id by joining through board_columns → boards.
    bind.execute(
        sa.text(
            """
            UPDATE cards
            SET project_id = b.project_id
            FROM board_columns bc
            JOIN boards b ON bc.board_id = b.id
            WHERE cards.column_id = bc.id AND cards.project_id IS NULL
            """
            if bind.dialect.name == "postgresql"
            else """
            UPDATE cards
            SET project_id = (
                SELECT b.project_id
                FROM board_columns bc
                JOIN boards b ON bc.board_id = b.id
                WHERE bc.id = cards.column_id
            )
            WHERE project_id IS NULL
            """
        )
    )

    # 10c. Card numbers + friendly_ids per project, ordered by created_at, id.
    cards_per_project = bind.execute(
        sa.text(
            """
            SELECT id, project_id
            FROM cards
            WHERE project_id IS NOT NULL
            ORDER BY project_id, created_at, id
            """
        )
    ).fetchall()

    counters: dict[str, int] = {}
    for card_id, proj_id in cards_per_project:
        counters[proj_id] = counters.get(proj_id, 0) + 1
        n = counters[proj_id]
        key = project_keys.get(proj_id, _FALLBACK_KEY)
        bind.execute(
            sa.text("UPDATE cards SET number = :n, friendly_id = :fid WHERE id = :id"),
            {"n": n, "fid": f"{key}-{n}", "id": card_id},
        )

    for proj_id, max_n in counters.items():
        bind.execute(
            sa.text("UPDATE projects SET card_counter = :c WHERE id = :id"),
            {"c": max_n, "id": proj_id},
        )

    # 10d. Migrate cards.depends_on JSON → card_links rows (link_type='blocks').
    # Each entry "X" in cards[Y].depends_on becomes (source=X, target=Y, link_type='blocks'):
    # X is the blocker, Y is blocked by X. Pre-validate every (src, tgt) pair against
    # the set of existing card ids so a single bad ref can't poison the migration's
    # transaction (Postgres aborts the whole tx on FK / unique violation, and there's
    # no per-statement recovery without savepoints we don't need here).
    import json as _json
    import uuid as _uuid

    valid_card_ids: set[str] = {
        row[0] for row in bind.execute(sa.text("SELECT id FROM cards")).fetchall()
    }

    rows = bind.execute(
        sa.text(
            """
            SELECT cards.id, cards.depends_on, projects.owner_id
            FROM cards
            JOIN projects ON projects.id = cards.project_id
            WHERE cards.depends_on IS NOT NULL
            """
        )
    ).fetchall()

    inserted: set[tuple[str, str]] = set()
    for card_id, depends_on_raw, owner_id in rows:
        if isinstance(depends_on_raw, list):
            deps = depends_on_raw
        elif isinstance(depends_on_raw, str):
            try:
                deps = _json.loads(depends_on_raw)
            except (ValueError, TypeError):
                deps = []
        else:
            deps = []

        for dep in deps:
            if not isinstance(dep, str) or not dep:
                continue
            if dep == card_id:
                continue  # self-ref blocked by ck_card_link_no_self
            if dep not in valid_card_ids:
                continue  # dangling fk
            pair = (dep, card_id)
            if pair in inserted:
                continue  # dedupe within and across cards (uq_card_link_triple)
            inserted.add(pair)
            bind.execute(
                sa.text(
                    "INSERT INTO card_links (id, source_card_id, target_card_id, link_type, created_by) "
                    "VALUES (:id, :src, :tgt, 'blocks', :by)"
                ),
                {"id": str(_uuid.uuid4()), "src": dep, "tgt": card_id, "by": owner_id},
            )

    # Suppress unused-import warning when the postgresql dialect dict isn't used at runtime.
    _ = postgresql


def downgrade() -> None:
    # Reverse order of upgrade.
    op.drop_index("ix_sync_events_card_created", table_name="sync_events")
    op.drop_table("sync_events")

    op.drop_table("integration_project_mappings")

    op.drop_index("ix_card_external_links_integration_state", table_name="card_external_links")
    op.drop_index("ix_card_external_links_provider_external_id", table_name="card_external_links")
    op.drop_table("card_external_links")

    op.drop_index("ix_card_events_card_created", table_name="card_events")
    op.drop_table("card_events")

    op.drop_table("card_links")

    op.drop_table("card_attachments")

    op.drop_constraint("uq_cards_project_number", "cards", type_="unique")
    op.drop_column("cards", "custom_fields")
    op.drop_column("cards", "template_version")
    op.drop_constraint("fk_cards_template_id", "cards", type_="foreignkey")
    op.drop_column("cards", "template_id")
    op.drop_index("ix_cards_friendly_id", table_name="cards")
    op.drop_constraint("uq_cards_friendly_id", "cards", type_="unique")
    op.drop_column("cards", "friendly_id")
    op.drop_index("ix_cards_number", table_name="cards")
    op.drop_column("cards", "number")
    op.drop_index("ix_cards_project_id", table_name="cards")
    op.drop_constraint("fk_cards_project_id", "cards", type_="foreignkey")
    op.drop_column("cards", "project_id")

    op.drop_constraint("uq_projects_org_key", "projects", type_="unique")
    op.drop_column("projects", "card_counter")
    op.drop_column("projects", "key")

    op.drop_table("ticket_templates")
