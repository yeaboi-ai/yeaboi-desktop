"""What this repo's README GIF shows: the app window, across a few routes.

Driven through Playwright's Electron support rather than a browser. The
renderer throws `preload bridge missing` when ``window.yeaboi`` is absent
(src/renderer/api.ts), so pointing a browser at the dev server captures an
error page, not the app — only the real shell has the bridge.

Two things must be true before this can run, and neither is true after a plain
`make install`:

- **The Electron binary must be present.** `scripts/provision.sh` sets
  ``ELECTRON_SKIP_BINARY_DOWNLOAD=1`` on purpose, so fetch it once with
  ``node node_modules/electron/install.js``.
- **The sidecar must resolve.** ``YEABOI_DESKTOP_PYTHON`` points at an
  interpreter that can ``import yeaboi``; without the ``YEABOI_APP_READY``
  handshake the window only ever shows the splash duck.
"""

import os

_YEABOI = os.environ.get("YEABOI_REPO", "../yeaboi.ai")

SPEC = {
    "kind": "page",
    "gif": "demo-desktop.gif",
    "width": 1280,
    "height": 840,  # the BrowserWindow's own size, from src/main/index.ts
    # Playwright launches Electron itself, so it needs a built app rather than
    # `electron-vite dev`'s orchestration.
    "prepare": ["npm", "run", "build"],
    "prepare_cwd": ".",
    "electron": {
        # Playwright resolves Electron from its own node_modules by default,
        # and the recorder deliberately carries no ~100MB binary.
        "executable": "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        "args": ["out/main/index.js"],
        "cwd": ".",
        "env": {
            "YEABOI_REPO": _YEABOI,
            "YEABOI_DESKTOP_PYTHON": f"{_YEABOI}/.venv/bin/python",
        },
    },
    # Wait for the home grid, not just <body>: the shell paints a splash duck
    # until the backend handshake lands, and capturing before that films it.
    "ready": "text=HUMANS — RUN YOUR TEAM'S SCRUM",
    "ready_timeout": 60,
    "steps": [
        ("pause", 2.5),
        # The renderer is a hash router, so a route is reachable directly and
        # assigning the hash never reloads the document.
        ("hash", "#/agents/usage"),
        ("pause", 2.6),
        ("hash", "#/humans/planning"),
        ("pause", 2.6),
        ("hash", "#/humans/standup"),
        ("pause", 2.6),
        ("hash", "#/home"),
        ("pause", 2.0),
    ],
    "verify": {
        "duration_s": (6.0, 45.0),
    },
}
