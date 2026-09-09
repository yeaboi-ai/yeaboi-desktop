#!/usr/bin/env bash
# scripts/dev-preflight.sh — keep `make dev` off a stale yeaboi.ai.
#
# In unpackaged dev the sidecar runs `uv run yeaboi app` from a sibling
# yeaboi.ai checkout (src/shared/dev-repo.ts resolves which one). When that
# checkout is behind origin/main, routes this renderer expects can be missing —
# and a missing route does not fail loudly: it renders as the polite "update
# yeaboi to browse it" staleness note inside whichever feature happens to hit
# it first. Catch it here, before the app even opens.
#
# Behind is fixed, not reported: the checkout is fast-forwarded and dev carries
# on. Only a merge git itself refuses stops the run.
#
# The check only compares a checkout that sits on main: a feature branch or a
# worktree is someone deliberately running unmerged backend work, and "behind
# origin/main" means nothing there. Offline is never fatal — a failed fetch
# skips the check, it does not block dev.
#
#   YEABOI_DEV_STALE_OK=1   run anyway, stale (fast-forwards nothing, warns instead)

set -euo pipefail

say() { echo "[dev] $*" >&2; }

# Never prompt: an unknown host key or a credential prompt would hang the
# preflight with no output. Same discipline as tooling-sync.sh.
git_offline() { GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}" git "$@"; }

# Repo-root paths the dev run regenerates on its own: `uv run` rewrites
# uv.lock's version line whenever the checkout's pyproject version has moved
# past it. Nothing else here is machine-written, and a nested path of the same
# name is somebody's file.
LOCKFILES=" uv.lock "

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

# The directory alone picks the candidate, exactly as the sidecar picks it —
# choosing differently would check one checkout and run the other.
repo=""
for candidate in "${candidates[@]}"; do
  if [ -d "$candidate" ]; then repo="$candidate"; break; fi
done
# `.git` is a directory in a main checkout and a FILE in a linked worktree; a
# candidate holding neither is the sidecar's error to explain (it names every
# candidate and both env overrides), and duplicating that here would drift.
[ -n "$repo" ] && { [ -d "$repo/.git" ] || [ -f "$repo/.git" ]; } || exit 0

# Self-heal a stray `core.bare=true` (left by an interrupted parallel session):
# it fails every work-tree command with "this operation must be run in a work
# tree" while leaving the read-only ones below working, so without this the
# preflight reports staleness and every fix for it dies. Same heal as the
# shared tooling's wt.sh.
git -C "$repo" config core.bare false 2>/dev/null || true

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
  say "YEABOI_DEV_STALE_OK is set — running against the stale backend, checkout untouched"
  exit 0
fi

# merge --ff-only, not pull: no rebase or merge commit is ever wanted here, and
# git's own refusal is the only reason worth reporting. $err holds that reason
# and is empty once the merge lands.
ff() {
  if err="$(git -C "$repo" merge --ff-only origin/main 2>&1)"; then
    err=""
    return 0
  fi
  return 1
}

# git puts a multi-line hint under its refusal, and the first line of the two
# streams together is often that hint rather than the reason.
reason() { printf '%s' "$err" | grep -m1 -E '^(fatal|error):' || printf '%s' "$err" | head -1; }

# Tracked paths standing in the way. -uno: this checkout always carries
# untracked build output, and none of it is ever something to clear away.
dirty=()
while IFS= read -r line; do
  [ -n "$line" ] && dirty+=("${line:3}")
done < <(git -C "$repo" status --porcelain -uno)

if ! ff; then
  # A lockfile the incoming commits also touch is the one dirt worth clearing:
  # the dev sidecar regenerates it every launch, so it is machine noise that
  # would block every future dev run too. Copy it aside first — discarding is
  # only safe because it is reproducible, not because it is worthless.
  restorable=0
  if [ ${#dirty[@]} -gt 0 ] && git -C "$repo" merge-base --is-ancestor HEAD origin/main; then
    restorable=1  # a diverged history is not a fast-forward dirt is in the way of
  fi
  for path in "${dirty[@]+"${dirty[@]}"}"; do
    case "$LOCKFILES" in *" $path "*) ;; *) restorable=0 ;; esac
    [ -f "$repo/$path" ] || restorable=0  # a deletion is nobody's regenerated file
    if git -C "$repo" diff --quiet HEAD origin/main -- "$path"; then restorable=0; fi
  done

  if [ "$restorable" = 1 ]; then
    backup="$(mktemp -d "${TMPDIR:-/tmp}/yeaboi-dev-lock.XXXXXX")"
    for path in "${dirty[@]}"; do
      mkdir -p "$backup/$(dirname "$path")"
      cp "$repo/$path" "$backup/$path"
    done
    git -C "$repo" checkout -- "${dirty[@]}"
    say "set aside ${dirty[*]} (regenerated by the dev run) — copy in $backup"
    ff || true
  fi
fi

if [ -n "${err:-}" ]; then
  say "could not fast-forward $repo — git said: $(reason)"
  say "a stale backend answers 404 for routes this renderer ships, which reads"
  say "as \"update yeaboi\" in Settings instead of failing here."
  say "fix:  git -C $repo pull --ff-only"
  say "or:   YEABOI_DEV_STALE_OK=1 make dev"
  exit 1
fi

say "fast-forwarded $repo to $(git -C "$repo" rev-parse --short HEAD) ($behind commit(s))"
exit 0
