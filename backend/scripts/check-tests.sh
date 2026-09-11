#!/usr/bin/env bash
# Run the backend suite and fail only on a CHANGE against tests/known-failures.txt.
#
# The suite had failures before it had a CI job, so a plain `pytest` would be
# red from its first run and nobody would look at it again. This compares sets,
# both ways: a new failure fails the build, and so does a listed failure that
# has started passing — otherwise the list rots and starts hiding regressions.

set -uo pipefail
cd "$(dirname "$0")/.."

known=tests/known-failures.txt
actual=$(mktemp)
trap 'rm -f "$actual"' EXIT

uv run pytest tests/ -q -m "not slow" -p no:randomly 2>&1 | tee /dev/stderr \
  | grep -E '^(FAILED|ERROR) tests/' | sed -E 's/^(FAILED|ERROR) //; s/ - .*//' | sort -u > "$actual"

expected=$(mktemp)
trap 'rm -f "$actual" "$expected"' EXIT
grep -v '^#' "$known" | grep -v '^[[:space:]]*$' | sort -u > "$expected"

new=$(comm -13 "$expected" "$actual")
fixed=$(comm -23 "$expected" "$actual")

status=0
if [[ -n "$new" ]]; then
  echo ""
  echo "New test failures (not in $known):"
  sed 's/^/  /' <<<"$new"
  status=1
fi
if [[ -n "$fixed" ]]; then
  echo ""
  echo "These are listed in $known but now pass — delete their lines:"
  sed 's/^/  /' <<<"$fixed"
  status=1
fi
[[ $status -eq 0 ]] && echo "" && echo "backend tests: no change against the known-failure list"
exit $status
