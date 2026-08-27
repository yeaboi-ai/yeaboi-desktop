"""Back-fill estimated usage_events for an org's historical sessions.

Usage:
    cd backend
    uv run python scripts/backfill_usage.py --org-id <ORG_ID> [--dry-run]

Defaults to --dry-run so a typo doesn't write thousands of estimate rows.
Pass --commit to actually persist.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from src.app.db import get_session_factory  # noqa: E402
from src.app.models.organization import Organization  # noqa: E402
from src.app.services.usage_backfill import backfill_org_usage  # noqa: E402


async def _run(org_id: str | None, commit: bool) -> int:
    factory = get_session_factory()
    async with factory() as db:
        if not org_id:
            # Iterate every org — useful for first-time platform-wide back-fill.
            orgs = (await db.execute(select(Organization))).scalars().all()
            target_ids = [o.id for o in orgs]
        else:
            target_ids = [org_id]

        for tid in target_ids:
            counts = await backfill_org_usage(db, org_id=tid, dry_run=not commit)
            mode = "DRY-RUN" if not commit else "PERSISTED"
            print(f"[{mode}] org={tid} {counts.to_dict()}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org-id", help="Single org id to back-fill (omit for all orgs)")
    parser.add_argument("--commit", action="store_true", help="Actually write rows (default: dry-run)")
    args = parser.parse_args()
    return asyncio.run(_run(args.org_id, args.commit))


if __name__ == "__main__":
    sys.exit(main())
