#!/usr/bin/env bash
# scripts/demo-prepare.sh — everything `make demo` needs standing before
# Playwright launches the app. Named from demo_spec.py's "prepare", which runs
# exactly one command to completion.
#
# Two jobs, and both exist so a take is the same on every machine:
#
#   1. Build. Playwright launches the real Electron binary against `out/`, not
#      `electron-vite dev` — the renderer throws `preload bridge missing`
#      outside the shell, so there is no dev server to point a browser at.
#
#   2. Seed a throwaway profile, which demo_spec.py points the app at with
#      $YEABOI_DESKTOP_PROFILE. Without it the app reads the profile of whoever
#      is recording: macOS resolves userData from the password database, so
#      neither --user-data-dir nor $HOME moves it, and their name and email end
#      up in a public README GIF. The profile also turns the desktop pet OFF —
#      it is a second BrowserWindow, and Playwright's firstWindow() returns
#      whichever opened first, so an enabled duck makes the take a coin toss.
#
# Both live under .demo/out/, which is gitignored, so a recording never touches
# the real ~/.yeaboi or the profile of an installed copy.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="$ROOT/.demo/out/profile"
HOME_DIR="$ROOT/.demo/out/home"

npm run build

# Recreated every run: a profile carried over from an earlier take can hold a
# half-migrated database, and the demo is meant to show a first-run app.
rm -rf "$PROFILE" "$HOME_DIR"
mkdir -p "$PROFILE" "$HOME_DIR"

cat >"$PROFILE/settings.json" <<'JSON'
{
  "identity": { "email": "sam@yeaboi.ai", "name": "Sam Rivera" },
  "petEnabled": false,
  "pet": { "enabled": false }
}
JSON

echo "[demo] built, and seeded a throwaway profile at .demo/out/"
