from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models.session import Session
from ..models.session_output import SessionOutput
from ..models.user import User
from ..schemas.harness import HarnessGenerateRequest, HarnessPreviewResponse, HarnessStatusResponse
from ..services.blueprint_service import get_or_create_blueprint
from ..services.harness_service import generate_scaffold
from ..services.output_service import OutputServiceError, generate_output

logger = logging.getLogger(__name__)

router = APIRouter(tags=["harness"])


# Map session_outputs status → legacy HarnessStatusResponse.status values
_STATUS_MAP = {
    "not_generated": "pending",
    "generating": "generating",
    "ready": "complete",
    "failed": "failed",
}


def _to_harness_response(row: SessionOutput) -> HarnessStatusResponse:
    artifacts = row.artifacts or {}
    return HarnessStatusResponse(
        id=row.id,
        session_id=row.session_id,
        status=_STATUS_MAP.get(row.status, row.status),
        repo_url=artifacts.get("repo_url"),
        repo_name=artifacts.get("repo_name"),
        created_at=row.created_at,
    )


async def _get_project(session_id: str, db: AsyncSession) -> Session:
    project = (
        await db.execute(select(Session).where(Session.id == session_id))
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return project


@router.get(
    "/api/sessions/{session_id}/harness/preview", response_model=HarnessPreviewResponse
)
async def preview_harness(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HarnessPreviewResponse:
    project = await _get_project(session_id, db)
    blueprint = await get_or_create_blueprint(session_id, db)
    files = await generate_scaffold(project.name, blueprint.content)
    return HarnessPreviewResponse(files=files)


@router.post(
    "/api/sessions/{session_id}/harness/generate", response_model=HarnessStatusResponse
)
async def generate_harness(
    session_id: str,
    body: HarnessGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HarnessStatusResponse:
    await _get_project(session_id, db)
    payload = {
        "repo_name": body.repo_name,
        "github_token": body.github_token,
        "create_repo": body.create_repo,
    }
    try:
        row = await generate_output(session_id, "code_scaffold", payload, db)
    except OutputServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return _to_harness_response(row)


@router.get(
    "/api/sessions/{session_id}/harness/status", response_model=HarnessStatusResponse
)
async def get_harness_status(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HarnessStatusResponse:
    await _get_project(session_id, db)
    row = (
        await db.execute(
            select(SessionOutput).where(
                SessionOutput.session_id == session_id,
                SessionOutput.output_type == "code_scaffold",
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="No harness config found for this project")
    return _to_harness_response(row)
