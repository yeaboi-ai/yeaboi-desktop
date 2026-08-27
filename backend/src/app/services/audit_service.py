"""Audit logging service.

Provides a single helper to record audit log entries for sensitive operations.
"""

from __future__ import annotations

import logging

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.audit import AuditLog

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str | None:
    """Extract client IP from request, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


async def log_audit(
    db: AsyncSession,
    *,
    org_id: str,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Record an audit log entry.

    Args:
        db: Database session (entry is flushed, not committed — the
            caller's transaction handles the commit).
        org_id: Organization the action belongs to.
        user_id: User who performed the action.
        action: Verb — create, update, delete, start, stop, approve,
                reject, restore, lock, invite, remove, role_change.
        resource_type: Noun — project, session, card, board, blueprint,
                       orchestrator, org, team, member, iteration, ai_config.
        resource_id: ID of the affected resource (optional).
        metadata: Extra context (old/new values, cascaded deletes, etc.).
        ip_address: Client IP (use get_client_ip(request) to obtain).
    """
    entry = AuditLog(
        org_id=org_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata_=metadata or {},
        ip_address=ip_address,
    )
    db.add(entry)
    await db.flush()
    logger.info(
        "Audit: user=%s action=%s resource=%s/%s org=%s",
        user_id,
        action,
        resource_type,
        resource_id or "-",
        org_id,
    )


async def query_audit(
    db: AsyncSession,
    *,
    org_id: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    limit: int = 50,
) -> list[AuditLog]:
    """Return audit log entries for an org, newest first.

    Filters by ``resource_type`` / ``resource_id`` when provided. Used by the
    Trust page to render the timeline for a specific integration without
    re-implementing the query in the router. Capped at ``limit`` (default 50)
    rows to keep response sizes predictable.
    """
    stmt = select(AuditLog).where(AuditLog.org_id == org_id)
    if resource_type is not None:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if resource_id is not None:
        stmt = stmt.where(AuditLog.resource_id == resource_id)
    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())
