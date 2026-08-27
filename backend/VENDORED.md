# Vendored planning backend

This tree is the planning-platform backend, vendored into the desktop repo so
the app's whole backend surface lives here — the desktop is its only consumer
in this arrangement, and its changes stop needing PRs against an external
repository.

- **Vendored from**: `planning-platform` @ `4195a55faebaf1db5a68932176a6bab39fa47de5`
  (branch `feature/local-mode`, 2026-08-27), which is upstream `main` @ `3a10482`
  plus the desktop's local-mode work:
  - local mode (`YEABOI_LOCAL_MODE=1`): SQLite bootstrap under `~/.yeaboi/planning`
    with WAL, `redis_enabled`/`probes_enabled` switches, `$YEABOI_HOME` config
    path, loopback TrustedHost + Electron CORS origins
  - Claude subscription auth (`src/app/services/anthropic_auth.py`)
  - orchestrator skips board-bridge cards (`yeaboi_story_id`)
  - hatchling wheel packaging (`app` + `agent`, alembic embedded at
    `app/_alembic`) with the agent's heavy deps in the `voice` extra
- **Deliberately not vendored**: the Next.js frontend (the desktop renderer IS
  that frontend, ported), Docker/nixpacks/railway deploy files, the
  personaplex experiment.

## Working in it

```bash
cd backend
uv sync --all-extras        # dev env incl. the voice extra
uv run pytest tests/ -q -m "not slow"
uv build --wheel            # what fetch-runtimes.mjs bundles
```

The desktop dev sidecar (`src/main/planning.ts`) runs this tree via
`uv run uvicorn src.app.main:create_app` with this directory as cwd;
`$YEABOI_PLANNING_REPO` still overrides the location for anyone keeping a
separate checkout.

Rules carried over from upstream: new alembic migrations must use
`op.batch_alter_table` for ALTER operations (SQLite runs them locally —
`scripts/check-sqlite-safe-migrations.sh`), and the API server must import
cleanly without the `voice` extra installed.
