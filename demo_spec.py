"""What this repo's README GIF shows: the app window, across the surfaces it runs.

Driven through Playwright's Electron support rather than a browser. The renderer
needs the preload bridge (``window.yeaboi``), so pointing a browser at a dev
server captures an error page, not the app — only the real shell has it.

Three things have to be true before a take is the app rather than a picture of
something going wrong, and each is a bug this spec was written around:

- **The profile must be a throwaway one.** ``YEABOI_DESKTOP_PROFILE`` points
  userData at a seeded directory. Without it the app reads the real profile of
  whoever is recording — macOS resolves userData from the password database, so
  neither ``--user-data-dir`` nor ``$HOME`` moves it — and their name and email
  go into a public README GIF.
- **The window must be the app's.** The desktop pet is a second BrowserWindow
  and ``firstWindow()`` returns whichever opened first, so the seeded profile
  turns the duck off. With the real profile this is a coin toss.
- **The yeaboi sidecar must resolve.** Its dev fallback is ``uv run yeaboi app``
  in a *sibling* checkout, and a worktree is three directories down — the spawn
  then fails with ``ENOENT`` and every route renders "the yeaboi backend is
  down". ``YEABOI_DESKTOP_PYTHON`` below names the interpreter outright, so the
  take is identical from the main checkout and from a worktree.

The planning backend needs nothing: the app spawns the bundled one from
``resources/py-planning`` against a SQLite file under ``$YEABOI_HOME``, which is
pointed at a throwaway directory here.
"""

from pathlib import Path

_ROOT = Path(__file__).resolve().parent

# The yeaboi checkout, found by walking up rather than assumed to be a sibling:
# from the main checkout that is `../yeaboi.ai`, from `.claude/worktrees/<name>`
# it is four levels further up, and `make demo` must work from both.
_YEABOI = next(
    (parent / "yeaboi.ai" for parent in _ROOT.parents if (parent / "yeaboi.ai" / ".git").exists()),
    _ROOT.parent / "yeaboi.ai",
)

# Written by scripts/demo-prepare.sh, under the gitignored .demo/out/. Keeping
# both here means a recording never reads or writes the real ~/.yeaboi, or the
# profile of an installed copy.
_PROFILE = _ROOT / ".demo" / "out" / "profile"
_HOME = _ROOT / ".demo" / "out" / "home"


def _route(hash_path: str, heading: str, hold: float = 2.6) -> list:
    """Move to a route and wait for its own heading before holding the frame.

    Waiting on the heading rather than a fixed pause is what keeps the tour
    honest: a route that stops rendering fails the take instead of quietly
    filming an empty panel for two and a half seconds.
    """
    return [
        ("hash", hash_path),
        ("await", f'main h1:has-text("{heading}")', 20),
        ("pause", hold),
    ]


SPEC = {
    "kind": "page",
    "gif": "demo-desktop.gif",
    # The BrowserWindow's own size, from src/main/index.ts.
    "width": 1280,
    "height": 840,
    # Playwright launches Electron itself, so it needs a built app rather than
    # `electron-vite dev`'s orchestration. This also seeds the profile.
    "prepare": ["bash", "scripts/demo-prepare.sh"],
    "prepare_cwd": ".",
    "electron": {
        # Playwright resolves Electron from its own node_modules by default, and
        # the recorder deliberately carries no ~100MB binary — this repo has one.
        "executable": "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        "args": ["out/main/index.js"],
        "cwd": ".",
        "env": {
            "YEABOI_DESKTOP_PROFILE": str(_PROFILE),
            "YEABOI_HOME": str(_HOME),
            "YEABOI_REPO": str(_YEABOI),
            "YEABOI_DESKTOP_PYTHON": str(_YEABOI / ".venv" / "bin" / "python"),
        },
    },
    # Not `body`: the shell paints its frame long before the sidecar handshake
    # lands, and a heading in `main` is the first thing that means the app is up.
    # Both backends cold-start here, which is why this is generous.
    "ready": "main h1",
    "ready_timeout": 120,
    "steps": [
        ("pause", 1.6),
        # Home first — the nav down the left is the shape of the product.
        *_route("#/home", "Home", 3.0),
        # Then the three surfaces a team actually opens it for.
        *_route("#/humans/planning", "Plan a project"),
        *_route("#/humans/retro", "Retro"),
        *_route("#/humans/poker", "Planning poker"),
        # And what it costs, which is the question every desktop LLM app gets.
        *_route("#/usage", "Usage"),
        ("pause", 1.2),
    ],
    "verify": {
        "duration_s": (6.0, 45.0),
    },
}
