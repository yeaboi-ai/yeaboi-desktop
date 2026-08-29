"""Integrations API — per-org external service connection management."""

import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..middleware.rate_limit import limiter
from ..models.integration import IntegrationScanItem, IntegrationScanLog, OrgIntegration
from ..models.organization import OrgMember
from ..models.user import User
from ..schemas.integration import (
    IntegrationConnect,
    IntegrationListResponse,
    IntegrationUpdate,
    ProcessingSummary,
    ScanItemResponse,
    ScanLogResponse,
)
from ..services.audit_service import get_client_ip, log_audit, query_audit
from ..services.crypto import encrypt_api_key, mask_api_key
from ..services.integration_data_access import get_data_access, get_revoke_url

logger = logging.getLogger(__name__)
router = APIRouter(tags=["integrations"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _require_org_member(org_id: str, user: User, db: AsyncSession) -> OrgMember:
    """Raise 403 if user is not a member of the org."""
    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id,
            OrgMember.user_id == user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    return membership


def _to_response(integration: OrgIntegration) -> dict:
    """Convert OrgIntegration ORM object to response dict with computed fields."""
    has_token = bool(integration.access_token or integration.credentials)
    token_masked: str | None = None
    if has_token:
        # Mask whichever token is present (access_token preferred)
        raw = integration.access_token or integration.credentials or ""
        token_masked = mask_api_key(raw)

    return {
        "id": integration.id,
        "org_id": integration.org_id,
        "provider": integration.provider,
        "category": integration.category,
        "auth_type": integration.auth_type,
        "status": integration.status,
        "scopes": integration.scopes,
        "metadata_json": integration.metadata_json,
        "connected_by": integration.connected_by,
        "last_scan_at": integration.last_scan_at,
        "created_at": integration.created_at,
        "updated_at": integration.updated_at,
        "has_token": has_token,
        "token_masked": token_masked,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/api/orgs/{org_id}/integrations/summary")
@limiter.limit("60/minute")
async def get_processing_summary(
    request: Request,
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingSummary:
    """Aggregate scan stats for all integrations in the org this calendar month.

    Includes per-integration token cost estimates (via services/usage_costs),
    a lifetime-totals roll-up, and a staleness flag (true when the integration
    hasn't been scanned in STALE_THRESHOLD_DAYS or more).
    """
    from datetime import timedelta

    from ..models.integration import IntegrationScanItem
    from ..services.usage_costs import STALE_THRESHOLD_DAYS, estimate_cost_usd

    await _require_org_member(org_id, user, db)

    # Fetch all integrations for this org
    integrations_result = await db.execute(select(OrgIntegration).where(OrgIntegration.org_id == org_id))
    integrations = integrations_result.scalars().all()

    # Monthly window
    now = datetime.now(tz=UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    stale_cutoff = now - timedelta(days=STALE_THRESHOLD_DAYS)

    total_scans = 0
    total_tokens_month = 0
    total_resources = 0
    total_entries = 0
    total_cost_month = 0.0
    total_tokens_lifetime = 0
    total_cost_lifetime = 0.0
    stale_count = 0
    by_integration: list[dict] = []

    for intg in integrations:
        # Scans this month for this integration
        scans_result = await db.execute(
            select(IntegrationScanLog).where(
                IntegrationScanLog.integration_id == intg.id,
                IntegrationScanLog.started_at >= month_start,
            )
        )
        scans = scans_result.scalars().all()

        scans_count = len(scans)
        tokens_month = sum(s.ai_tokens_used for s in scans)
        resources = sum(s.resources_scanned for s in scans)
        entries = sum(s.entries_created + s.entries_updated for s in scans)

        # Lifetime totals (all scans, all time) — one roll-up per integration
        lifetime_result = await db.execute(
            select(IntegrationScanLog).where(IntegrationScanLog.integration_id == intg.id)
        )
        lifetime_scans = lifetime_result.scalars().all()
        tokens_lifetime = sum(s.ai_tokens_used for s in lifetime_scans)

        # Cost: aggregate per-item so we respect per-model pricing. Fall back
        # to the dominant model in scan_logs if items don't record it.
        items_result = await db.execute(
            select(IntegrationScanItem.ai_model_used, IntegrationScanItem.tokens_used)
            .join(
                IntegrationScanLog,
                IntegrationScanLog.id == IntegrationScanItem.scan_log_id,
            )
            .where(
                IntegrationScanLog.integration_id == intg.id,
                IntegrationScanItem.tokens_used.isnot(None),
            )
        )
        cost_lifetime = sum(
            estimate_cost_usd(row.ai_model_used, row.tokens_used or 0) for row in items_result.all()
        )
        # Month-cost uses the same rows but filtered by scan start; easier to
        # derive via ratio than a second query unless lifetime_tokens is 0.
        cost_month = (
            cost_lifetime * (tokens_month / tokens_lifetime) if tokens_lifetime > 0 else 0.0
        )

        # Staleness: true when no last-scan timestamp or it's older than cutoff
        is_stale = intg.last_scan_at is None or intg.last_scan_at < stale_cutoff
        if is_stale:
            stale_count += 1

        total_scans += scans_count
        total_tokens_month += tokens_month
        total_cost_month += cost_month
        total_resources += resources
        total_entries += entries
        total_tokens_lifetime += tokens_lifetime
        total_cost_lifetime += cost_lifetime

        by_integration.append(
            {
                "integration_id": intg.id,
                "provider": intg.provider,
                "category": intg.category,
                "status": intg.status,
                "scans_this_month": scans_count,
                "tokens_this_month": tokens_month,
                "estimated_cost_usd_this_month": round(cost_month, 4),
                "tokens_lifetime": tokens_lifetime,
                "estimated_cost_usd_lifetime": round(cost_lifetime, 4),
                "resources_scanned": resources,
                "entries_generated": entries,
                "last_scan_at": intg.last_scan_at.isoformat() if intg.last_scan_at else None,
                "is_stale": is_stale,
            }
        )

    return ProcessingSummary(
        total_integrations=len(integrations),
        total_scans_this_month=total_scans,
        total_tokens_this_month=total_tokens_month,
        total_resources_scanned=total_resources,
        total_entries_generated=total_entries,
        estimated_cost_usd_this_month=round(total_cost_month, 4),
        total_tokens_lifetime=total_tokens_lifetime,
        estimated_cost_usd_lifetime=round(total_cost_lifetime, 4),
        stale_integration_count=stale_count,
        by_integration=by_integration,
    )


@router.get("/api/orgs/{org_id}/integrations")
@limiter.limit("60/minute")
async def list_integrations(
    request: Request,
    org_id: str,
    category: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[IntegrationListResponse]:
    """List all integrations for the org, optionally filtered by category."""
    await _require_org_member(org_id, user, db)

    query = select(OrgIntegration).where(OrgIntegration.org_id == org_id)
    if category:
        query = query.where(OrgIntegration.category == category)
    query = query.order_by(OrgIntegration.created_at.desc())

    result = await db.execute(query)
    integrations = result.scalars().all()

    return [
        IntegrationListResponse(
            id=i.id,
            provider=i.provider,
            category=i.category,
            status=i.status,
            last_scan_at=i.last_scan_at,
            created_at=i.created_at,
        )
        for i in integrations
    ]


@router.post("/api/orgs/{org_id}/integrations", status_code=201)
@limiter.limit("30/minute")
async def connect_integration(
    request: Request,
    org_id: str,
    body: IntegrationConnect,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Connect a new external service to the org."""
    await _require_org_member(org_id, user, db)

    # Reject requests that would create a broken integration. OAuth providers
    # must go through the /api/integrations/oauth/authorize -> callback flow,
    # which creates the integration server-side once tokens are returned.
    # Credential-based providers must provide credentials up front.
    if body.auth_type == "oauth":
        raise HTTPException(
            status_code=400,
            detail="OAuth providers must be connected via /api/integrations/oauth/authorize, not this endpoint",
        )
    if body.auth_type == "credential" and not body.credentials:
        raise HTTPException(
            status_code=400,
            detail=f"Credentials are required to connect provider '{body.provider}'",
        )
    if body.auth_type not in {"oauth", "credential", "github_app"}:
        raise HTTPException(status_code=400, detail=f"Unknown auth_type: {body.auth_type}")

    # 409 if provider already connected
    existing = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.org_id == org_id,
            OrgIntegration.provider == body.provider,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Provider '{body.provider}' is already connected for this organization",
        )

    # Validate credentials before storing
    if body.auth_type == "credential" and body.credentials:
        import json as _json

        from ..services.credential_validators import validate_credentials

        try:
            cred_data = _json.loads(body.credentials)
        except _json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid credentials JSON")

        validation = await validate_credentials(body.provider, cred_data)
        if not validation["ok"]:
            raise HTTPException(status_code=400, detail=validation["error"])

    # Encrypt sensitive fields before storing
    encrypted_access_token = encrypt_api_key(body.access_token) if body.access_token else None
    encrypted_refresh_token = encrypt_api_key(body.refresh_token) if body.refresh_token else None
    encrypted_credentials = encrypt_api_key(body.credentials) if body.credentials else None

    scopes_json = json.dumps(body.scopes)
    metadata_json = json.dumps(body.metadata) if body.metadata else None

    # Providers that require per-resource scope selection after connect — same
    # list as the OAuth callback. Even when connected via credential/PAT, the
    # user must still pick which projects/spaces yeaboi should scan.
    SCOPE_RESTRICTABLE = {"confluence", "jira", "azure_devops"}
    initial_status = "pending_scope" if body.provider in SCOPE_RESTRICTABLE else "active"

    integration = OrgIntegration(
        org_id=org_id,
        provider=body.provider,
        category=body.category,
        auth_type=body.auth_type,
        status=initial_status,
        access_token=encrypted_access_token,
        refresh_token=encrypted_refresh_token,
        credentials=encrypted_credentials,
        scopes=scopes_json,
        metadata_json=metadata_json,
        connected_by=user.id,
    )
    db.add(integration)
    await db.flush()

    try:
        await log_audit(
            db,
            org_id=org_id,
            user_id=user.id,
            action="create",
            resource_type="integration",
            resource_id=integration.id,
            metadata={"provider": body.provider, "category": body.category},
            ip_address=get_client_ip(request),
        )
    except Exception:
        logger.warning("Audit log failed for integration connect", exc_info=True)

    await db.commit()
    await db.refresh(integration)
    logger.info("Integration connected: %s for org %s by user %s", body.provider, org_id, user.id)

    return _to_response(integration)


@router.get("/api/orgs/{org_id}/integrations/{integration_id}")
@limiter.limit("60/minute")
async def get_integration(
    request: Request,
    org_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a single integration by ID."""
    await _require_org_member(org_id, user, db)

    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    return _to_response(integration)


@router.get("/api/orgs/{org_id}/integrations/{integration_id}/available-scopes")
@limiter.limit("30/minute")
async def list_available_scopes(
    request: Request,
    org_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List the resources (spaces, projects, etc.) the connected integration
    can access, so the user can pick which ones yeaboi is allowed to scan."""
    from ..services.integration_scopes import get_available_scopes

    await _require_org_member(org_id, user, db)

    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    scopes = await get_available_scopes(integration)
    return {"provider": integration.provider, "scopes": scopes}


@router.patch("/api/orgs/{org_id}/integrations/{integration_id}")
@limiter.limit("30/minute")
async def update_integration(
    request: Request,
    org_id: str,
    integration_id: str,
    body: IntegrationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update an integration's metadata and/or status."""
    await _require_org_member(org_id, user, db)

    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    if body.metadata is not None:
        # Preserve existing metadata fields and merge the update
        existing_meta = {}
        if integration.metadata_json:
            try:
                existing_meta = json.loads(integration.metadata_json)
            except json.JSONDecodeError:
                existing_meta = {}
        merged = {**existing_meta, **body.metadata}
        integration.metadata_json = json.dumps(merged)
        # If the user has now picked their scopes and the integration was pending,
        # transition to active so scans can run. Slack uses a two-group picker
        # (scan_channels + notification_channels) — either being non-empty counts
        # as "configured".
        scope_lists = (
            merged.get("included_scopes"),
            merged.get("scan_channels"),
            merged.get("notification_channels"),
        )
        has_any_scope = any(isinstance(v, list) and len(v) > 0 for v in scope_lists)
        if integration.status == "pending_scope" and has_any_scope:
            integration.status = "active"
            logger.info("Integration %s finalised: scopes selected", integration_id)
    if body.status is not None:
        integration.status = body.status
    if body.credentials is not None:
        import json as _json

        from ..services.credential_validators import validate_credentials

        try:
            cred_data = _json.loads(body.credentials)
        except _json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid credentials JSON")

        validation = await validate_credentials(integration.provider, cred_data)
        if not validation["ok"]:
            raise HTTPException(status_code=400, detail=validation["error"])

        integration.credentials = encrypt_api_key(body.credentials)

    # When a Slack integration becomes active, stash the connecting user's team
    # onto metadata.admin_team_id so the dispatcher knows which team to fan out to.
    if integration.provider == "slack" and integration.status == "active":
        from ..models.organization import TeamMember

        tm_result = await db.execute(
            select(TeamMember).where(TeamMember.user_id == integration.connected_by).limit(1)
        )
        tm = tm_result.scalar_one_or_none()
        if tm:
            existing_meta = json.loads(integration.metadata_json or "{}")
            existing_meta["admin_team_id"] = tm.team_id
            integration.metadata_json = json.dumps(existing_meta)

    await db.commit()
    await db.refresh(integration)
    logger.info("Integration updated: %s", integration_id)

    return _to_response(integration)


@router.delete("/api/orgs/{org_id}/integrations/{integration_id}", status_code=204)
@limiter.limit("30/minute")
async def disconnect_integration(
    request: Request,
    org_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Disconnect (delete) an integration."""
    await _require_org_member(org_id, user, db)

    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    provider = integration.provider
    await db.delete(integration)

    try:
        await log_audit(
            db,
            org_id=org_id,
            user_id=user.id,
            action="delete",
            resource_type="integration",
            resource_id=integration_id,
            metadata={"provider": provider},
            ip_address=get_client_ip(request),
        )
    except Exception:
        logger.warning("Audit log failed for integration disconnect", exc_info=True)

    await db.commit()
    logger.info("Integration disconnected: %s for org %s", integration_id, org_id)


@router.get("/api/orgs/{org_id}/integrations/{integration_id}/scans")
@limiter.limit("300/minute")
async def list_scan_logs(
    request: Request,
    org_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ScanLogResponse]:
    """List the last 50 scan logs for an integration."""
    await _require_org_member(org_id, user, db)

    # Verify integration belongs to org
    intg_result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    if not intg_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Integration not found")

    result = await db.execute(
        select(IntegrationScanLog)
        .where(IntegrationScanLog.integration_id == integration_id)
        .order_by(IntegrationScanLog.started_at.desc())
        .limit(50)
    )
    logs = result.scalars().all()

    return [
        ScanLogResponse(
            id=log.id,
            integration_id=log.integration_id,
            scan_type=log.scan_type,
            status=log.status,
            started_at=log.started_at,
            completed_at=log.completed_at,
            resources_scanned=log.resources_scanned,
            entries_created=log.entries_created,
            entries_updated=log.entries_updated,
            ai_calls_made=log.ai_calls_made,
            ai_tokens_used=log.ai_tokens_used,
            error_message=log.error_message,
            status_log=log.details_json,
        )
        for log in logs
    ]


@router.get("/api/orgs/{org_id}/integrations/{integration_id}/scans/{scan_id}/items")
@limiter.limit("300/minute")
async def list_scan_items(
    request: Request,
    org_id: str,
    integration_id: str,
    scan_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ScanItemResponse]:
    """List the last 200 items for a scan log."""
    await _require_org_member(org_id, user, db)

    # Verify scan belongs to integration which belongs to org
    intg_result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    if not intg_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Integration not found")

    scan_result = await db.execute(
        select(IntegrationScanLog).where(
            IntegrationScanLog.id == scan_id,
            IntegrationScanLog.integration_id == integration_id,
        )
    )
    if not scan_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Scan log not found")

    result = await db.execute(
        select(IntegrationScanItem)
        .where(IntegrationScanItem.scan_log_id == scan_id)
        .order_by(IntegrationScanItem.created_at)
        .limit(200)
    )
    items = result.scalars().all()

    return [
        ScanItemResponse(
            id=item.id,
            resource_path=item.resource_path,
            action=item.action,
            ai_model_used=item.ai_model_used,
            tokens_used=item.tokens_used,
            directory_entry_id=item.directory_entry_id,
            reason=item.reason,
            created_at=item.created_at,
        )
        for item in items
    ]


@router.post("/api/orgs/{org_id}/integrations/{integration_id}/scan", status_code=202)
@limiter.limit("10/minute")
async def trigger_scan(
    request: Request,
    org_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a scan for an integration. Returns immediately with scan ID."""
    import asyncio

    from ..models.organization import Team

    await _require_org_member(org_id, user, db)

    # Verify integration belongs to org and is active
    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    if integration.status != "active":
        raise HTTPException(status_code=400, detail="Integration is not active")

    # Check no scan is already running
    running_result = await db.execute(
        select(IntegrationScanLog).where(
            IntegrationScanLog.integration_id == integration_id,
            IntegrationScanLog.status == "running",
        )
    )
    if running_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A scan is already running for this integration")

    # Resolve the org's first team
    team_result = await db.execute(select(Team).where(Team.org_id == org_id).limit(1))
    team = team_result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=400, detail="No team found for this organization")

    # Create scan log so we can return the ID immediately
    scan_log = IntegrationScanLog(
        integration_id=integration_id,
        scan_type="full",
        status="running",
        started_at=datetime.now(tz=UTC),
    )
    db.add(scan_log)
    await db.flush()
    scan_id = scan_log.id
    await db.commit()

    # Dispatch scan as background task
    from ..services.connectors import dispatch_scan

    asyncio.create_task(dispatch_scan(integration.provider, integration_id, org_id, team.id, scan_id))

    return {"scan_id": scan_id, "status": "running"}


# ---------------------------------------------------------------------------
# Trust & transparency endpoints
# ---------------------------------------------------------------------------


@router.get("/api/integrations/{provider}/data-access")
@limiter.limit("60/minute")
async def get_provider_data_access(request: Request, provider: str) -> dict:
    """Return the data-access declaration for a provider.

    Powers the pre-connect summary screen. Public (no auth) because the
    information is already published in our docs — it's the contract that
    governs what we'd read if the customer chose to connect.
    """
    declaration = get_data_access(provider)
    if declaration is None:
        return {
            "provider": provider,
            "reads": [],
            "does_not_read": [],
            "writes": [],
            "retention_days": -1,
            "summary": (
                "Data access details for this integration are still being "
                "finalised. Please contact support before connecting."
            ),
            "declared": False,
        }
    return {"provider": provider, "declared": True, **declaration}


@router.get("/api/orgs/{org_id}/integrations/{integration_id}/trust")
@limiter.limit("60/minute")
async def get_integration_trust(
    request: Request,
    org_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Single-shot payload for the per-integration Trust page."""
    from ..services.integration_scopes import get_available_scopes

    await _require_org_member(org_id, user, db)

    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    selected_meta: dict = {}
    if integration.metadata_json:
        try:
            selected_meta = json.loads(integration.metadata_json)
        except json.JSONDecodeError:
            selected_meta = {}

    selected_scope_ids = selected_meta.get("included_scopes") or []
    if integration.provider == "slack":
        selected_scope_ids = selected_meta.get("scan_channels") or []
    resolved_scopes: list[dict] = []
    if selected_scope_ids:
        try:
            available = await get_available_scopes(integration)
            by_id = {str(s.get("id")): s for s in available}
            for sid in selected_scope_ids:
                entry = by_id.get(str(sid))
                if entry:
                    resolved_scopes.append(entry)
                else:
                    resolved_scopes.append({"id": str(sid), "name": str(sid), "stale": True})
        except Exception:
            logger.warning(
                "Failed to resolve scopes for trust page (integration=%s)",
                integration_id,
                exc_info=True,
            )
            resolved_scopes = [
                {"id": str(s), "name": str(s), "stale": True} for s in selected_scope_ids
            ]

    scans_result = await db.execute(
        select(IntegrationScanLog)
        .where(IntegrationScanLog.integration_id == integration_id)
        .order_by(IntegrationScanLog.started_at.desc())
        .limit(5)
    )
    recent_scans = [
        {
            "id": s.id,
            "scan_type": s.scan_type,
            "status": s.status,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "resources_scanned": s.resources_scanned,
            "entries_created": s.entries_created,
            "entries_updated": s.entries_updated,
            "ai_tokens_used": s.ai_tokens_used,
            "error_message": s.error_message,
        }
        for s in scans_result.scalars().all()
    ]

    audit_entries = await query_audit(
        db,
        org_id=org_id,
        resource_type="integration",
        resource_id=integration_id,
        limit=10,
    )
    legacy_entries = await query_audit(
        db,
        org_id=org_id,
        resource_type="integration",
        resource_id=integration.provider,
        limit=10,
    )
    combined = audit_entries + legacy_entries
    combined.sort(key=lambda e: e.created_at, reverse=True)
    audit_payload = [
        {
            "id": e.id,
            "action": e.action,
            "user_id": e.user_id,
            "metadata": e.metadata_ or {},
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in combined[:10]
    ]

    declaration = get_data_access(integration.provider)
    data_access = (
        {"declared": True, **declaration} if declaration is not None else {"declared": False}
    )

    return {
        "integration": _to_response(integration),
        "scopes_granted": json.loads(integration.scopes or "[]"),
        "selected_scopes": resolved_scopes,
        "data_access": data_access,
        "recent_scans": recent_scans,
        "audit_events": audit_payload,
        "revoke_supported": get_revoke_url(integration.provider) is not None
        or integration.auth_type == "github_app",
    }


@router.post("/api/orgs/{org_id}/integrations/{integration_id}/revoke", status_code=200)
@limiter.limit("10/minute")
async def revoke_integration(
    request: Request,
    org_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Revoke the integration's access at the source, then delete it locally."""
    from ..services.crypto import decrypt_api_key
    from ..services.github_app import generate_app_jwt
    from ..services.oauth_registry import get_oauth_config

    await _require_org_member(org_id, user, db)

    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    reason = (body.get("reason") or "").strip()[:500] if isinstance(body, dict) else ""

    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.id == integration_id,
            OrgIntegration.org_id == org_id,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    provider = integration.provider
    auth_type = integration.auth_type
    upstream_revoked = False
    upstream_error: str | None = None

    try:
        import httpx

        if auth_type == "github_app" and integration.metadata_json:
            try:
                meta = json.loads(integration.metadata_json)
                installation_id = meta.get("installation_id")
            except json.JSONDecodeError:
                installation_id = None
            if installation_id:
                app_jwt = generate_app_jwt()
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.delete(
                        f"https://api.github.com/app/installations/{installation_id}",
                        headers={
                            "Authorization": f"Bearer {app_jwt}",
                            "Accept": "application/vnd.github+json",
                            "X-GitHub-Api-Version": "2022-11-28",
                        },
                    )
                upstream_revoked = resp.status_code in (204, 404)
                if not upstream_revoked:
                    upstream_error = f"GitHub responded {resp.status_code}"
        else:
            revoke_url = get_revoke_url(provider)
            if revoke_url and integration.access_token:
                access = decrypt_api_key(integration.access_token)
                oauth_cfg = get_oauth_config(provider)
                if provider == "slack":
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        resp = await client.get(revoke_url, params={"token": access})
                    upstream_revoked = resp.status_code == 200 and resp.json().get("ok", False)
                else:
                    import os as _os

                    payload = {"token": access}
                    if oauth_cfg:
                        payload["client_id"] = _os.environ.get(oauth_cfg["env_client_id"], "")
                        payload["client_secret"] = _os.environ.get(
                            oauth_cfg["env_client_secret"], ""
                        )
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        resp = await client.post(revoke_url, data=payload)
                    upstream_revoked = resp.status_code in (200, 204)
                if not upstream_revoked and upstream_error is None:
                    upstream_error = f"{provider} revoke responded {resp.status_code}"
    except Exception as exc:
        logger.warning(
            "Upstream revoke failed for provider=%s integration=%s: %s",
            provider,
            integration_id,
            exc,
        )
        upstream_error = str(exc)[:200]

    await db.delete(integration)

    try:
        await log_audit(
            db,
            org_id=org_id,
            user_id=user.id,
            action="revoke",
            resource_type="integration",
            resource_id=integration_id,
            metadata={
                "provider": provider,
                "reason": reason,
                "upstream_revoked": upstream_revoked,
                "upstream_error": upstream_error,
            },
            ip_address=get_client_ip(request),
        )
    except Exception:
        logger.warning("Audit log failed for integration revoke", exc_info=True)

    await db.commit()
    logger.info(
        "Integration revoked: %s for org %s (upstream_revoked=%s)",
        integration_id,
        org_id,
        upstream_revoked,
    )

    return {
        "ok": True,
        "upstream_revoked": upstream_revoked,
        "upstream_error": upstream_error,
    }
