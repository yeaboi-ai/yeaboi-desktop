#!/usr/bin/env bash
# scripts/dev-preflight.sh — refuse to `make dev` against a stale yeaboi.ai.
#
# In unpackaged dev the sidecar runs `uv run yeaboi app` from a sibling
# yeaboi.ai checkout (src/shared/dev-repo.ts resolves which one). When that
# checkout is behind origin/main, routes this renderer expects can be missing —
# and a missing route does not fail loudly: it renders as the polite "update
# yeaboi to browse it" staleness note inside whichever feature happens to hit
# it first. Catch it here, before the app even opens.
#
# The check only compares a checkout that sits on main: a feature branch or a
# worktree is someone deliberately running unmerged backend work, and "behind
# origin/main" means nothing there. Offline is never fatal — a failed fetch
# skips the check, it does not block dev.
#
#   YEABOI_DEV_STALE_OK=1   run anyway, stale (warns instead of refusing)

set -euo pipefail

say() { echo "[dev] $*" >&2; }

# Never prompt: an unknown host key or a credential prompt would hang the
# preflight with no output. Same discipline as tooling-sync.sh.
git_offline() { GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}" git "$@"; }

# An explicit interpreter bypasses the checkout entirely (sidecar.ts order #1)
# — there is nothing on disk for this script to compare.
if [ -n "${YEABOI_DESKTOP_PYTHON:-}" ]; then
  exit 0
fi

# Mirror devRepoCandidates() in src/shared/dev-repo.ts: $YEABOI_REPO names the
# checkout outright; from a worktree, prefer yeaboi.ai's matching worktree,
# then its main checkout; else the sibling of this repo.
root="$(pwd)"
if [ -n "${YEABOI_REPO:-}" ]; then
  candidates=("$YEABOI_REPO")
else
  candidates=()
  if [[ "$root" =~ ^(.*)/\.claude/worktrees/(.+)$ ]]; then
    checkout="${BASH_REMATCH[1]}"
    name="${BASH_REMATCH[2]}"
    candidates+=("$(dirname "$checkout")/yeaboi.ai/.claude/worktrees/$name")
    candidates+=("$(dirname "$checkout")/yeaboi.ai")
  fi
  candidates+=("$(dirname "$root")/yeaboi.ai")
fi

repo=""
for candidate in "${candidates[@]}"; do
  if [ -d "$candidate" ]; then repo="$candidate"; break; fi
done
# No checkout at all is the sidecar's error to explain (it names every
# candidate and both env overrides); duplicating that here would drift.
[ -n "$repo" ] && [ -d "$repo/.git" ] || exit 0

branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  say "backend runs from $repo on '$branch' — skipping the origin/main freshness check"
  exit 0
fi

if ! git_offline -C "$repo" fetch --quiet origin main 2>/dev/null; then
  say "could not fetch $repo (offline?) — skipping the freshness check"
  exit 0
fi

behind="$(git -C "$repo" rev-list --count HEAD..origin/main)"
if [ "$behind" -eq 0 ]; then
  exit 0
fi

say "$repo is $behind commit(s) behind origin/main:"
git -C "$repo" log --oneline HEAD..origin/main | sed 's/^/[dev]   /' >&2
if [ -n "${YEABOI_DEV_STALE_OK:-}" ]; then
  say "YEABOI_DEV_STALE_OK is set — running against the stale backend anyway"
  exit 0
fi
say "a stale backend answers 404 for routes this renderer ships, which reads"
say "as \"update yeaboi\" in Settings instead of failing here."
say "fix:  git -C $repo pull --ff-only"
say "or:   YEABOI_DEV_STALE_OK=1 make dev"
exit 1
