"""Sync the design library from `~/.claude/design-library/` into the repo.

Source of truth stays local (personal reference, includes `captures/` —
reference-site screenshots + extraction scripts that don't belong in git).
The repo mirror contains ONLY the `.md` guides + `recipes/` directory.

Run this whenever the local library is updated:

    python backend/scripts/sync_design_library.py [--dry-run]

Lives out of alembic/ because it's repo-tooling, not a migration.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

SRC = Path.home() / ".claude" / "design-library"
DST = Path(__file__).resolve().parent.parent / "src" / "app" / "diagram_harness" / "design-library"

# Everything under SRC that matches these glob patterns is mirrored.
# `captures/` and `node_modules/` are deliberately excluded.
INCLUDE_GLOBS = [
    "*.md",
    "recipes/*.md",
]

# Hard exclusions — things that could accidentally match otherwise.
EXCLUDE_DIRS = {"captures", "node_modules", ".git"}


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _collect_sources() -> list[Path]:
    files: list[Path] = []
    for pattern in INCLUDE_GLOBS:
        for p in SRC.glob(pattern):
            if any(part in EXCLUDE_DIRS for part in p.parts):
                continue
            if p.is_file():
                files.append(p)
    return sorted(set(files))


def _collect_existing() -> set[Path]:
    if not DST.exists():
        return set()
    return {p for p in DST.rglob("*.md") if p.is_file()}


def sync(dry_run: bool = False) -> tuple[int, int, int]:
    """Return (added, updated, removed) counts."""
    if not SRC.exists():
        print(f"ERROR: source missing: {SRC}", file=sys.stderr)
        sys.exit(1)

    src_files = _collect_sources()
    src_rel = {p.relative_to(SRC) for p in src_files}

    added = updated = removed = 0

    if not dry_run:
        DST.mkdir(parents=True, exist_ok=True)

    for src in src_files:
        rel = src.relative_to(SRC)
        dst = DST / rel

        if not dst.exists():
            added += 1
            print(f"  + {rel}")
            if not dry_run:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
            continue

        if _hash(src) != _hash(dst):
            updated += 1
            print(f"  ~ {rel}")
            if not dry_run:
                shutil.copy2(src, dst)

    # Remove files in DST that no longer exist in SRC (stale mirrors)
    for existing in _collect_existing():
        rel = existing.relative_to(DST)
        if rel not in src_rel:
            removed += 1
            print(f"  - {rel}")
            if not dry_run:
                existing.unlink()
                # Clean up empty parent dirs (e.g. `recipes/`)
                parent = existing.parent
                while parent != DST and parent.exists() and not any(parent.iterdir()):
                    parent.rmdir()
                    parent = parent.parent

    return added, updated, removed


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync ~/.claude/design-library into the repo.")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing")
    args = parser.parse_args()

    print(f"source:      {SRC}")
    print(f"destination: {DST}")
    print(f"{'DRY RUN' if args.dry_run else 'LIVE'}\n")

    added, updated, removed = sync(dry_run=args.dry_run)

    total = added + updated + removed
    print(f"\n{added} added · {updated} updated · {removed} removed · {total} total")

    if args.dry_run and total:
        print("Re-run without --dry-run to apply.")


if __name__ == "__main__":
    main()
