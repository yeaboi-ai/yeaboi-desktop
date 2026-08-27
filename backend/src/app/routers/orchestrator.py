"""Orchestrator API — start/stop/status and agent approve/reject endpoints."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, require_admin
from ..logging_config import propagate_context
from ..models.board import Board, BoardColumn, Card
from ..models.project import Project
from ..models.user import User
from ..orchestrator.runner import is_running, start_orchestrator, stop_orchestrator
from ..orchestrator.state_machine import can_transition
from ..orchestrator.workspace import merge_pull_request
from ..schemas.board import CardResponse
from ..schemas.orchestrator import AgentApprovalRequest, OrchestratorStartRequest, OrchestratorStatusResponse
from ..services.audit_service import get_client_ip, log_audit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["orchestrator"])


async def _verify_project_access(project_id: str, user: User, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.owner_id == user.id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ─── Orchestrator Lifecycle ──────────────────────────────────────────────────


@router.post("/api/projects/{project_id}/orchestrator/start", response_model=OrchestratorStatusResponse)
async def orchestrator_start(
    request: Request,
    project_id: str,
    body: OrchestratorStartRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OrchestratorStatusResponse:
    """Start the orchestrator polling loop for a project. Admin only."""
    project = await _verify_project_access(project_id, user, db)

    if not is_running(project_id):
        background_tasks.add_task(propagate_context(start_orchestrator, project_id))

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="start",
        resource_type="orchestrator",
        resource_id=project_id,
        ip_address=get_client_ip(request),
    )
    await db.commit()
    return OrchestratorStatusResponse(running=True, project_id=project_id)


@router.post("/api/projects/{project_id}/orchestrator/stop", response_model=OrchestratorStatusResponse)
async def orchestrator_stop(
    request: Request,
    project_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OrchestratorStatusResponse:
    """Stop the orchestrator polling loop for a project. Admin only."""
    project = await _verify_project_access(project_id, user, db)
    stop_orchestrator(project_id)
    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="stop",
        resource_type="orchestrator",
        resource_id=project_id,
        ip_address=get_client_ip(request),
    )
    await db.commit()
    return OrchestratorStatusResponse(running=False, project_id=project_id)


@router.get("/api/projects/{project_id}/orchestrator/status", response_model=OrchestratorStatusResponse)
async def orchestrator_status(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrchestratorStatusResponse:
    """Get the current running state of the orchestrator for a project."""
    await _verify_project_access(project_id, user, db)
    return OrchestratorStatusResponse(running=is_running(project_id), project_id=project_id)


# ─── Agent Approval ──────────────────────────────────────────────────────────


@router.post("/api/cards/{card_id}/agent/approve", response_model=CardResponse)
async def agent_approve(
    request: Request,
    card_id: str,
    body: AgentApprovalRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Card:
    """Approve or reject an agent's PR — transitions card to done or back to implementing."""
    card = await _get_card_for_user(card_id, user, db)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    # Look up the board and project through the card's column
    col_result = await db.execute(select(BoardColumn).where(BoardColumn.id == card.column_id))
    current_column = col_result.scalar_one()

    board_result = await db.execute(select(Board).where(Board.id == current_column.board_id))
    board = board_result.scalar_one()

    project_result = await db.execute(select(Project).where(Project.id == board.project_id))
    project = project_result.scalar_one()

    if body.action == "approve":
        if not can_transition(card.agent_status, "done"):
            raise HTTPException(status_code=400, detail=f"Cannot approve card in state: {card.agent_status}")
        card.agent_status = "done"

        # Merge the PR via GitHub API
        merge_ok = False
        if card.agent_pr_url and project.repo_url:
            try:
                merge_ok = merge_pull_request(project.repo_url, card.agent_pr_url)
            except Exception as exc:
                logger.warning("Failed to merge PR %s: %s", card.agent_pr_url, exc)

        log_message = f"PR approved — card marked done. Merge: {'success' if merge_ok else 'failed'}"

        # Rebase all other open agent PRs against updated main
        if merge_ok and project.repo_url:
            try:
                from ..orchestrator.workspace import rebase_open_prs

                rebase_results = rebase_open_prs(project.repo_url)
                if rebase_results:
                    logger.info("Rebased open PRs after merge: %s", rebase_results)
            except Exception as exc:
                logger.warning("Failed to rebase open PRs: %s", exc)

        # Move card to the "Done" column
        done_col_result = await db.execute(
            select(BoardColumn).where(
                BoardColumn.board_id == board.id,
                BoardColumn.name == "Done",
            )
        )
        done_col = done_col_result.scalar_one_or_none()
        if done_col:
            card.column_id = done_col.id

    elif body.action == "reject":
        if not can_transition(card.agent_status, "implementing"):
            raise HTTPException(status_code=400, detail=f"Cannot reject card in state: {card.agent_status}")
        card.agent_status = "implementing"
        log_message = f"PR rejected — sending back to implementing. Feedback: {body.feedback or 'none'}"

        # Move card back to "In Progress" column
        ip_col_result = await db.execute(
            select(BoardColumn).where(
                BoardColumn.board_id == board.id,
                BoardColumn.name == "In Progress",
            )
        )
        ip_col = ip_col_result.scalar_one_or_none()
        if ip_col:
            card.column_id = ip_col.id

    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    card.agent_log = [
        *(card.agent_log or []),
        {"timestamp": datetime.now(UTC).isoformat(), "message": log_message},
    ]
    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="approve" if body.action == "approve" else "reject",
        resource_type="card",
        resource_id=card_id,
        metadata={"pr_url": card.agent_pr_url, "feedback": body.feedback},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(card)

    # Auto-start orchestrator for next wave if not already running
    if body.action == "approve" and not is_running(project.id):
        import asyncio

        asyncio.create_task(start_orchestrator(project.id))
        logger.info("Auto-started orchestrator for next wave after approval")

    return card


@router.post("/api/cards/{card_id}/agent/retry", response_model=CardResponse)
async def agent_retry(
    request: Request,
    card_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Card:
    """Reset a stalled/failed card so the orchestrator picks it up again."""
    result = await db.execute(select(Card).where(Card.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    # Get org_id for audit via column → board
    _col = await db.execute(select(BoardColumn).where(BoardColumn.id == card.column_id))
    _board = await db.execute(select(Board.org_id).where(Board.id == _col.scalar_one().board_id))
    _org_id = _board.scalar_one()

    card.agent_status = None
    card.agent_branch = None
    card.agent_pr_url = None
    card.agent_log = [
        *(card.agent_log or []),
        {"timestamp": datetime.now(UTC).isoformat(), "message": "Reset for retry"},
    ]
    await log_audit(
        db,
        org_id=_org_id,
        user_id=user.id,
        action="retry",
        resource_type="card",
        resource_id=card_id,
        metadata={"title": card.title},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(card)
    return card


@router.post("/api/projects/{project_id}/orchestrator/retry-all")
async def retry_all_stalled(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reset all stalled cards (reviewing/implementing for 10+ min) back to pending."""
    result = await db.execute(select(Board).where(Board.project_id == project_id))
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404)

    # Find all cards stuck in non-terminal states
    col_ids = [c.id for c in board.columns] if hasattr(board, "columns") else []
    if not col_ids:
        col_result = await db.execute(select(BoardColumn.id).where(BoardColumn.board_id == board.id))
        col_ids = list(col_result.scalars().all())

    result = await db.execute(
        select(Card).where(
            Card.column_id.in_(col_ids),
            Card.agent_status.in_(["investigating", "implementing", "reviewing"]),
        )
    )
    stalled = list(result.scalars().all())

    for card in stalled:
        card.agent_status = None
        card.agent_branch = None
        card.agent_pr_url = None
        card.agent_log = [
            *(card.agent_log or []),
            {"timestamp": datetime.now(UTC).isoformat(), "message": "Reset for retry (batch)"},
        ]

    await db.commit()

    # Auto-start orchestrator
    if stalled and not is_running(project_id):
        import asyncio

        asyncio.create_task(start_orchestrator(project_id))

    return {"reset": len(stalled)}


# ─── PR Diff ──────────────────────────────────────────────────────────────────


@router.get("/api/cards/{card_id}/pr-diff")
async def get_pr_diff(
    card_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch the PR diff for inline review."""
    # Simple card lookup without ownership check (already behind auth)
    result = await db.execute(select(Card).where(Card.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail=f"Card {card_id} not found")
    if not card.agent_pr_url:
        raise HTTPException(status_code=404, detail="No PR URL on this card")

    # Get project repo_url through the card's column → board → project
    col_result = await db.execute(select(BoardColumn).where(BoardColumn.id == card.column_id))
    column = col_result.scalar_one()

    board_result = await db.execute(select(Board).where(Board.id == column.board_id))
    b = board_result.scalar_one()

    proj_result = await db.execute(select(Project).where(Project.id == b.project_id))
    project = proj_result.scalar_one()

    if not project.repo_url:
        raise HTTPException(status_code=400, detail="No repo URL configured")

    try:
        from ..orchestrator.workspace import _get_github_client, _parse_repo_url

        g = _get_github_client()
        repo_name = _parse_repo_url(project.repo_url)
        logger.info("Fetching repo: %s", repo_name)
        repo = g.get_repo(repo_name)

        pr_number = int(card.agent_pr_url.rstrip("/").split("/")[-1])
        logger.info("Fetching PR #%d", pr_number)
        pr = repo.get_pull(pr_number)

        files = []
        for f in pr.get_files():
            files.append(
                {
                    "filename": f.filename,
                    "status": f.status,
                    "additions": f.additions,
                    "deletions": f.deletions,
                    "patch": f.patch or "",
                }
            )

        logger.info("Found %d files in PR diff", len(files))
    except Exception as e:
        logger.error("PR diff fetch failed: %s", e)
        raise HTTPException(status_code=502, detail=f"GitHub API error: {e}")

    return {
        "pr_number": pr.number,
        "title": pr.title,
        "body": pr.body or "",
        "state": pr.state,
        "mergeable": pr.mergeable,
        "files": files,
        "html_url": pr.html_url,
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _get_card_for_user(card_id: str, user: User, db: AsyncSession) -> Card | None:
    result = await db.execute(
        select(Card)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .join(Board, Board.id == BoardColumn.board_id)
        .join(Project, Project.id == Board.project_id)
        .where(Card.id == card_id, Project.owner_id == user.id)
    )
    return result.scalar_one_or_none()
