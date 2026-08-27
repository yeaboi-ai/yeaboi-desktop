"""Pydantic schemas for the status page — public and admin."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

StatusLabel = Literal["operational", "degraded", "partial_outage", "major_outage"]
ComponentGroup = Literal["feature", "infra", "ai_provider", "integration"]
IncidentSeverity = Literal["minor", "major", "critical"]
IncidentStatus = Literal["investigating", "identified", "monitoring", "resolved"]
IncidentImpact = Literal["degraded", "partial_outage", "major_outage"]
MaintenanceStatus = Literal["scheduled", "in_progress", "completed", "cancelled"]


# ---- Public ---------------------------------------------------------------


class UpstreamIncidentRefDTO(BaseModel):
    """A reference to an active incident on the vendor's own statuspage."""

    name: str
    status: str = Field(description="statuspage.io status: investigating|identified|monitoring|postmortem")
    impact: str = Field(description="statuspage.io impact: none|minor|major|critical")
    shortlink: str
    started_at: datetime


class PublicComponentDTO(BaseModel):
    key: str
    name: str
    group: ComponentGroup
    description: str | None = None
    status: StatusLabel
    uptime_30d: float | None = Field(None, description="Uptime percent over last 30 days, 0-100")
    since: datetime | None = Field(
        None, description="When current non-operational state started; null when state is operational or unknown"
    )
    upstream_status_url: str | None = Field(
        None, description="Vendor's own statuspage URL (display-only, not used as a probe source)"
    )
    upstream_incidents: list[UpstreamIncidentRefDTO] = Field(default_factory=list)


class PublicIncidentUpdateDTO(BaseModel):
    body: str
    status: IncidentStatus
    posted_at: datetime
    posted_by: str | None = None


class PublicIncidentDTO(BaseModel):
    id: str
    title: str
    body: str | None
    severity: IncidentSeverity
    status: IncidentStatus
    started_at: datetime
    resolved_at: datetime | None
    auto_detected: bool
    affected_components: list[str] = Field(default_factory=list, description="Component keys")
    updates: list[PublicIncidentUpdateDTO] = Field(default_factory=list)


class PublicMaintenanceDTO(BaseModel):
    id: str
    title: str
    body: str | None
    scheduled_start: datetime
    scheduled_end: datetime
    status: MaintenanceStatus
    affected_components: list[str] = Field(default_factory=list)


class PublicStatusResponse(BaseModel):
    overall: StatusLabel
    updated_at: datetime
    components: list[PublicComponentDTO]
    active_incidents: list[PublicIncidentDTO]
    active_maintenance: list[PublicMaintenanceDTO]


class HistoryBucketDTO(BaseModel):
    day: date
    worst_status: StatusLabel
    uptime_pct: float


class HistoryResponse(BaseModel):
    component_key: str
    buckets: list[HistoryBucketDTO]


class IncidentListResponse(BaseModel):
    incidents: list[PublicIncidentDTO]
    next_cursor: str | None = None


# ---- Admin ----------------------------------------------------------------


class CreateIncidentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str | None = None
    severity: IncidentSeverity = "minor"
    status: IncidentStatus = "investigating"
    started_at: datetime | None = None
    affected_component_keys: list[str] = Field(default_factory=list)


class UpdateIncidentRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    body: str | None = None
    severity: IncidentSeverity | None = None
    status: IncidentStatus | None = None


class CreateIncidentUpdateRequest(BaseModel):
    body: str = Field(min_length=1)
    status: IncidentStatus


class CreateMaintenanceRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str | None = None
    scheduled_start: datetime
    scheduled_end: datetime
    affected_component_keys: list[str] = Field(default_factory=list)


class UpdateMaintenanceRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    body: str | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    status: MaintenanceStatus | None = None


class AdminComponentDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    name: str
    group: ComponentGroup
    description: str | None
    display_order: int
    active: bool
    internal_probe_key: str | None
    third_party_status_url: str | None
    upstream_status_url: str | None


class UpdateComponentRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    display_order: int | None = None
    active: bool | None = None
    third_party_status_url: str | None = Field(default=None, max_length=500)
    upstream_status_url: str | None = Field(default=None, max_length=500)
