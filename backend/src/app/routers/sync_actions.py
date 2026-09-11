"""Manual outbound sync — the "Push to Jira" / "Push to Azure DevOps" button.

Looks up the project's IntegrationProjectMapping for the requested provider,
fetches the integration's encrypted credentials, runs the translator, calls
the writer, persists a CardExternalLink, and returns a sync_status payload
the frontend's TicketSidebar can render directly.

Phase 4b-1 supports Jira only; ADO support arrives with a writer_ado.py and
the matching PAT-based connect flow in a follow-up.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.board import Board, BoardColumn, Card
from ..models.integration import OrgIntegration
from ..models.organization import Organization
from ..models.session import Session
from ..models.sync import CardExternalLink, IntegrationProjectMapping, SyncEvent
from ..models.user import User
from ..services.crypto import decrypt_api_key
from ..services.sync.ado_writer import AdoSyncError, AdoWriter
from ..services.sync.jira_writer import JiraSyncError, JiraWriter
from ..services.sync.translator import FieldMappings, card_to_ado_patch_doc, card_to_jira_payload

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sync"])


class PushBody(BaseModel):
    provider: str  # "jira" | "azure_devops"


class ResolveBody(BaseModel):
    choice: str  # "local" | "remote"


async def _load_card_in_org(card_id: str, org_id: str, db: AsyncSession) -> tuple[Card, Session]:
    row = (
        await db.execute(
            select(Card, Session)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .join(Board, Board.id == BoardColumn.board_id)
            .join(Session, Session.id == Board.session_id)
            .where(Card.id == card_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    card, project = row
    if project.org_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return card, project


@router.post("/api/sync/cards/{card_id}/push")
async def push_card(
    card_id: str,
    body: PushBody,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if body.provider not in ("jira", "azure_devops"):
        raise HTTPException(status_code=400, detail=f"Provider not yet supported: {body.provider}")

    card, project = await _load_card_in_org(card_id, org.id, db)

    # Find an enabled IntegrationProjectMapping for this project + provider.
    mapping_row = (
        await db.execute(
            select(IntegrationProjectMapping, OrgIntegration)
            .join(OrgIntegration, OrgIntegration.id == IntegrationProjectMapping.integration_id)
            .where(
                IntegrationProjectMapping.internal_session_id == project.id,
                IntegrationProjectMapping.enabled.is_(True),
                OrgIntegration.provider == body.provider,
                OrgIntegration.org_id == org.id,
            )
        )
    ).first()
    if not mapping_row:
        raise HTTPException(
            status_code=400,
            detail=(
                f"No {body.provider} mapping is configured for this project. "
                "Configure one under Settings → Integrations."
            ),
        )
    mapping, integration = mapping_row

    field_mappings = FieldMappings.from_row(mapping.field_mappings)

    # Idempotency — if a CardExternalLink already exists for this provider,
    # PUT/PATCH to update; otherwise POST and persist a new link.
    existing_link = (
        await db.execute(
            select(CardExternalLink).where(
                CardExternalLink.card_id == card.id,
                CardExternalLink.provider == body.provider,
            )
        )
    ).scalar_one_or_none()

    now = datetime.now(UTC)
    try:
        if body.provider == "jira":
            link = await _push_to_jira(
                card, mapping, integration, existing_link, field_mappings, org.id, now, db
            )
        else:
            link = await _push_to_ado(
                card, mapping, integration, existing_link, field_mappings, org.id, now, db
            )

    except (JiraSyncError, AdoSyncError) as exc:
        if existing_link is not None:
            existing_link.sync_state = "error"
            existing_link.last_error = exc.message
            existing_link.retry_count = (existing_link.retry_count or 0) + 1
            db.add(_event(card, existing_link, "out", "update", "error", exc.message))
        else:
            db.add(_event(card, None, "out", "create", "error", exc.message))
        await db.commit()
        if exc.status_code in (401, 403):
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
        raise HTTPException(status_code=502, detail=f"{body.provider}: {exc.message}")

    # Best-effort WS broadcast so other viewers see the badge appear.
    try:
        from ..ws.board_ws import board_manager

        await board_manager.broadcast_card_event(card.column_id, "card.updated", card)
    except Exception:  # noqa: BLE001
        logger.debug("WS broadcast skipped after Jira push for card %s", card.id)

    return {"card_id": card.id, "sync_status": _link_to_status_dict(link)}


def _event(
    card: Card,
    link: CardExternalLink | None,
    direction: str,
    action: str,
    status: str,
    error: str | None = None,
) -> SyncEvent:
    return SyncEvent(
        card_id=card.id,
        link_id=link.id if link is not None else None,
        direction=direction,
        action=action,
        status=status,
        error=error,
    )


def _link_to_status_dict(link: CardExternalLink) -> dict:
    """Render a CardExternalLink into the JSON shape the sidebar expects."""
    return {
        "provider": link.provider,
        "external_id": link.external_id,
        "external_key": link.external_key,
        "external_url": link.external_url,
        "state": link.sync_state,
        "last_synced_at": link.last_synced_at.isoformat() if link.last_synced_at else None,
        "link_id": link.id,
    }


@router.post("/api/sync/links/{link_id}/resolve")
async def resolve_conflict(
    link_id: str,
    body: ResolveBody,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Resolve a sync conflict by picking which side wins.

    "local"  — re-push the local card to the external system, clearing the conflict.
    "remote" — flip the link to ``remote_dirty`` so the next inbound webhook
               applies the remote state (active fetch lives in 4b-3 alongside
               the polling fallback).
    """
    if body.choice not in ("local", "remote"):
        raise HTTPException(status_code=422, detail="choice must be 'local' or 'remote'")

    link = (
        await db.execute(select(CardExternalLink).where(CardExternalLink.id == link_id))
    ).scalar_one_or_none()
    if not link or link.org_id != org.id:
        raise HTTPException(status_code=404, detail="Sync link not found")

    card = (
        await db.execute(select(Card).where(Card.id == link.card_id))
    ).scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    if body.choice == "remote":
        link.sync_state = "remote_dirty"
        link.last_error = None
        db.add(_event(card, link, "in", "conflict", "ok"))
        await db.commit()
        await db.refresh(link)
        return {"resolved": "remote", "sync_status": _link_to_status_dict(link)}

    # "local" — re-push.
    session_id = (
        await db.execute(
            select(Board.session_id)
            .join(BoardColumn, BoardColumn.board_id == Board.id)
            .where(BoardColumn.id == card.column_id)
        )
    ).scalar_one_or_none()
    mapping_row = (
        await db.execute(
            select(IntegrationProjectMapping, OrgIntegration)
            .join(
                OrgIntegration,
                OrgIntegration.id == IntegrationProjectMapping.integration_id,
            )
            .where(
                IntegrationProjectMapping.integration_id == link.integration_id,
                IntegrationProjectMapping.internal_session_id == session_id,
                OrgIntegration.org_id == org.id,
            )
        )
    ).first()
    if not mapping_row:
        raise HTTPException(status_code=400, detail="No mapping found for this link")
    mapping, integration = mapping_row

    field_mappings = FieldMappings.from_row(mapping.field_mappings)
    now = datetime.now(UTC)
    try:
        if link.provider == "jira":
            link = await _push_to_jira(card, mapping, integration, link, field_mappings, org.id, now, db)
        else:
            link = await _push_to_ado(card, mapping, integration, link, field_mappings, org.id, now, db)
    except (JiraSyncError, AdoSyncError) as exc:
        link.last_error = exc.message
        await db.commit()
        raise HTTPException(status_code=502, detail=exc.message) from exc

    return {"resolved": "local", "sync_status": _link_to_status_dict(link)}


async def _push_to_jira(
    card: Card,
    mapping: IntegrationProjectMapping,
    integration: OrgIntegration,
    existing_link: CardExternalLink | None,
    field_mappings: FieldMappings,
    org_id: str,
    now: datetime,
    db: AsyncSession,
) -> CardExternalLink:
    if not integration.access_token:
        raise JiraSyncError(400, "Jira integration has no OAuth token")
    payload = card_to_jira_payload(
        title=card.title,
        description=card.description,
        priority=card.priority,
        story_points=card.story_points,
        labels=card.labels or [],
        acceptance_criteria=card.acceptance_criteria or [],
        issue_type=mapping.default_issue_type,
        project_id=mapping.external_project_id or mapping.external_project_key,
        field_mappings=field_mappings,
    )
    token = decrypt_api_key(integration.access_token)
    writer = JiraWriter(token)

    if existing_link is None:
        result = await writer.create_issue(payload)
        link = CardExternalLink(
            card_id=card.id,
            org_id=org_id,
            integration_id=integration.id,
            provider="jira",
            external_id=result.issue_id,
            external_key=result.issue_key,
            external_url=result.browse_url,
            last_synced_at=now,
            last_local_change_at=card.updated_at,
            sync_state="synced",
        )
        db.add(link)
        await db.flush()
        db.add(_event(card, link, "out", "create", "ok"))
        await db.commit()
        await db.refresh(link)
        return link

    await writer.update_issue(existing_link.external_id, payload)
    existing_link.last_synced_at = now
    existing_link.last_local_change_at = card.updated_at
    existing_link.sync_state = "synced"
    existing_link.last_error = None
    existing_link.retry_count = 0
    db.add(_event(card, existing_link, "out", "update", "ok"))
    await db.commit()
    await db.refresh(existing_link)
    return existing_link


async def _push_to_ado(
    card: Card,
    mapping: IntegrationProjectMapping,
    integration: OrgIntegration,
    existing_link: CardExternalLink | None,
    field_mappings: FieldMappings,
    org_id: str,
    now: datetime,
    db: AsyncSession,
) -> CardExternalLink:
    patch_doc = card_to_ado_patch_doc(
        title=card.title,
        description=card.description,
        priority=card.priority,
        story_points=card.story_points,
        labels=card.labels or [],
        acceptance_criteria=card.acceptance_criteria or [],
        field_mappings=field_mappings,
    )
    writer = AdoWriter(integration)

    if existing_link is None:
        result = await writer.create_work_item(
            project=mapping.external_project_key,
            work_item_type=mapping.default_issue_type,
            patch_doc=patch_doc,
        )
        link = CardExternalLink(
            card_id=card.id,
            org_id=org_id,
            integration_id=integration.id,
            provider="azure_devops",
            external_id=result.work_item_id,
            external_key=result.work_item_id,  # ADO has no human key — the numeric id is the key
            external_url=result.web_url,
            last_synced_at=now,
            last_local_change_at=card.updated_at,
            sync_state="synced",
            version_token=str(result.rev),
        )
        db.add(link)
        await db.flush()
        db.add(_event(card, link, "out", "create", "ok"))
        await db.commit()
        await db.refresh(link)
        return link

    new_rev = await writer.update_work_item(existing_link.external_id, patch_doc)
    existing_link.last_synced_at = now
    existing_link.last_local_change_at = card.updated_at
    existing_link.sync_state = "synced"
    existing_link.last_error = None
    existing_link.retry_count = 0
    existing_link.version_token = str(new_rev)
    db.add(_event(card, existing_link, "out", "update", "ok"))
    await db.commit()
    await db.refresh(existing_link)
    return existing_link
