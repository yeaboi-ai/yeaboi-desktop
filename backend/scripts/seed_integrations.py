"""Seed integration + directory test data for UI development.

Usage:
    python -m scripts.seed_integrations --profile startup
    python -m scripts.seed_integrations --profile enterprise
    python -m scripts.seed_integrations --profile agency
    python -m scripts.seed_integrations --profile mixed
    python -m scripts.seed_integrations --all          # seed all profiles
    python -m scripts.seed_integrations --clear        # remove all seeded data
    python -m scripts.seed_integrations --list         # show profiles + credentials

Each profile creates its own org + user so you can test by logging in as different users.
In dev mode (credentials provider), just enter the email to log in — no password needed.
"""

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import os

from app.config import get_settings
from app.models.ai_config import OrgAIConfig
from app.models.base import gen_uuid
from app.models.directory import DirectoryEntry
from app.models.integration import IntegrationScanItem, IntegrationScanLog, OrgIntegration
from app.models.organization import Organization, OrgMember, Team, TeamMember
from app.models.user import User
from app.services.crypto import encrypt_api_key

from scripts.seed_directory_data import DIRECTORY_DATA

# ── Profile definitions ──────────────────────────────────────────────────────

PROFILE_USERS = {
    "startup": {"email": "demo-startup@planr.dev", "name": "Alex Chen", "org_name": "Planr", "org_slug": "planr-demo"},
    "enterprise": {"email": "demo-enterprise@planr.dev", "name": "Sarah Mitchell", "org_name": "Acme Corp", "org_slug": "acme-corp-demo"},
    "agency": {"email": "demo-agency@planr.dev", "name": "James Rivera", "org_name": "Pixel & Code", "org_slug": "pixel-code-demo"},
    "mixed": {"email": "demo-mixed@planr.dev", "name": "Priya Sharma", "org_name": "DataFlow", "org_slug": "dataflow-demo"},
}

PROFILES = {
    "startup": {
        "integrations": [
            {"provider": "github", "category": "version_control", "auth_type": "oauth", "status": "active"},
            {"provider": "vercel", "category": "hosting", "auth_type": "oauth", "status": "active"},
            {"provider": "linear", "category": "issue_tracking", "auth_type": "oauth", "status": "active"},
            {"provider": "slack", "category": "communication", "auth_type": "oauth", "status": "active"},
            {"provider": "notion", "category": "documentation", "auth_type": "oauth", "status": "active"},
        ],
        "scan_data": {
            "github": {"resources": 340, "entries": 47, "tokens": 52000, "scans": 8},
            "vercel": {"resources": 52, "entries": 15, "tokens": 8000, "scans": 3},
            "linear": {"resources": 85, "entries": 22, "tokens": 12000, "scans": 4},
            "slack": {"resources": 40, "entries": 12, "tokens": 5000, "scans": 2},
            "notion": {"resources": 60, "entries": 18, "tokens": 9500, "scans": 3},
        },
    },
    "enterprise": {
        "integrations": [
            {"provider": "github", "category": "version_control", "auth_type": "oauth", "status": "active"},
            {"provider": "gitlab", "category": "version_control", "auth_type": "oauth", "status": "active"},
            {"provider": "aws", "category": "cloud", "auth_type": "credential", "status": "active"},
            {"provider": "gcp", "category": "cloud", "auth_type": "credential", "status": "active"},
            {"provider": "jira", "category": "issue_tracking", "auth_type": "oauth", "status": "active"},
            {"provider": "confluence", "category": "documentation", "auth_type": "oauth", "status": "active"},
            {"provider": "slack", "category": "communication", "auth_type": "oauth", "status": "active"},
            {"provider": "datadog", "category": "monitoring", "auth_type": "credential", "status": "active"},
            {"provider": "pagerduty", "category": "monitoring", "auth_type": "oauth", "status": "active"},
            {"provider": "figma", "category": "design", "auth_type": "oauth", "status": "active"},
        ],
        "scan_data": {
            "github": {"resources": 1240, "entries": 186, "tokens": 245000, "scans": 15},
            "gitlab": {"resources": 380, "entries": 52, "tokens": 68000, "scans": 6},
            "aws": {"resources": 892, "entries": 134, "tokens": 178000, "scans": 8},
            "gcp": {"resources": 215, "entries": 38, "tokens": 42000, "scans": 4},
            "jira": {"resources": 320, "entries": 45, "tokens": 28000, "scans": 5},
            "confluence": {"resources": 180, "entries": 62, "tokens": 35000, "scans": 4},
            "slack": {"resources": 75, "entries": 18, "tokens": 8000, "scans": 2},
            "datadog": {"resources": 145, "entries": 28, "tokens": 22000, "scans": 3},
            "pagerduty": {"resources": 32, "entries": 12, "tokens": 6000, "scans": 2},
            "figma": {"resources": 48, "entries": 15, "tokens": 9000, "scans": 2},
        },
    },
    "agency": {
        "integrations": [
            {"provider": "github", "category": "version_control", "auth_type": "oauth", "status": "active"},
            {"provider": "netlify", "category": "hosting", "auth_type": "oauth", "status": "active"},
            {"provider": "trello", "category": "issue_tracking", "auth_type": "oauth", "status": "active"},
            {"provider": "slack", "category": "communication", "auth_type": "oauth", "status": "active"},
            {"provider": "figma", "category": "design", "auth_type": "oauth", "status": "active"},
            {"provider": "asana", "category": "issue_tracking", "auth_type": "oauth", "status": "active"},
        ],
        "scan_data": {
            "github": {"resources": 180, "entries": 32, "tokens": 28000, "scans": 5},
            "netlify": {"resources": 24, "entries": 8, "tokens": 4000, "scans": 2},
            "trello": {"resources": 65, "entries": 14, "tokens": 8500, "scans": 3},
            "slack": {"resources": 30, "entries": 8, "tokens": 3500, "scans": 2},
            "figma": {"resources": 92, "entries": 24, "tokens": 15000, "scans": 4},
            "asana": {"resources": 48, "entries": 12, "tokens": 7000, "scans": 2},
        },
    },
    "mixed": {
        "integrations": [
            {"provider": "github", "category": "version_control", "auth_type": "oauth", "status": "active"},
            {"provider": "gitlab", "category": "version_control", "auth_type": "oauth", "status": "needs_reauth"},
            {"provider": "aws", "category": "cloud", "auth_type": "credential", "status": "active"},
            {"provider": "sentry", "category": "monitoring", "auth_type": "oauth", "status": "active"},
        ],
        "scan_data": {
            "github": {"resources": 210, "entries": 38, "tokens": 34000, "scans": 6},
            "aws": {"resources": 156, "entries": 28, "tokens": 25000, "scans": 4},
            "sentry": {"resources": 42, "entries": 10, "tokens": 7500, "scans": 2},
        },
    },
}

SAMPLE_PATHS = {
    "github": [
        "neakoh/planning-platform/package.json",
        "neakoh/planning-platform/backend/pyproject.toml",
        "neakoh/planning-platform/.github/workflows/ci.yml",
        "neakoh/planning-platform/frontend/tsconfig.json",
        "neakoh/planning-platform/docker-compose.yml",
    ],
    "aws": [
        "aws:us-east-1:ec2:i-0abc123def456",
        "aws:us-east-1:rds:planning-db",
        "aws:us-east-1:s3:planning-uploads",
        "aws:us-east-1:lambda:process-webhook",
    ],
}


# ── Helpers ──────────────────────────────────────────────────────────────────

async def get_or_create_user(session: AsyncSession, email: str, name: str) -> User:
    """Get existing user or create a new one."""
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        return user
    user = User(id=gen_uuid(), email=email, name=name, display_name=name)
    session.add(user)
    await session.flush()
    return user


async def get_or_create_org(session: AsyncSession, user: User, org_name: str, org_slug: str) -> tuple[Organization, Team]:
    """Get existing org or create one with a default team."""
    result = await session.execute(select(Organization).where(Organization.slug == org_slug))
    org = result.scalar_one_or_none()
    if org:
        team_result = await session.execute(select(Team).where(Team.org_id == org.id).limit(1))
        team = team_result.scalar_one_or_none()
        return org, team

    org = Organization(id=gen_uuid(), name=org_name, slug=org_slug)
    session.add(org)
    await session.flush()

    member = OrgMember(id=gen_uuid(), org_id=org.id, user_id=user.id, role="admin")
    session.add(member)

    team = Team(id=gen_uuid(), org_id=org.id, name="Engineering", slug="engineering")
    session.add(team)
    await session.flush()

    team_member = TeamMember(id=gen_uuid(), team_id=team.id, user_id=user.id, role="admin")
    session.add(team_member)
    await session.flush()

    return org, team


async def clear_profile_data(session: AsyncSession, org_slug: str) -> None:
    """Clear all integration + directory data for a specific org."""
    result = await session.execute(select(Organization).where(Organization.slug == org_slug))
    org = result.scalar_one_or_none()
    if not org:
        return

    # Get team for directory entries
    team_result = await session.execute(select(Team).where(Team.org_id == org.id))
    teams = team_result.scalars().all()

    # Delete directory entries for all teams
    for team in teams:
        await session.execute(delete(DirectoryEntry).where(DirectoryEntry.team_id == team.id))

    # Get integration IDs for cascading delete
    int_result = await session.execute(select(OrgIntegration).where(OrgIntegration.org_id == org.id))
    integrations = int_result.scalars().all()
    for integ in integrations:
        await session.execute(delete(IntegrationScanItem).where(
            IntegrationScanItem.scan_log_id.in_(
                select(IntegrationScanLog.id).where(IntegrationScanLog.integration_id == integ.id)
            )
        ))
        await session.execute(delete(IntegrationScanLog).where(IntegrationScanLog.integration_id == integ.id))
    await session.execute(delete(OrgIntegration).where(OrgIntegration.org_id == org.id))
    # Clear AI config
    await session.execute(delete(OrgAIConfig).where(OrgAIConfig.org_id == org.id))
    await session.commit()


async def seed_ai_config(session: AsyncSession, org_id: str) -> None:
    """Seed AI provider config from environment variables."""
    # Check if already exists
    existing = (await session.execute(
        select(OrgAIConfig).where(OrgAIConfig.org_id == org_id)
    )).scalar_one_or_none()
    if existing:
        return

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        print("    ⚠ ANTHROPIC_API_KEY not in env — skipping AI config")
        return

    config = OrgAIConfig(
        id=gen_uuid(),
        org_id=org_id,
        provider="byok",
        byok_provider="anthropic",
        byok_api_key=encrypt_api_key(anthropic_key),
    )
    session.add(config)
    await session.flush()
    print("    ✓ AI config: BYOK Anthropic (from env)")


async def clear_all(session: AsyncSession) -> None:
    """Clear all seeded profile data."""
    for profile_name, user_info in PROFILE_USERS.items():
        await clear_profile_data(session, user_info["org_slug"])
        print(f"  Cleared {profile_name} ({user_info['org_slug']})")
    print("Done.")


# ── Main seeding ─────────────────────────────────────────────────────────────

async def seed_profile(session: AsyncSession, profile_name: str) -> None:
    """Seed a complete profile: user, org, integrations, scans, directory."""
    profile = PROFILES[profile_name]
    user_info = PROFILE_USERS[profile_name]

    # Clear existing data for this profile
    await clear_profile_data(session, user_info["org_slug"])

    # Create user + org + team + AI config
    user = await get_or_create_user(session, user_info["email"], user_info["name"])
    org, team = await get_or_create_org(session, user, user_info["org_name"], user_info["org_slug"])
    await session.commit()

    # Seed AI provider config from env
    await seed_ai_config(session, org.id)
    await session.commit()

    print(f"\n  Profile: {profile_name}")
    print(f"  Login:   {user_info['email']} (dev credentials — just enter email)")
    print(f"  Org:     {user_info['org_name']} ({org.id[:8]}...)")
    print(f"  Team:    Engineering ({team.id[:8]}...)")

    now = datetime.now(timezone.utc)

    # ── Seed integrations + scan data ────────────────────────────────────
    integration_map = {}  # provider → integration object
    for integ_def in profile["integrations"]:
        provider = integ_def["provider"]
        scan_info = profile["scan_data"].get(provider)
        last_scan = now - timedelta(hours=2, minutes=abs(hash(provider)) % 60) if scan_info else None

        integration = OrgIntegration(
            id=gen_uuid(),
            org_id=org.id,
            provider=provider,
            category=integ_def["category"],
            auth_type=integ_def["auth_type"],
            status=integ_def["status"],
            scopes=json.dumps(["read"]),
            connected_by=user.id,
            last_scan_at=last_scan,
        )
        session.add(integration)
        await session.flush()
        integration_map[provider] = integration
        status_icon = "●" if integ_def["status"] == "active" else "○"
        print(f"  {status_icon} {provider} ({integ_def['status']})")

        if scan_info and integ_def["status"] == "active":
            num_scans = scan_info["scans"]
            rps = scan_info["resources"] // num_scans
            eps = scan_info["entries"] // num_scans
            tps = scan_info["tokens"] // num_scans

            for s in range(num_scans):
                scan_start = now - timedelta(days=s * 3, hours=2)
                scan_log = IntegrationScanLog(
                    id=gen_uuid(),
                    integration_id=integration.id,
                    scan_type="full" if s == num_scans - 1 else "incremental",
                    status="completed",
                    started_at=scan_start,
                    completed_at=scan_start + timedelta(minutes=5 + s),
                    resources_scanned=rps + (s % 5),
                    entries_created=eps if s == num_scans - 1 else max(1, eps // 3),
                    entries_updated=0 if s == num_scans - 1 else eps // 2,
                    ai_calls_made=rps + (s % 5),
                    ai_tokens_used=tps + (s * 200),
                )
                session.add(scan_log)
                await session.flush()

                if s == 0:
                    paths = SAMPLE_PATHS.get(provider, [f"{provider}:resource-{i}" for i in range(4)])
                    for idx, path in enumerate(paths[:6]):
                        session.add(IntegrationScanItem(
                            id=gen_uuid(),
                            scan_log_id=scan_log.id,
                            resource_path=path,
                            action="analysed",
                            ai_model_used="claude-haiku-4-5" if idx % 3 != 0 else "claude-sonnet-4-6",
                            tokens_used=200 + (idx * 150),
                        ))
                    session.add(IntegrationScanItem(
                        id=gen_uuid(),
                        scan_log_id=scan_log.id,
                        resource_path=f"{provider}:.env.production",
                        action="skipped",
                        reason="Secret filter: .env file",
                    ))

    # ── Seed directory entries ────────────────────────────────────────────
    entries = DIRECTORY_DATA.get(profile_name, [])
    for entry_data in entries:
        source_provider = entry_data.get("source_provider")
        integration = integration_map.get(source_provider) if source_provider else None
        content_hash = hashlib.sha256(entry_data["content"].encode()).hexdigest()

        entry = DirectoryEntry(
            id=gen_uuid(),
            team_id=team.id,
            path=entry_data["path"],
            title=entry_data["title"],
            content=entry_data["content"],
            category=entry_data["category"],
            source="scan" if source_provider else "manual",
            scan_status="complete" if source_provider else None,
            content_hash=content_hash,
            integration_id=integration.id if integration else None,
            source_ref=f"{source_provider}:scan" if source_provider else None,
        )
        session.add(entry)

    await session.commit()
    print(f"  → {len(entries)} directory entries")
    total_resources = sum(d.get("resources", 0) for d in profile["scan_data"].values())
    print(f"  → {total_resources} total resources scanned")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed integration + directory test data")
    parser.add_argument("--profile", choices=list(PROFILES.keys()), help="Profile to seed")
    parser.add_argument("--all", action="store_true", help="Seed all profiles")
    parser.add_argument("--clear", action="store_true", help="Clear all seeded data")
    parser.add_argument("--list", action="store_true", help="List profiles + login credentials")
    args = parser.parse_args()

    if args.list:
        print("\nAvailable profiles:\n")
        for name, user_info in PROFILE_USERS.items():
            providers = [i["provider"] for i in PROFILES[name]["integrations"]]
            entries = len(DIRECTORY_DATA.get(name, []))
            print(f"  {name:12s}  email: {user_info['email']}")
            print(f"  {'':12s}  org:   {user_info['org_name']}")
            print(f"  {'':12s}  tools: {', '.join(providers)}")
            print(f"  {'':12s}  dir:   {entries} entries")
            print()
        print("  In dev mode, just enter the email in the login field — no password needed.\n")
        return

    if not args.profile and not args.all and not args.clear:
        parser.print_help()
        return

    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        if args.clear:
            print("Clearing all seeded data...")
            await clear_all(session)
        elif args.all:
            print("Seeding all profiles...")
            for name in PROFILES:
                await seed_profile(session, name)
            print("\nAll profiles seeded. Use --list to see login credentials.")
        elif args.profile:
            await seed_profile(session, args.profile)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
