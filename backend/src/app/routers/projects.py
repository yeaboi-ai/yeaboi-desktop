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
from ..models.project import Project
from ..models.project_attachment import ProjectAttachment
from ..models.project_output import ProjectOutput
from ..models.session import ChatMessage, Participant, Session, TranscriptEntry
from ..models.session_event import SessionContext, SessionEvent
from ..models.ticket_template import TicketTemplate
from ..models.usage_event import UsageEvent
from ..models.user import User
from ..models.vocabulary import TranscriptionCorrection
from ..schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
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

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _dedupe_references(rows: list[dict]) -> list[dict]:
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


async def project_attachment_rows(project_id: str, db: AsyncSession) -> list[dict]:
    """The project's attachments, oldest first, with their fetchable URLs."""
    result = await db.execute(
        select(ProjectAttachment)
        .where(ProjectAttachment.project_id == project_id)
        .order_by(ProjectAttachment.created_at.asc(), ProjectAttachment.id.asc())
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


@router.post("", status_code=201, response_model=ProjectResponse)
@limiter.limit("60/minute")
async def create_project(
    request: Request,
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    team: Team = Depends(get_current_team),
    db: AsyncSession = Depends(get_db),
) -> Project:
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
            name = "Untitled Project"
    elif not name or not name.strip():
        name = "Untitled Project"

    project = Project(
        name=name,
        description=body.description,
        owner_id=user.id,
        org_id=org.id,
        team_id=team.id,
        references=_dedupe_references([r.model_dump() for r in body.references or []]),
    )
    db.add(project)
    await db.flush()
    await log_audit(
        db,
        org_id=org.id,
        user_id=user.id,
        action="create",
        resource_type="project",
        resource_id=project.id,
        metadata={"name": name},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Project created: %s (owner=%s)", project.id, user.id)
    await db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
@limiter.limit("60/minute")
async def list_projects(
    request: Request,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    team: Team = Depends(get_current_team),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    # Filter by org + selected team
    result = await db.execute(
        select(Project).where(Project.org_id == org.id, Project.team_id == team.id).order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{project_id}", response_model=ProjectResponse)
@limiter.limit("60/minute")
async def get_project(
    request: Request,
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # All org members can view any project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if the current user belongs to the project's team
    team_check = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == user.id,
        )
    )
    is_own_team = team_check.scalar_one_or_none() is not None

    response = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "repo_url": project.repo_url,
        "owner_id": project.owner_id,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "is_own_team": is_own_team,
        "is_demo": project.is_demo,
        "default_generation_style": project.default_generation_style,
        "default_modifiers": list(project.default_modifiers or []),
        "yeaboi_project_id": project.yeaboi_project_id,
        "status": project.status,
        "references": list(project.references or []),
        "attachments": await project_attachment_rows(project.id, db),
    }
    return response


@router.patch("/{project_id}", response_model=ProjectResponse)
@limiter.limit("60/minute")
async def update_project(
    request: Request,
    project_id: str,
    body: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    # All team members can edit any project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = body.model_dump(exclude_unset=True)
    # Validate granularity + modifier slugs against the org's editable rows
    # (admin-created customs are first-class) BEFORE applying any mutations.
    # Backwards compat: if default_generation_style was sent with a known
    # MODIFIER slug (legacy single-axis API), re-route it into
    # default_modifiers and clear the granularity field.
    if (
        "default_generation_style" in update_data
        or "default_modifiers" in update_data
    ):
        from ..services.granularity_service import (
            ensure_org_granularities,
            get_org_granularities,
        )
        from ..services.modifier_service import ensure_org_modifiers, get_org_modifiers

        await ensure_org_granularities(project.org_id, db)
        await ensure_org_modifiers(project.org_id, db)
        org_gran_slugs = {r.slug for r in await get_org_granularities(project.org_id, db)}
        org_mod_slugs = {r.slug for r in await get_org_modifiers(project.org_id, db)}

        style_val = update_data.get("default_generation_style")
        if isinstance(style_val, str) and style_val not in org_gran_slugs and style_val in org_mod_slugs:
            # Legacy-API re-route: the value names a modifier, not a granularity.
            existing_mods = list(update_data.get("default_modifiers") or project.default_modifiers or [])
            if style_val not in existing_mods:
                existing_mods.append(style_val)
            update_data["default_modifiers"] = existing_mods
            update_data["default_generation_style"] = None
        elif isinstance(style_val, str) and style_val not in org_gran_slugs:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown granularity {style_val!r}. Valid: {sorted(org_gran_slugs)}",
            )

        mods_val = update_data.get("default_modifiers")
        if isinstance(mods_val, list):
            bad = [m for m in mods_val if m not in org_mod_slugs]
            if bad:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown modifier(s) {bad}. Valid: {sorted(org_mod_slugs)}",
                )
            # Dedupe preserving order.
            seen: set[str] = set()
            update_data["default_modifiers"] = [m for m in mods_val if not (m in seen or seen.add(m))]

    if "status" in update_data and update_data["status"] not in ("active", "done"):
        raise HTTPException(status_code=422, detail="status must be 'active' or 'done'")
    if "references" in update_data:
        if update_data["references"] is None:
            raise HTTPException(status_code=422, detail="references must be a list")
        update_data["references"] = _dedupe_references(update_data["references"])

    for key, value in update_data.items():
        setattr(project, key, value)

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="update",
        resource_type="project",
        resource_id=project_id,
        metadata={"fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Project updated: %s", project_id)
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_project(
    request: Request,
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

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
                project_id,
                user.id,
            )
            raise HTTPException(status_code=403, detail="Not authorised to delete this project")

    # Delete all related records (FK constraints prevent direct project delete)
    # Order matters: children before parents

    # Sessions → messages + participants first
    session_ids = (await db.execute(select(Session.id).where(Session.project_id == project_id))).scalars().all()
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
        # Billing ledger: detach from the session being removed. project_id is cleared later.
        await db.execute(
            UsageEvent.__table__.update()
            .where(UsageEvent.session_id.in_(session_ids))
            .values(session_id=None)
        )
    await db.execute(delete(Session).where(Session.project_id == project_id))

    # Board → cards → columns
    board_ids = (await db.execute(select(Board.id).where(Board.project_id == project_id))).scalars().all()
    if board_ids:
        col_ids = (await db.execute(select(BoardColumn.id).where(BoardColumn.board_id.in_(board_ids)))).scalars().all()
        if col_ids:
            await db.execute(delete(Card).where(Card.column_id.in_(col_ids)))
        await db.execute(delete(BoardColumn).where(BoardColumn.board_id.in_(board_ids)))
    await db.execute(delete(Board).where(Board.project_id == project_id))

    # Blueprints (snapshots before iterations due to FK) + harness configs
    await db.execute(delete(BlueprintSnapshot).where(BlueprintSnapshot.project_id == project_id))
    await db.execute(delete(BlueprintSuggestion).where(BlueprintSuggestion.project_id == project_id))
    await db.execute(delete(BlueprintIteration).where(BlueprintIteration.project_id == project_id))
    await db.execute(delete(HarnessConfig).where(HarnessConfig.project_id == project_id))
    await db.execute(delete(ProjectOutput).where(ProjectOutput.project_id == project_id))

    # Project-scoped ticket templates. Org-level templates have project_id=NULL and survive.
    await db.execute(delete(TicketTemplate).where(TicketTemplate.project_id == project_id))

    # Billing ledger: preserve rows for historical reporting, detach from the deleted project.
    await db.execute(
        UsageEvent.__table__.update().where(UsageEvent.project_id == project_id).values(project_id=None)
    )

    # Screenshots: the files first, then the rows.
    attachment_rows = await db.execute(
        select(ProjectAttachment).where(ProjectAttachment.project_id == project_id)
    )
    attachments = attachment_rows.scalars().all()
    if attachments:
        storage = get_storage()
        for attachment in attachments:
            await storage.delete(attachment.storage_key)
        await db.execute(
            delete(ProjectAttachment).where(ProjectAttachment.project_id == project_id)
        )

    # Finally delete the project
    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="delete",
        resource_type="project",
        resource_id=project_id,
        metadata={"name": project.name},
        ip_address=get_client_ip(request),
    )
    await db.delete(project)
    await db.commit()
    logger.info("Project deleted: %s", project_id)


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
        raise HTTPException(status_code=422, detail="Project name is required")

    try:
        ai = await get_ai_client(org.id, db, task="fast")
        text = await ai.chat(
            system=(
                "You generate concise project descriptions (1-2 sentences) from a project name. "
                "Be specific about what the project does and who it's for. "
                "Don't use buzzwords. Just describe the product plainly."
            ),
            messages=[{"role": "user", "content": f"Project name: {body.name.strip()}"}],
            max_tokens=150,
        )
        return {"description": text.strip()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=_ai_error_detail(e))


class RewriteIdeaRequest(BaseModel):
    text: str
    project_id: str | None = None


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

    # Build context from project + blueprint if project_id provided
    context_parts = []
    if body.project_id:
        result = await db.execute(select(Project).where(Project.id == body.project_id))
        project = result.scalar_one_or_none()
        if project:
            context_parts.append(f"Project: {project.name}")
            if project.description:
                context_parts.append(f"Project description: {project.description}")
            # Get blueprint gaps
            from ..services.blueprint_service import get_or_create_blueprint
            from ..services.facilitator import SECTION_LABELS, assess_coverage

            bp = await get_or_create_blueprint(body.project_id, db)
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


@router.get("/{project_id}/diagrams")
async def get_project_diagrams(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return all diagrams from a project's sessions."""
    result = await db.execute(
        select(Session.id, Session.title, Session.diagram_state, Session.created_at)
        .where(Session.project_id == project_id, Session.diagram_state.isnot(None))
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
