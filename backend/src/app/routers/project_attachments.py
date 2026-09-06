"""Per-project screenshots. Images only, stored beside the card attachments
under their own prefix, listed on the project's detail GET.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.organization import Organization
from ..models.project import Project
from ..models.project_attachment import ProjectAttachment
from ..models.user import User
from ..schemas.project import ProjectAttachmentResponse
from ..services.attachment_storage import get_storage
from .card_attachments import _image_dimensions

router = APIRouter(tags=["projects"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 8 * 1024 * 1024  # 8MB
_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
_IMAGE_MIMES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


async def _load_project_in_org(project_id: str, org_id: str, db: AsyncSession) -> Project:
    """Resolve a project and 403/404 if cross-org."""
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.org_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return project


async def _response(row: ProjectAttachment) -> ProjectAttachmentResponse:
    return ProjectAttachmentResponse(
        id=row.id,
        filename=row.filename,
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        width=row.width,
        height=row.height,
        url=await get_storage().get_url(row.storage_key),
        created_at=row.created_at,
    )


@router.post("/api/projects/{project_id}/attachments", status_code=201, response_model=ProjectAttachmentResponse)
async def upload_project_attachment(
    project_id: str,
    file: UploadFile,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> ProjectAttachmentResponse:
    project = await _load_project_in_org(project_id, org.id, db)

    ext = Path(file.filename or "file").suffix.lower()
    mime_type = (file.content_type or "").lower()
    if ext not in _IMAGE_EXTS or mime_type not in _IMAGE_MIMES:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG, WebP or GIF images can be attached")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 8MB)")
    width, height = await _image_dimensions(content)
    if width is None or height is None:
        raise HTTPException(status_code=400, detail="That file is not a readable image")

    key = await get_storage().put(content, mime_type=mime_type, suffix=ext, prefix="projects")
    row = ProjectAttachment(
        project_id=project.id,
        uploaded_by=user.id,
        filename=file.filename or "screenshot",
        storage_key=key,
        mime_type=mime_type,
        size_bytes=len(content),
        width=width,
        height=height,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    logger.info("Project attachment added: %s on %s (%d bytes)", row.id, project.id, len(content))
    return await _response(row)


@router.get("/api/projects/{project_id}/attachments", response_model=list[ProjectAttachmentResponse])
async def list_project_attachments(
    project_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectAttachmentResponse]:
    await _load_project_in_org(project_id, org.id, db)
    rows = (
        (
            await db.execute(
                select(ProjectAttachment)
                .where(ProjectAttachment.project_id == project_id)
                .order_by(ProjectAttachment.created_at.asc(), ProjectAttachment.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return [await _response(r) for r in rows]


@router.delete("/api/projects/{project_id}/attachments/{attachment_id}", status_code=204)
async def delete_project_attachment(
    project_id: str,
    attachment_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await _load_project_in_org(project_id, org.id, db)
    row = (
        await db.execute(
            select(ProjectAttachment).where(
                ProjectAttachment.id == attachment_id, ProjectAttachment.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if row.uploaded_by != user.id and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the uploader or the project owner can remove this")

    await get_storage().delete(row.storage_key)
    await db.delete(row)
    await db.commit()
    logger.info("Project attachment removed: %s from %s", attachment_id, project_id)
