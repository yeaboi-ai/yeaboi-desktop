"""Per-card file/screenshot attachments. Scoped to a card; separate from the
session-level ChatMessage attachments which use the same storage pool but a
different lifecycle.
"""

from __future__ import annotations

import logging
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.attachment import CardAttachment
from ..models.board import Board, BoardColumn, Card
from ..models.organization import Organization
from ..models.project import Project
from ..models.user import User
from ..schemas.board import TicketAttachmentResponse
from ..services.attachment_storage import get_storage
from ..services.document_extractor import MAX_EXTRACT_CHARS, extract_text

router = APIRouter(tags=["cards"])
logger = logging.getLogger(__name__)


# Conservative cap reused from the session attachment path. Multipart upload
# already streams to disk via UploadFile so we read once into memory after the
# size check is enforceable on UploadFile.size when present.
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".pdf",
    ".doc", ".docx", ".xls", ".xlsx",
    ".csv", ".txt", ".md", ".markdown",
    ".html", ".htm", ".json",
}

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


async def _load_card_in_org(card_id: str, org_id: str, db: AsyncSession) -> Card:
    """Resolve a card and 403/404 if cross-org."""
    row = (
        await db.execute(
            select(Card, Project.org_id)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .join(Board, Board.id == BoardColumn.board_id)
            .join(Project, Project.id == Board.project_id)
            .where(Card.id == card_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    card, card_org_id = row
    if card_org_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return card


async def _image_dimensions(content: bytes) -> tuple[int | None, int | None]:
    """Best-effort PIL probe so the frontend can render correct aspect tiles."""
    try:
        from PIL import Image  # type: ignore[import-untyped]

        with Image.open(BytesIO(content)) as img:
            return img.width, img.height
    except Exception:
        return None, None


async def _broadcast_card_event(card: Card) -> None:
    try:
        from ..ws.board_ws import board_manager

        await board_manager.broadcast_card_event(card.column_id, "card.updated", card)
    except Exception:
        logger.debug("WS broadcast failed (best-effort) for card %s", card.id)


@router.post(
    "/api/cards/{card_id}/attachments",
    status_code=201,
    response_model=TicketAttachmentResponse,
)
async def upload_card_attachment(
    card_id: str,
    file: UploadFile,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> TicketAttachmentResponse:
    card = await _load_card_in_org(card_id, org.id, db)

    ext = Path(file.filename or "file").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    storage = get_storage()
    key = await storage.put(
        content,
        mime_type=file.content_type or "application/octet-stream",
        suffix=ext,
    )

    width: int | None = None
    height: int | None = None
    if ext in _IMAGE_EXTS:
        width, height = await _image_dimensions(content)

    extracted_text: str | None = None
    if ext not in _IMAGE_EXTS:
        # Reuse the session-side text extractor so card search benefits from
        # PDF / DOCX / XLSX OCR-light extraction.
        try:
            from tempfile import NamedTemporaryFile

            with NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(content)
                tmp_path = Path(tmp.name)
            try:
                text = await extract_text(tmp_path, file.content_type)
                if text:
                    if len(text) > MAX_EXTRACT_CHARS:
                        text = text[:MAX_EXTRACT_CHARS]
                    extracted_text = text
            finally:
                tmp_path.unlink(missing_ok=True)
        except Exception as exc:  # noqa: BLE001 — extraction is best-effort
            logger.warning("extract_text failed for %s: %s", file.filename, exc)

    row = CardAttachment(
        card_id=card.id,
        uploaded_by=user.id,
        filename=file.filename or "attachment",
        storage_key=key,
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        extracted_text=extracted_text,
        width=width,
        height=height,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await _broadcast_card_event(card)

    return TicketAttachmentResponse(
        id=row.id,
        card_id=row.card_id,
        filename=row.filename,
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        url=await storage.get_url(row.storage_key),
        width=row.width,
        height=row.height,
        uploaded_by=row.uploaded_by,
        created_at=row.created_at,
    )


@router.get(
    "/api/cards/{card_id}/attachments",
    response_model=list[TicketAttachmentResponse],
)
async def list_card_attachments(
    card_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[TicketAttachmentResponse]:
    await _load_card_in_org(card_id, org.id, db)
    rows = (
        await db.execute(
            select(CardAttachment)
            .where(CardAttachment.card_id == card_id)
            .order_by(CardAttachment.created_at.asc())
        )
    ).scalars().all()
    storage = get_storage()
    return [
        TicketAttachmentResponse(
            id=r.id,
            card_id=r.card_id,
            filename=r.filename,
            mime_type=r.mime_type,
            size_bytes=r.size_bytes,
            url=await storage.get_url(r.storage_key),
            width=r.width,
            height=r.height,
            uploaded_by=r.uploaded_by,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.delete("/api/cards/{card_id}/attachments/{attachment_id}", status_code=204)
async def delete_card_attachment(
    card_id: str,
    attachment_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    card = await _load_card_in_org(card_id, org.id, db)
    row = (
        await db.execute(
            select(CardAttachment).where(
                CardAttachment.id == attachment_id,
                CardAttachment.card_id == card_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Deletion policy: only the uploader (or org admin role) can delete. We
    # intentionally don't surface admin-vs-member differences in the existing
    # codebase elsewhere on the card path, so we keep this as uploader-only —
    # admins can override with a database call if ever needed.
    if row.uploaded_by != user.id:
        raise HTTPException(status_code=403, detail="Only the uploader can delete this attachment")

    storage = get_storage()
    await storage.delete(row.storage_key)
    await db.delete(row)
    await db.commit()
    await _broadcast_card_event(card)
