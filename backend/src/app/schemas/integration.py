"""Pydantic schemas for the integrations API."""

from datetime import datetime

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class IntegrationConnect(BaseModel):
    provider: str
    category: str
    auth_type: str  # "oauth" or "credential"
    access_token: str | None = None
    refresh_token: str | None = None
    credentials: str | None = None  # JSON string for credential-based
    scopes: list[str] = []
    metadata: dict | None = None


class IntegrationUpdate(BaseModel):
    metadata: dict | None = None
    status: str | None = None
    credentials: str | None = None  # JSON string for credential-based providers


class ScanRequest(BaseModel):
    scan_type: str = "full"


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class IntegrationResponse(BaseModel):
    id: str
    org_id: str
    provider: str
    category: str
    auth_type: str
    status: str
    scopes: str
    metadata_json: str | None = None
    connected_by: str
    last_scan_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    has_token: bool = False
    token_masked: str | None = None
    model_config = {"from_attributes": True}


class IntegrationListResponse(BaseModel):
    id: str
    provider: str
    category: str
    status: str
    last_scan_at: datetime | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class ScanLogResponse(BaseModel):
    id: str
    integration_id: str
    scan_type: str
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    resources_scanned: int
    entries_created: int
    entries_updated: int
    ai_calls_made: int
    ai_tokens_used: int
    error_message: str | None = None
    status_log: str | None = None
    model_config = {"from_attributes": True}


class ScanItemResponse(BaseModel):
    id: str
    resource_path: str
    action: str
    ai_model_used: str | None = None
    tokens_used: int | None = None
    directory_entry_id: str | None = None
    reason: str | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class ProcessingSummary(BaseModel):
    total_integrations: int
    total_scans_this_month: int
    total_tokens_this_month: int
    total_resources_scanned: int
    total_entries_generated: int
    # New fields — kept optional for backwards compat with older callers.
    estimated_cost_usd_this_month: float = 0.0
    total_tokens_lifetime: int = 0
    estimated_cost_usd_lifetime: float = 0.0
    stale_integration_count: int = 0
    by_integration: list[dict]
