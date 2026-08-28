<div align="center">

<img src="https://yeaboi.ai/banner.jpg" alt="yeaboi.ai" width="800"/>

# 🦆 yeaboi-desktop

**The duck-branded planning app — AI-facilitated planning sessions, a living blueprint, and a kanban board, in an Electron shell with a desktop duck.**

[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![Release](https://img.shields.io/github/v/release/yeaboi-ai/yeaboi-desktop-releases?style=for-the-badge&logo=github&label=Release)](https://github.com/yeaboi-ai/yeaboi-desktop-releases/releases/latest)

[![CI](https://img.shields.io/github/actions/workflow/status/yeaboi-ai/yeaboi-desktop/ci.yml?style=for-the-badge&label=CI&logo=github)](https://github.com/yeaboi-ai/yeaboi-desktop/actions)

</div>

---

## What this is

The planning-platform's core loop as a desktop app:

- **Projects → planning sessions** — a chat with an AI facilitator on the left,
  the living **blueprint** (13 sections, AI suggestions, coverage) on the right.
- **Completion wizard** — when coverage is high enough, gaps → defaults →
  generated stories in dependency waves, committed to the board.
- **Kanban board + tickets** — the stories land somewhere you can drag them.
- **Niko** — a global assistant (Cmd+.) with tool-calling, duck-fronted.
- **The duck** — the `<Duck>` brand component through the UI, a speech-bubble
  quip arbiter in the corner of the window, a menu-bar duck, and the desktop
  **pet**: an always-on-top physics duck that perches on the Dock and repeats
  the app's quips.

The renderer is the planning-platform frontend (React 19) running as a Vite
SPA under electron-vite, with small shims standing in for the Next.js surface
it was written against.

**A packaged app is self-contained.** `scripts/fetch-runtimes.mjs` stages two
python-build-standalone runtimes into `resources/` — `py` for `yeaboi app` and
`py-planning` for the planning backend vendored at `backend/` — and
`scripts/fetch-livekit.mjs` stages a `livekit-server` beside them. The main
process spawns all three from `process.resourcesPath`, so an installed app needs
no Python, no separate backend, and no network on first run. Only a **dev** run
reaches for a backend it did not bring.

## Downloads

Installers are published to
**[yeaboi-desktop-releases](https://github.com/yeaboi-ai/yeaboi-desktop-releases/releases/latest)**,
a public repo — this one is private and can host nothing anybody can download.

| | |
|---|---|
| Apple silicon (M1 and later) | `yeaboi.ai-arm64.dmg` |
| Intel | `yeaboi.ai-x64.dmg` |

The names carry no version on purpose: yeaboi.ai links them through
`/releases/latest/download/<asset>`, which resolves only while the name is stable.

## Running it from source

A dev run does **not** use the staged runtimes. You need the
[planning-platform](../planning-platform) backend on `localhost:8000`:

```bash
cd ../planning-platform
make db-up && make db-migrate
make dev-backend        # FastAPI on :8000 (Next frontend not needed)
```

Its `.env` must include the desktop origins in `CORS_ORIGINS`
(`http://localhost:5173`, `app://yeaboi`) — see `.env.example` here.

Then:

```bash
npm install
npm run dev             # electron-vite, HMR
```

First run asks for a name and an email; the main process mints HS256 JWTs
from them with the shared secret (`YEABOI_JWT_SECRET`, which must equal the
backend's `NEXTAUTH_SECRET`), and the backend creates the user on first
request — the same trust model as the platform's dev login.

## Repository shape

```
src/main/       Electron main — windows, tray, pet, auth (JWT mint), updater
src/preload/    the window.yeaboi bridge, and the pet's narrower one
src/renderer/   the planning UI (components/hooks/lib ported from
                planning-platform/frontend), pages/ + app/ for the SPA shell,
                shims/ for next/navigation, next/link, next/dynamic, next-auth
vendor/         the @yeaboi-ai/design tarball (Duck, Wordmark) — npm's 1.0.1
                predates the duck
backend/        the vendored planning backend; fetch-runtimes builds a wheel
                from it at release time
scripts/        fetch-runtimes.mjs and fetch-livekit.mjs stage resources/;
                gen_desktop_icons.py renders the icon set from the website's
                duck art; gen-routes-manifest.mjs writes the parity manifest
resources/      gitignored, staged at release time — py, py-planning, livekit
```

`npm run typecheck`, `npm test`, `npm run build` — all Electron-free.
`npm run pack` for an unsigned local package.
