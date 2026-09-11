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

# Both are extras rather than uv groups, so `uv run` alone installs neither.
# `voice` is ~200MB and only four test files need it — but without it those
# four fail to import, and a collection error is not a failure pytest reports
# in the FAILED lines this script compares. Install it and run the whole suite.
output=$(mktemp)
trap 'rm -f "$actual" "$output"' EXIT
uv run --extra dev --extra voice pytest tests/ -q -m "not slow" -p no:randomly 2>&1 | tee "$output" /dev/stderr >/dev/null

# A run that never collected anything would otherwise look like a clean sweep:
# no FAILED lines means an empty set, which reads as "everything got fixed".
if ! grep -qE '^[0-9]+ (passed|failed)|=+ .* (passed|failed)' "$output"; then
  echo ""
  echo "pytest did not produce a summary line — the run did not happen. Last output:"
  tail -20 "$output"
  exit 1
fi

# A module that will not import yields an ERROR at collection, not a FAILED
# line, so it would otherwise pass through this comparison unseen.
if grep -qE 'errors? during collection|^ERROR tests/.*\.py$' "$output"; then
  echo ""
  echo "Test modules failed to import:"
  grep -E '^ERROR tests/' "$output" | sed 's/^/  /'
  exit 1
fi

grep -E '^(FAILED|ERROR) tests/' "$output" | sed -E 's/^(FAILED|ERROR) //; s/ - .*//' | sort -u > "$actual"

expected=$(mktemp)
flaky=$(mktemp)
trap 'rm -f "$actual" "$output" "$expected" "$flaky"' EXIT

# Everything before the [flaky] marker must keep failing; everything after it
# may do either, because it is nondeterministic.
sed -n '1,/^\[flaky\]/p' "$known" | grep -v '^#' | grep -v '^\[flaky\]' | grep -v '^[[:space:]]*$' | sort -u > "$expected"
sed -n '/^\[flaky\]/,$p' "$known" | grep -v '^#' | grep -v '^\[flaky\]' | grep -v '^[[:space:]]*$' | sort -u > "$flaky"

# A flaky test failing is not news either way, so drop it from both sides.
actual_stable=$(mktemp)
trap 'rm -f "$actual" "$output" "$expected" "$flaky" "$actual_stable"' EXIT
comm -23 "$actual" "$flaky" > "$actual_stable"

new=$(comm -13 "$expected" "$actual_stable")
fixed=$(comm -23 "$expected" "$actual_stable")

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
