#!/usr/bin/env bash
# scripts/provision.sh — what a fresh worktree of THIS repo needs. wt.sh runs it
# from the new worktree's root. Every yeaboi repo has one (or deliberately does
# not): it is the seam where a shared script stops and a toolchain begins.
#
# One toolchain here, and it is npm. The icon generator borrows a Python for the
# length of one command (`uv run --with`), so there is no environment to make.
#
# The Electron binary is a ~100MB download and nothing in the ordinary loop
# launches it — typecheck, vitest and the manifest gate all run without it.
# Packaging is what needs it, and `make pack` will fetch it then.

set -euo pipefail

ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --silent
echo "[provision] node_modules ready (no Electron binary — 'make pack' fetches it)"
