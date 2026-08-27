"""Seed a runnable demo: 4 demo orgs/users (via seed_integrations) plus a
demo project + active session for the "startup" profile so a colleague can
sign in and immediately have something to click into.

Idempotent — running twice is a no-op (project + session are looked up by name).

Usage: `make seed`  (or `cd backend && uv run python scripts/seed_demo.py`)
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import get_settings
from app.models.organization import Organization, Team
from app.models.project import Project
from app.models.session import Participant, Session
from app.models.user import User

DEMO_EMAIL = "demo-startup@planr.dev"
DEMO_PROJECT_NAME = "Demo · Onboarding flow"
DEMO_SESSION_TITLE = "Kickoff session"
DEMO_INITIAL_IDEA = (
    "Plan the v1 onboarding flow for new Planr customers — what screens, what data we "
    "collect, where the AI facilitator helps. Treat this as a working session, not a "
    "presentation."
)


async def ensure_project_and_session() -> None:
    settings = get_settings()
    db_url = settings.database_url
    if "+asyncpg" not in db_url:
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(db_url, future=True)
    Session_ = async_sessionmaker(engine, expire_on_commit=False)

    async with Session_() as db:
        user = (await db.execute(select(User).where(User.email == DEMO_EMAIL))).scalar_one_or_none()
        if user is None:
            print(f"  ✗ user {DEMO_EMAIL} not found — did seed_integrations --all run?")
            return

        org = (await db.execute(select(Organization).where(Organization.id == user.org_id))).scalar_one_or_none()
        if org is None:
            print(f"  ✗ org for {DEMO_EMAIL} not found")
            return

        team = (await db.execute(select(Team).where(Team.org_id == org.id))).scalar_one_or_none()
        if team is None:
            print(f"  ✗ no team in org {org.name}")
            return

        proj = (
            await db.execute(
                select(Project).where(
                    Project.org_id == org.id,
                    Project.name == DEMO_PROJECT_NAME,
                )
            )
        ).scalar_one_or_none()

        if proj is None:
            proj = Project(
                name=DEMO_PROJECT_NAME,
                description="Synthetic project created by `make seed` so colleagues have something to open.",
                owner_id=user.id,
                org_id=org.id,
                team_id=team.id,
            )
            db.add(proj)
            await db.flush()
            print(f"  ✓ created project {proj.name!r}")
        else:
            print(f"  ○ project {proj.name!r} already exists")

        sess = (
            await db.execute(
                select(Session).where(
                    Session.project_id == proj.id,
                    Session.title == DEMO_SESSION_TITLE,
                )
            )
        ).scalar_one_or_none()

        if sess is None:
            sess = Session(
                project_id=proj.id,
                org_id=org.id,
                status="active",
                title=DEMO_SESSION_TITLE,
                initial_idea=DEMO_INITIAL_IDEA,
                ai_config={"assertiveness": "balanced", "muted": False, "persona": "default"},
            )
            db.add(sess)
            await db.flush()
            db.add(Participant(session_id=sess.id, user_id=user.id, role="host"))
            print(f"  ✓ created session {sess.title!r} ({sess.status})")
        else:
            print(f"  ○ session {sess.title!r} already exists")

        await db.commit()
        print(f"\nOpen: http://localhost:3001/projects/{proj.id}/sessions/{sess.id}")
        print(f"Sign in as: {DEMO_EMAIL}")

    await engine.dispose()


def main() -> int:
    print("seeding demo data...\n")
    print("→ seed_integrations --all (creates 4 demo orgs/users)")
    res = subprocess.run(
        [sys.executable, "-m", "scripts.seed_integrations", "--all"],
        cwd=Path(__file__).resolve().parent.parent,
    )
    if res.returncode != 0:
        print("  ✗ seed_integrations failed — aborting")
        return res.returncode

    print("\n→ ensuring demo project + session for startup profile")
    asyncio.run(ensure_project_and_session())
    return 0


if __name__ == "__main__":
    sys.exit(main())
