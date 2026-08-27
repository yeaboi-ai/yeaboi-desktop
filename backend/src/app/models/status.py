"""Status page data model.

Seven tables in total:
  status_components             — one row per surface shown on the page
  status_probes                 — append-only time-series of probe samples
  status_probe_daily            — per-day rollup feeding the 90-day bar chart
  status_incidents              — admin-authored or auto-detected
  status_incident_updates       — append-only update timeline per incident
  status_incident_components    — which components an incident affects (m2m)
  status_maintenance            — scheduled maintenance window
  status_maintenance_components — m2m
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid

# Numeric probe-status encoding. Worst-of comparisons rely on the ordering.
STATUS_OPERATIONAL = 0
STATUS_DEGRADED = 1
STATUS_PARTIAL_OUTAGE = 2
STATUS_MAJOR_OUTAGE = 3

PROBE_STATUS_LABELS = {
    STATUS_OPERATIONAL: "operational",
    STATUS_DEGRADED: "degraded",
    STATUS_PARTIAL_OUTAGE: "partial_outage",
    STATUS_MAJOR_OUTAGE: "major_outage",
}

COMPONENT_GROUPS = ("feature", "infra", "ai_provider", "integration")
INCIDENT_SEVERITIES = ("minor", "major", "critical")
INCIDENT_STATUSES = ("investigating", "identified", "monitoring", "resolved")
INCIDENT_IMPACTS = ("degraded", "partial_outage", "major_outage")
MAINTENANCE_STATUSES = ("scheduled", "in_progress", "completed", "cancelled")


class StatusComponent(TimestampMixin, Base):
    __tablename__ = "status_components"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    group: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # Probe key drives the internal-probe loop. Examples:
    #   "http:GET:/api/health/ready"                         (infra/feature)
    #   "provider:anthropic"                                 (ai_provider, reads Redis)
    # Null = component is shown but never probed (manual-only).
    internal_probe_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # statuspage.io-compatible summary feed for third-party integrations.
    # Drives the third-party feed loop — i.e. this URL is *the* probe source
    # for this component.
    third_party_status_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Vendor's own statuspage URL for display only — surfaces a "↗ status.<vendor>"
    # link on the public row plus inline unresolved-incident summaries. Distinct
    # from third_party_status_url: never used as a probe source, so it can be
    # attached to ai_provider components whose state already comes from Redis.
    upstream_status_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class StatusProbe(Base):
    """One probe sample. Append-only, swept after 90 days."""

    __tablename__ = "status_probes"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    component_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("status_components.id", ondelete="CASCADE"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Coarse error bucket — never echo raw upstream messages to the public.
    error: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index("ix_status_probes_component_ts", "component_id", "ts"),
        Index("ix_status_probes_ts", "ts"),
    )


class StatusProbeDaily(Base):
    """Per-day rollup. Composite PK = (component_id, day). Upserted by the sweeper."""

    __tablename__ = "status_probe_daily"

    component_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("status_components.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[datetime] = mapped_column(Date, primary_key=True)
    worst_status: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    uptime_pct: Mapped[float] = mapped_column(Float, nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)


class StatusIncident(TimestampMixin, Base):
    __tablename__ = "status_incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="minor")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="investigating")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    auto_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Used by the auto-detection loop to deduplicate when re-running over the
    # same downtime window. Manual incidents leave this null.
    external_key: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)


class StatusIncidentUpdate(Base):
    __tablename__ = "status_incident_updates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    incident_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("status_incidents.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    posted_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    __table_args__ = (Index("ix_status_incident_updates_incident", "incident_id", "posted_at"),)


class StatusIncidentComponent(Base):
    __tablename__ = "status_incident_components"

    incident_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("status_incidents.id", ondelete="CASCADE"), primary_key=True
    )
    component_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("status_components.id", ondelete="CASCADE"), primary_key=True
    )
    impact: Mapped[str] = mapped_column(String(20), nullable=False, default="degraded")


class StatusMaintenance(TimestampMixin, Base):
    __tablename__ = "status_maintenance"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scheduled_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    posted_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)


class StatusMaintenanceComponent(Base):
    __tablename__ = "status_maintenance_components"

    maintenance_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("status_maintenance.id", ondelete="CASCADE"), primary_key=True
    )
    component_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("status_components.id", ondelete="CASCADE"), primary_key=True
    )


# Re-exported for use across services/routers — flagging here so a typo in
# the constant ripples up to a NameError at import time rather than producing
# silently wrong status strings on the wire.
__all__ = [
    "STATUS_OPERATIONAL",
    "STATUS_DEGRADED",
    "STATUS_PARTIAL_OUTAGE",
    "STATUS_MAJOR_OUTAGE",
    "PROBE_STATUS_LABELS",
    "COMPONENT_GROUPS",
    "INCIDENT_SEVERITIES",
    "INCIDENT_STATUSES",
    "INCIDENT_IMPACTS",
    "MAINTENANCE_STATUSES",
    "StatusComponent",
    "StatusProbe",
    "StatusProbeDaily",
    "StatusIncident",
    "StatusIncidentUpdate",
    "StatusIncidentComponent",
    "StatusMaintenance",
    "StatusMaintenanceComponent",
]
