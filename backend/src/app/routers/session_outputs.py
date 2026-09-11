from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..middleware.rate_limit import limiter
from ..models.session import Session
from ..models.session_output import SessionOutput
from ..models.user import User
from ..schemas.session_output import (
    GenerateOutputRequest,
    OutputCatalogueEntry,
    ProjectOutputResponse,
)
from ..services.blueprint_service import get_or_create_blueprint
from ..services.harness_service import generate_scaffold
from ..services.output_service import (
    IMPLEMENTED_TYPES,
    OutputServiceError,
    generate_output,
    get_output_catalogue,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["session_outputs"])


async def _verify_project(session_id: str, db: AsyncSession) -> Session:
    project = (
        await db.execute(select(Session).where(Session.id == session_id))
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return project


@router.get(
    "/api/sessions/{session_id}/outputs", response_model=list[OutputCatalogueEntry]
)
@limiter.limit("60/minute")
async def list_outputs(
    request: Request,
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OutputCatalogueEntry]:
    """List every known output type for a project with generation status and maturity."""
    await _verify_project(session_id, db)
    return await get_output_catalogue(session_id, db)


@router.get(
    "/api/sessions/{session_id}/outputs/{output_type}",
    response_model=ProjectOutputResponse,
)
@limiter.limit("60/minute")
async def get_output(
    request: Request,
    session_id: str,
    output_type: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOutput:
    """Return the current row for a single output type; 404 if never generated."""
    await _verify_project(session_id, db)
    row = (
        await db.execute(
            select(SessionOutput).where(
                SessionOutput.session_id == session_id,
                SessionOutput.output_type == output_type,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Output not yet generated")
    return row


@router.post(
    "/api/sessions/{session_id}/outputs/{output_type}/generate",
    response_model=ProjectOutputResponse,
)
@limiter.limit("20/minute")
async def generate_output_endpoint(
    request: Request,
    session_id: str,
    output_type: str,
    body: GenerateOutputRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOutput:
    """Generate or regenerate the given output type. Body payload is type-specific."""
    await _verify_project(session_id, db)
    try:
        return await generate_output(session_id, output_type, body.payload, db)
    except OutputServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/api/sessions/{session_id}/outputs/{output_type}/preview")
@limiter.limit("30/minute")
async def preview_output(
    request: Request,
    session_id: str,
    output_type: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Preview the generated artifact without persisting. Only implemented for code_scaffold."""
    project = await _verify_project(session_id, db)
    if output_type not in IMPLEMENTED_TYPES:
        raise HTTPException(status_code=501, detail=f"{output_type} preview not implemented")
    blueprint = await get_or_create_blueprint(session_id, db)
    if output_type == "code_scaffold":
        files = await generate_scaffold(project.name, blueprint.content)
        return {"files": files}
    # Future implemented types add preview logic here.
    raise HTTPException(status_code=501, detail=f"{output_type} preview not wired")
