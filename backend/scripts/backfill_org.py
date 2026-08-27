"""One-off script to create default org+team and backfill org_id/team_id."""

import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update

from src.app.db import get_session_factory
from src.app.models.blueprint import BlueprintSnapshot
from src.app.models.board import Board
from src.app.models.harness import HarnessConfig
from src.app.models.notification import Notification
from src.app.models.organization import Organization, OrgMember, Team, TeamMember
from src.app.models.project import Project
from src.app.models.session import Session
from src.app.models.user import User


async def backfill():
    session_factory = get_session_factory()
    async with session_factory() as db:
        # Check if org already exists (idempotent)
        existing = await db.execute(select(Organization).limit(1))
        if existing.scalar_one_or_none():
            print("Organization already exists — skipping backfill")
            return

        # Create default org
        org = Organization(name="Default Organization", slug="default", plan="free")
        db.add(org)
        await db.flush()
        print(f"Created org: {org.id}")

        # Create default team
        team = Team(org_id=org.id, name="Default Team", slug="default")
        db.add(team)
        await db.flush()
        print(f"Created team: {team.id}")

        # Add all users
        users = list((await db.execute(select(User))).scalars().all())
        for user in users:
            db.add(OrgMember(org_id=org.id, user_id=user.id, role=user.role or "member"))
            db.add(TeamMember(team_id=team.id, user_id=user.id, role=user.role or "member"))
        print(f"Added {len(users)} users to org and team")

        # Backfill projects
        result = await db.execute(
            update(Project).where(Project.org_id.is_(None)).values(org_id=org.id, team_id=team.id)
        )
        print(f"Backfilled {result.rowcount} projects")

        # Backfill dependent tables
        for model, name in [
            (Board, "boards"),
            (Session, "sessions"),
            (BlueprintSnapshot, "blueprint_snapshots"),
            (Notification, "notifications"),
            (HarnessConfig, "harness_configs"),
        ]:
            try:
                r = await db.execute(update(model).where(model.org_id.is_(None)).values(org_id=org.id))
                print(f"Backfilled {r.rowcount} {name}")
            except Exception as e:
                print(f"Skipping {name}: {e}")

        await db.commit()
        print("Backfill complete!")


if __name__ == "__main__":
    asyncio.run(backfill())
