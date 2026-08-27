"""add status page tables and seed components

Creates the schema for the public status page: components, time-series probe
samples, daily rollups, incidents with update timelines, scheduled
maintenance, and the two join tables. Seeds the initial ~29 components
across the four groups (features, infra, AI providers, integrations).

Revision ID: b3c4d5e6f7a8
Revises: b8c1d2e3f4a5
Create Date: 2026-05-17 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | Sequence[str] | None = "b8c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_SEEDS: list[dict] = [
    # Features
    {"key": "chat", "name": "Chat", "group": "feature", "order": 10, "probe": "feature:chat"},
    {"key": "video", "name": "Video Calls", "group": "feature", "order": 20, "probe": "feature:video"},
    {"key": "canvas", "name": "Canvas", "group": "feature", "order": 30, "probe": "feature:canvas"},
    {"key": "voice", "name": "Voice Agent", "group": "feature", "order": 40, "probe": "feature:voice"},
    {"key": "image_gen", "name": "Image Generation", "group": "feature", "order": 50, "probe": "feature:wireframe"},
    {"key": "harness", "name": "GitHub Harness", "group": "feature", "order": 60, "probe": "feature:harness"},
    {"key": "email", "name": "Email Delivery", "group": "feature", "order": 70, "probe": None},
    # Infra
    {"key": "backend_api", "name": "Backend API", "group": "infra", "order": 110, "probe": "http:/api/health/live"},
    {"key": "frontend", "name": "Web App", "group": "infra", "order": 120, "probe": None},
    {"key": "postgres", "name": "Database (Postgres)", "group": "infra", "order": 130, "probe": "ready:database"},
    {"key": "redis", "name": "Cache (Redis)", "group": "infra", "order": 140, "probe": "ready:redis"},
    {"key": "livekit", "name": "LiveKit Server", "group": "infra", "order": 150, "probe": None},
    # AI providers
    {"key": "anthropic", "name": "Anthropic (Claude)", "group": "ai_provider", "order": 210, "probe": "provider:anthropic"},
    {"key": "openai", "name": "OpenAI", "group": "ai_provider", "order": 220, "probe": "provider:openai"},
    {"key": "gemini", "name": "Google Gemini", "group": "ai_provider", "order": 230, "probe": "provider:gemini"},
    {"key": "google", "name": "Google AI (vision)", "group": "ai_provider", "order": 240, "probe": "provider:google"},
    {"key": "deepgram", "name": "Deepgram", "group": "ai_provider", "order": 250, "probe": "provider:deepgram"},
    {"key": "elevenlabs", "name": "ElevenLabs", "group": "ai_provider", "order": 260, "probe": "provider:elevenlabs"},
    {"key": "deepseek", "name": "DeepSeek", "group": "ai_provider", "order": 270, "probe": "provider:deepseek"},
    {"key": "qwen", "name": "Qwen", "group": "ai_provider", "order": 280, "probe": "provider:qwen"},
    {"key": "tavus", "name": "Tavus", "group": "ai_provider", "order": 290, "probe": None},
    # Third-party integrations
    {"key": "github", "name": "GitHub", "group": "integration", "order": 310, "probe": None, "feed": "https://www.githubstatus.com/api/v2/summary.json"},
    {"key": "slack", "name": "Slack", "group": "integration", "order": 320, "probe": None, "feed": "https://status.slack.com/api/v2.0.0/current"},
    {"key": "atlassian_jira", "name": "Jira", "group": "integration", "order": 330, "probe": None, "feed": "https://jira-software.status.atlassian.com/api/v2/summary.json"},
    {"key": "notion", "name": "Notion", "group": "integration", "order": 340, "probe": None, "feed": "https://status.notion.so/api/v2/summary.json"},
    {"key": "linear", "name": "Linear", "group": "integration", "order": 350, "probe": None, "feed": "https://status.linear.app/api/v2/summary.json"},
    {"key": "figma", "name": "Figma", "group": "integration", "order": 360, "probe": None, "feed": "https://status.figma.com/api/v2/summary.json"},
    {"key": "anthropic_api_status", "name": "Anthropic API (upstream)", "group": "integration", "order": 370, "probe": None, "feed": "https://status.anthropic.com/api/v2/summary.json"},
    {"key": "openai_api_status", "name": "OpenAI API (upstream)", "group": "integration", "order": 380, "probe": None, "feed": "https://status.openai.com/api/v2/summary.json"},
]


def upgrade() -> None:
    op.create_table(
        "status_components",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("group", sa.String(length=20), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("internal_probe_key", sa.String(length=255), nullable=True),
        sa.Column("third_party_status_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_status_components_key"),
    )

    op.create_table(
        "status_probes",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("component_id", sa.String(length=36), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.SmallInteger(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("error", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["component_id"], ["status_components.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_status_probes_component_ts", "status_probes", ["component_id", "ts"])
    op.create_index("ix_status_probes_ts", "status_probes", ["ts"])

    op.create_table(
        "status_probe_daily",
        sa.Column("component_id", sa.String(length=36), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("worst_status", sa.SmallInteger(), nullable=False),
        sa.Column("uptime_pct", sa.Float(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["component_id"], ["status_components.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("component_id", "day"),
    )

    op.create_table(
        "status_incidents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="minor"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="investigating"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("auto_detected", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("external_key", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["posted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_key", name="uq_status_incidents_external_key"),
    )

    op.create_table(
        "status_incident_updates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("incident_id", sa.String(length=36), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("posted_by_user_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["incident_id"], ["status_incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["posted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_status_incident_updates_incident", "status_incident_updates", ["incident_id", "posted_at"]
    )

    op.create_table(
        "status_incident_components",
        sa.Column("incident_id", sa.String(length=36), nullable=False),
        sa.Column("component_id", sa.String(length=36), nullable=False),
        sa.Column("impact", sa.String(length=20), nullable=False, server_default="degraded"),
        sa.ForeignKeyConstraint(["incident_id"], ["status_incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["component_id"], ["status_components.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("incident_id", "component_id"),
    )

    op.create_table(
        "status_maintenance",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("scheduled_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="scheduled"),
        sa.Column("posted_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["posted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "status_maintenance_components",
        sa.Column("maintenance_id", sa.String(length=36), nullable=False),
        sa.Column("component_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["maintenance_id"], ["status_maintenance.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["component_id"], ["status_components.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("maintenance_id", "component_id"),
    )

    components_table = sa.table(
        "status_components",
        sa.column("id", sa.String),
        sa.column("key", sa.String),
        sa.column("name", sa.String),
        sa.column("group", sa.String),
        sa.column("display_order", sa.Integer),
        sa.column("internal_probe_key", sa.String),
        sa.column("third_party_status_url", sa.String),
    )

    import uuid

    op.bulk_insert(
        components_table,
        [
            {
                "id": str(uuid.uuid4()),
                "key": seed["key"],
                "name": seed["name"],
                "group": seed["group"],
                "display_order": seed["order"],
                "internal_probe_key": seed.get("probe"),
                "third_party_status_url": seed.get("feed"),
            }
            for seed in _SEEDS
        ],
    )


def downgrade() -> None:
    op.drop_table("status_maintenance_components")
    op.drop_table("status_maintenance")
    op.drop_index("ix_status_incident_updates_incident", table_name="status_incident_updates")
    op.drop_table("status_incident_components")
    op.drop_table("status_incident_updates")
    op.drop_table("status_incidents")
    op.drop_table("status_probe_daily")
    op.drop_index("ix_status_probes_ts", table_name="status_probes")
    op.drop_index("ix_status_probes_component_ts", table_name="status_probes")
    op.drop_table("status_probes")
    op.drop_table("status_components")
