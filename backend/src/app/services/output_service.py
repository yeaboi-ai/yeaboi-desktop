"""Dispatcher above per-output-type handlers.

Each handler:
  1. Reads the blueprint.
  2. Runs type-specific generation.
  3. Upserts a session_outputs row with status + artifacts.

Slot-only handlers (design_bundle, terraform_stack, decision_doc) raise
OutputServiceError("not implemented") — the routes map this to HTTP 501.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.session import Session
from ..models.session_output import SessionOutput
from ..schemas.session_output import OutputCatalogueEntry
from ..services.blueprint_service import get_or_create_blueprint
from ..services.harness_service import create_github_repo, generate_scaffold
from ..services.output_maturity import maturity_for

logger = logging.getLogger(__name__)


class OutputServiceError(Exception):
    """Raised when generation is refused (unknown type, slot-only, validation)."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


# Handler contract: returns artifacts dict on success; raises on failure.
# IMPORTANT: handlers MUST NOT leave the SQLAlchemy session in a failed-transaction
# state. If a handler writes to the DB and then raises, it MUST roll back internally
# first. The dispatcher commits the 'failed' status after an exception; a dirty
# session would turn that commit into a secondary error and lose the failure record.
Handler = Callable[[Session, dict, dict, AsyncSession], Awaitable[dict]]
# (project, blueprint_content, payload, db) -> artifacts dict


async def _handle_code_scaffold(project: Session, blueprint_content: dict, payload: dict, db: AsyncSession) -> dict:
    """Wraps harness_service.generate_scaffold + optional repo creation."""
    from ..config import get_settings

    files = await generate_scaffold(project.name, blueprint_content)
    repo_name = payload.get("repo_name")
    github_token = payload.get("github_token") or get_settings().github_token
    create_repo = bool(payload.get("create_repo"))

    artifacts: dict = {"files_generated": list(files.keys())}
    # Echo repo_name into artifacts even when no repo is created — preserves the
    # user's submitted state so later "create_repo=True" calls pick it up.
    if repo_name:
        artifacts["repo_name"] = repo_name
    if create_repo and github_token and repo_name:
        try:
            repo_url = await create_github_repo(repo_name, files, github_token)
            artifacts["repo_url"] = repo_url
            artifacts["repo_provider"] = "github"
            project.repo_url = repo_url
        except Exception as exc:
            logger.error("code_scaffold repo creation failed: %s", exc)
            raise OutputServiceError(f"repo creation failed: {exc}", status_code=502) from exc
    return artifacts


async def _slot_only(*_args, **_kwargs) -> dict:
    raise OutputServiceError("not implemented", status_code=501)


_HANDLERS: dict[str, Handler] = {
    "code_scaffold": _handle_code_scaffold,
    "design_bundle": _slot_only,
    "terraform_stack": _slot_only,
    "decision_doc": _slot_only,
}

IMPLEMENTED_TYPES = {name for name, h in _HANDLERS.items() if h is not _slot_only}


async def generate_output(session_id: str, output_type: str, payload: dict, db: AsyncSession) -> SessionOutput:
    """Generate or regenerate an output. Upserts the session_outputs row."""
    handler = _HANDLERS.get(output_type)
    if handler is None:
        raise OutputServiceError(f"unknown output_type: {output_type}", status_code=400)

    project = (await db.execute(select(Session).where(Session.id == session_id))).scalar_one_or_none()
    if project is None:
        raise OutputServiceError(f"project {session_id} not found", status_code=404)

    row = (
        await db.execute(
            select(SessionOutput).where(
                SessionOutput.session_id == session_id,
                SessionOutput.output_type == output_type,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = SessionOutput(session_id=session_id, output_type=output_type, status="not_generated")
        db.add(row)
        await db.flush()

    row.status = "generating"
    row.payload = payload or None
    row.error = None
    await db.flush()

    blueprint = await get_or_create_blueprint(session_id, db)
    try:
        artifacts = await handler(project, blueprint.content, payload, db)
    except OutputServiceError as exc:
        row.status = "failed"
        row.error = str(exc)
        await db.commit()
        raise
    except Exception as exc:
        row.status = "failed"
        row.error = str(exc)
        await db.commit()
        logger.exception("output handler %s raised", output_type)
        raise OutputServiceError(f"generation failed: {exc}", status_code=500) from exc

    row.artifacts = artifacts
    row.status = "ready"
    await db.commit()
    await db.refresh(row)
    return row


async def get_output_catalogue(session_id: str, db: AsyncSession) -> list[OutputCatalogueEntry]:
    """Return one catalogue entry per known output type (implemented or not)."""
    rows_by_type = {
        row.output_type: row
        for row in (await db.execute(select(SessionOutput).where(SessionOutput.session_id == session_id)))
        .scalars()
        .all()
    }
    blueprint = await get_or_create_blueprint(session_id, db)

    entries: list[OutputCatalogueEntry] = []
    for output_type in _HANDLERS:
        row = rows_by_type.get(output_type)
        entries.append(
            OutputCatalogueEntry(
                output_type=output_type,  # type: ignore[arg-type]
                status=(row.status if row else "not_generated"),  # type: ignore[arg-type]
                implemented=(output_type in IMPLEMENTED_TYPES),
                maturity=maturity_for(output_type, blueprint.content),
                artifacts=(row.artifacts if row else None),
                updated_at=(row.updated_at if row else None),
            )
        )
    return entries
