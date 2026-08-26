"""Locate the yeaboi-site checkout the icon generator reads its master art from.

The duck is a *served* asset of the website, so the art lives there and the
renditions live with the surface that draws them. ``gen_desktop_icons.py`` is
the only thing here that crosses that line, it never runs on a PR, and its
output is committed and guarded — so the second checkout is a cost paid by
whoever changes the brand, and never by CI.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_HINT = """Set YEABOI_SITE to your yeaboi-site checkout, or clone it beside this repo:

    git clone git@github.com:yeaboi-ai/yeaboi-site.git
    YEABOI_SITE=/path/to/yeaboi-site make icons
"""


def _main_checkout() -> Path:
    """This repo's main working tree — not the worktree the caller stands in.

    Worktrees live at ``<main>/.claude/worktrees/<name>``, so walking up from
    ``ROOT`` finds ``.claude/worktrees`` rather than the directory the sibling
    repos are cloned into.
    """
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ROOT
    return Path(common).parent if common else ROOT


def site_root() -> Path:
    """The yeaboi-site checkout: ``$YEABOI_SITE``, else a sibling of this repo."""
    if override := os.environ.get("YEABOI_SITE"):
        found = Path(override).expanduser().resolve()
        if not found.is_dir():
            raise SystemExit(f"YEABOI_SITE points at {found}, which is not a directory.\n\n{_HINT}")
    else:
        found = _main_checkout().parent / "yeaboi-site"

    # index.html rather than the directory: an empty dir left by a failed clone
    # would otherwise be accepted and the read would fail somewhere less obvious.
    if (found / "index.html").is_file():
        return found
    raise SystemExit(f"no yeaboi-site checkout at {found}.\n\n{_HINT}")


def site_assets() -> Path:
    """The website's ``assets/`` — the master brand art lives here."""
    return site_root() / "assets"
