import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_team, get_current_user
from ..middleware.rate_limit import limiter
from ..models.blueprint import BlueprintIteration, BlueprintSnapshot, BlueprintSuggestion
from ..models.board import Board, BoardColumn, Card
from ..models.feedback import Feedback
from ..models.harness import HarnessConfig
from ..models.organization import Organization, Team, TeamMember
from ..models.session import ChatMessage, Participant, Session, TranscriptEntry
from ..models.session_attachment import SessionAttachment
from ..models.session_event import SessionContext, SessionEvent
from ..models.session_output import SessionOutput
from ..models.ticket_template import TicketTemplate
from ..models.usage_event import UsageEvent
from ..models.user import User
from ..models.vocabulary import TranscriptionCorrection
from ..schemas.session import SessionResponse
from ..schemas.session_workspace import SessionCreate
from ..services.ai_provider import get_ai_client
from ..services.attachment_storage import get_storage
from ..services.audit_service import get_client_ip, log_audit

logger = logging.getLogger(__name__)


def _ai_error_detail(e: Exception) -> str:
    """Convert an AI provider exception to a user-friendly error message."""
    err = str(e).lower()
    if "credit" in err or "billing" in err or "quota" in err or "402" in err or "insufficient_quota" in err:
        return "AI credits exhausted. Please check your API key billing in Settings."
    if "rate" in err or "429" in err or "too many" in err:
        return "AI rate limit reached. Please wait a moment and try again."
    if "auth" in err or "401" in err or "invalid.*key" in err or "api_key" in err:
        return "AI API key is invalid or expired. Please check Settings."
    if "overloaded" in err or "503" in err or "capacity" in err:
        return "AI service is temporarily overloaded. Please try again shortly."
    logger.error("AI service error: %s", e)
    return "AI service error. Please try again or check Settings."


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def dedupe_references(rows: list[dict]) -> list[dict]:
    """The same (source, subject) once, first wins, order kept."""
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for row in rows:
        key = (str(row.get("source", "")), str(row.get("subject", "")))
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


async def session_attachment_rows(session_id: str, db: AsyncSession) -> list[dict]:
    """The project's attachments, oldest first, with their fetchable URLs."""
    result = await db.execute(
        select(SessionAttachment)
        .where(SessionAttachment.session_id == session_id)
        .order_by(SessionAttachment.created_at.asc(), SessionAttachment.id.asc())
    )
    storage = get_storage()
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "mime_type": r.mime_type,
            "size_bytes": r.size_bytes,
            "width": r.width,
            "height": r.height,
            "url": await storage.get_url(r.storage_key),
            "created_at": r.created_at,
        }
        for r in result.scalars().all()
    ]


def _workspace_row(session: Session, *, is_own_team: bool = False, attachments=None) -> dict:
    """The workspace half of a session, for the routes that never load a
    conversation's participants (returning the ORM row would lazy-load them
    outside the async context)."""
    return {
        "id": session.id,
        "org_id": session.org_id,
        "status": session.status,
        "title": session.title,
        "initial_idea": session.initial_idea,
        "join_code": session.join_code,
        "ai_config": session.ai_config or {},
        "name": session.name,
        "description": session.description,
        "repo_url": session.repo_url,
        "owner_id": session.owner_id,
        "team_id": session.team_id,
        "is_demo": session.is_demo,
        "key": session.key,
        "is_own_team": is_own_team,
        "default_generation_style": session.default_generation_style,
        "default_modifiers": list(session.default_modifiers or []),
        "references": list(session.references or []),
        "attachments": attachments,
        "continued_from_id": session.continued_from_id,
        "yeaboi_session_id": session.yeaboi_session_id,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }


@router.post("", status_code=201, response_model=SessionResponse)
@limiter.limit("60/minute")
async def create_project(
    request: Request,
    body: SessionCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    team: Team = Depends(get_current_team),
    db: AsyncSession = Depends(get_db),
) -> Session:
    # Auto-generate project name from description if not provided
    name = body.name
    if (not name or not name.strip()) and body.description and body.description.strip():
        try:
            ai = await get_ai_client(org.id, db, task="fast")
            name = await ai.chat(
                system=(
                    "Generate a short project name (2-4 words, lowercase) from a description. "
                    "Return ONLY the name, nothing else. No quotes, no punctuation. "
                    "Examples: 'todo app', 'recipe platform', 'team dashboard'"
                ),
                messages=[{"role": "user", "content": body.description.strip()}],
                max_tokens=20,
            )
            name = name.strip().strip('"').strip("'")
        except Exception:
            logger.debug("AI project name generation failed, using default")
            name = "Untitled Session"
    elif not name or not name.strip():
        name = "Untitled Session"

    project = Session(
        name=name,
        description=body.description,
        owner_id=user.id,
        org_id=org.id,
        team_id=team.id,
        # The workspace vocabulary: active while it is being worked, completed
        # when the owner says so. `live`/`reviewing` are the conversation's own.
        status="active",
        references=dedupe_references([r.model_dump() for r in body.references or []]),
        yeaboi_session_id=(body.yeaboi_session_id or "").strip() or None,
    )
    db.add(project)
    await db.flush()
    await log_audit(
        db,
        org_id=org.id,
        user_id=user.id,
        action="create",
        resource_type="session",
        resource_id=project.id,
        metadata={"name": name},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Session created: %s (owner=%s)", project.id, user.id)
    await db.refresh(project)
    return _workspace_row(project)


@router.get("", response_model=list[SessionResponse])
@limiter.limit("60/minute")
async def list_projects(
    request: Request,
    yeaboi_session_id: str | None = None,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    team: Team = Depends(get_current_team),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    query = (
        select(Session)
        .where(Session.org_id == org.id, Session.team_id == team.id, Session.deleted_at.is_(None))
        .order_by(Session.created_at.desc())
    )
    # The room asks for the one row that serves its engine plan.
    if yeaboi_session_id:
        query = query.where(Session.yeaboi_session_id == yeaboi_session_id.strip())
    result = await db.execute(query)
    return [_workspace_row(row) for row in result.scalars().all()]


@router.delete("/{session_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_project(
    request: Request,
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(Session).where(Session.id == session_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Session not found")

    # Owner can always delete; otherwise require team admin role on the project's team.
    if project.owner_id != user.id:
        team_admin = (
            await db.execute(
                select(TeamMember).where(
                    TeamMember.team_id == project.team_id,
                    TeamMember.user_id == user.id,
                    TeamMember.role == "admin",
                )
            )
        ).scalar_one_or_none()
        if not team_admin:
            logger.warning(
                "Permission denied deleting project %s by user %s (not owner, not team admin)",
                session_id,
                user.id,
            )
            raise HTTPException(status_code=403, detail="Not authorised to delete this session")

    # Delete all related records (FK constraints prevent direct project delete)
    # Order matters: children before parents

    # The session's own children first — the row being deleted is the session.
    session_ids = [session_id]
    if session_ids:
        await db.execute(delete(ChatMessage).where(ChatMessage.session_id.in_(session_ids)))
        await db.execute(delete(Participant).where(Participant.session_id.in_(session_ids)))
        await db.execute(delete(TranscriptEntry).where(TranscriptEntry.session_id.in_(session_ids)))
        await db.execute(delete(SessionEvent).where(SessionEvent.session_id.in_(session_ids)))
        await db.execute(delete(SessionContext).where(SessionContext.session_id.in_(session_ids)))
        # Nullable refs on records that outlive the session (keep the row, drop the pointer).
        await db.execute(
            TranscriptionCorrection.__table__.update()
            .where(TranscriptionCorrection.session_id.in_(session_ids))
            .values(session_id=None)
        )
        await db.execute(
            Feedback.__table__.update().where(Feedback.session_id.in_(session_ids)).values(session_id=None)
        )
        # Cards record the session they were created in; cards themselves are deleted later
        # via column_id, but the FK still has to be cleared first so the session delete can proceed.
        await db.execute(
            Card.__table__.update().where(Card.session_id.in_(session_ids)).values(session_id=None)
        )
        # Billing ledger: detach from the session being removed, keep the spend.
        await db.execute(
            UsageEvent.__table__.update()
            .where(UsageEvent.session_id.in_(session_ids))
            .values(session_id=None)
        )
    # The session row itself goes last, after everything that points at it.

    # Board → cards → columns
    board_ids = (await db.execute(select(Board.id).where(Board.session_id == session_id))).scalars().all()
    if board_ids:
        col_ids = (await db.execute(select(BoardColumn.id).where(BoardColumn.board_id.in_(board_ids)))).scalars().all()
        if col_ids:
            await db.execute(delete(Card).where(Card.column_id.in_(col_ids)))
        await db.execute(delete(BoardColumn).where(BoardColumn.board_id.in_(board_ids)))
    await db.execute(delete(Board).where(Board.session_id == session_id))

    # Blueprints (snapshots before iterations due to FK) + harness configs.
    # The session points back at its iteration, so that pointer is cleared
    # before the iteration goes or the delete leaves a dangling reference.
    await db.execute(delete(BlueprintSnapshot).where(BlueprintSnapshot.session_id == session_id))
    await db.execute(delete(BlueprintSuggestion).where(BlueprintSuggestion.session_id == session_id))
    await db.execute(
        Session.__table__.update().where(Session.id == session_id).values(iteration_id=None)
    )
    await db.execute(delete(BlueprintIteration).where(BlueprintIteration.session_id == session_id))
    await db.execute(delete(HarnessConfig).where(HarnessConfig.session_id == session_id))
    await db.execute(delete(SessionOutput).where(SessionOutput.session_id == session_id))

    # Session-scoped ticket templates. Org-level templates have session_id=NULL and survive.
    await db.execute(delete(TicketTemplate).where(TicketTemplate.session_id == session_id))

    # Screenshots: the files first, then the rows.
    attachment_rows = await db.execute(
        select(SessionAttachment).where(SessionAttachment.session_id == session_id)
    )
    attachments = attachment_rows.scalars().all()
    if attachments:
        storage = get_storage()
        for attachment in attachments:
            await storage.delete(attachment.storage_key)
        await db.execute(
            delete(SessionAttachment).where(SessionAttachment.session_id == session_id)
        )

    # Slack's "session created" messages are found through the announcement
    # rows, so they go before the cascade takes those rows with the session.
    try:
        from ..services.slack_session_announcements import delete_announcements_for_session

        await delete_announcements_for_session(db, session_id)
    except Exception:
        logger.exception("Slack session-announcement cleanup failed for %s", session_id)

    # A session seeded from this one outlives it; it just stops naming a parent.
    await db.execute(
        Session.__table__.update()
        .where(Session.continued_from_id == session_id)
        .values(continued_from_id=None)
    )

    # Finally delete the session
    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="delete",
        resource_type="session",
        resource_id=session_id,
        metadata={"name": project.name},
        ip_address=get_client_ip(request),
    )
    await db.delete(project)
    await db.commit()
    logger.info("Session deleted: %s", session_id)


class GenerateDescriptionRequest(BaseModel):
    name: str


@router.post("/generate-description")
@limiter.limit("20/minute")
async def generate_description(
    request: Request,
    body: GenerateDescriptionRequest,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a project description from a project name using AI."""
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Session name is required")

    try:
        ai = await get_ai_client(org.id, db, task="fast")
        text = await ai.chat(
            system=(
                "You generate concise project descriptions (1-2 sentences) from a project name. "
                "Be specific about what the project does and who it's for. "
                "Don't use buzzwords. Just describe the product plainly."
            ),
            messages=[{"role": "user", "content": f"Session name: {body.name.strip()}"}],
            max_tokens=150,
        )
        return {"description": text.strip()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=_ai_error_detail(e))


class RewriteIdeaRequest(BaseModel):
    text: str
    session_id: str | None = None


@router.post("/rewrite-idea")
@limiter.limit("20/minute")
async def rewrite_idea(
    request: Request,
    body: RewriteIdeaRequest,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Rewrite a project/session idea for clarity, using project context if available."""
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="Text is required")

    # Build context from project + blueprint if session_id provided
    context_parts = []
    if body.session_id:
        result = await db.execute(select(Session).where(Session.id == body.session_id))
        project = result.scalar_one_or_none()
        if project:
            context_parts.append(f"Session: {project.name}")
            if project.description:
                context_parts.append(f"Session description: {project.description}")
            # Get blueprint gaps
            from ..services.blueprint_service import get_or_create_blueprint
            from ..services.facilitator import SECTION_LABELS, assess_coverage

            bp = await get_or_create_blueprint(body.session_id, db)
            cov = assess_coverage(bp.content)
            gaps = [SECTION_LABELS.get(s, s) for s in cov["gaps"]]
            if gaps:
                context_parts.append(f"Blueprint gaps needing coverage: {', '.join(gaps)}")
            filled = [SECTION_LABELS.get(s, s) for s in cov["scores"] if cov["scores"][s] >= 80]
            if filled:
                context_parts.append(f"Already covered: {', '.join(filled)}")

    system_prompt = (
        "Turn short project names into punchy pitches. Turn existing descriptions into polished versions.\n\n"
        "WRONG: 'A to-do app is a productivity application that helps users organize tasks.' (This is a dictionary definition. Never do this.)\n"
        "RIGHT: 'A smart daily planner that surfaces your three most important tasks each morning using AI prioritization.'\n\n"
        "Rules:\n"
        "- Write what makes THIS project specific and interesting, not what the category is.\n"
        "- 1-2 sentences. No markdown. No bullet points.\n"
        "- If already a good description, just polish grammar and clarity."
    )

    try:
        ai = await get_ai_client(org.id, db, task="fast")
        text = await ai.chat(
            system=system_prompt,
            messages=[{"role": "user", "content": body.text.strip()}],
            max_tokens=500,
        )
        return {"rewritten": text.strip()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=_ai_error_detail(e))


@router.get("/{session_id}/diagrams")
async def get_project_diagrams(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return all diagrams from a project's sessions."""
    result = await db.execute(
        select(Session.id, Session.title, Session.diagram_state, Session.created_at)
        .where(Session.id == session_id, Session.diagram_state.isnot(None))
        .order_by(Session.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "session_id": r.id,
            "session_title": r.title,
            "diagram": r.diagram_state,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
        if r.diagram_state and (r.diagram_state.get("nodes") or r.diagram_state.get("tables") or r.diagram_state.get("screens"))
    ]
