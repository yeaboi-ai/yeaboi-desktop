# --- shared tooling (yeaboi-tooling, pinned by .tooling-rev) ------------------
#
# Paste this block at the top of the repo's Makefile, verbatim. It clones the
# tooling repo to `.tooling/` at the pinned sha and includes the shared targets
# (wt-*, tooling-*, contracts-*). The clone happens at parse time and only when
# the pin and the checkout disagree, so the steady state is two file reads and
# no network — and a fresh `git worktree add`, which never populates a
# submodule, provisions itself on the first `make`.
#
# Bump the pin with `make tooling-bump` and commit `.tooling-rev`.

TOOLING      := .tooling
TOOLING_REV  := $(shell cat .tooling-rev 2>/dev/null | tr -d '[:space:]')
TOOLING_HAVE := $(shell cat $(TOOLING)/.git/tooling-rev 2>/dev/null | tr -d '[:space:]')

ifeq ($(TOOLING_REV),)
$(error missing .tooling-rev — this repo pins the shared tooling by commit sha)
endif
ifneq ($(TOOLING_REV),$(TOOLING_HAVE))
TOOLING_SYNC := $(shell bash scripts/tooling-sync.sh >&2 && echo ok)
ifneq ($(TOOLING_SYNC),ok)
$(error shared tooling could not be synced — see the [tooling] lines above)
endif
endif

# The include brings targets with it, and the first target in a makefile is the
# default goal. Name the goal explicitly so `make` with no arguments still
# prints help rather than cutting a worktree.
.DEFAULT_GOAL := help

include $(TOOLING)/mk/common.mk

# --- end shared tooling ------------------------------------------------------

include $(TOOLING)/mk/node.mk

# The wire this shell speaks to `yeaboi app`, and the route manifest yeaboi's
# surface-parity suite reads, both come from the yeaboi repo as a vendored
# snapshot pinned by sha in `.contracts-rev`. Never edit anything under
# contracts/ here — `make contracts-check` fails if you do.
CONTRACTS_REPO  := https://github.com/yeaboi-ai/yeaboi.ai.git
CONTRACTS_DIR   := .
CONTRACTS_PATHS := contracts/v1

.PHONY: help check-manifest gen-manifest icons build-check bundle pack dist clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# Everything the devkit plugin calls — lint, format, format-check, typecheck,
# test, test-fast, test-scoped, build — comes from mk/node.mk above and maps
# onto the npm scripts. Nothing is overridden here: an override of a target that
# already has a recipe makes `make` warn, and the warning is right.
#
# `npm run lint` is `npm run typecheck`. There is no ESLint in this tree and
# never was; with strict TypeScript on, `tsc --noEmit` is what actually rejects
# code, so that is what the target honestly runs.

gen-manifest: ## Regenerate contracts/v1/routes_manifest.json from the renderer's registries
	$(NPM) run gen-manifest
	@echo "✓ the manifest is a CONTRACT — commit it in yeaboi, then 'make contracts-sync' here"

check-manifest: ## Assert the renderer's registries still produce the vendored manifest
	$(NPM) run check-manifest

# --- brand assets ------------------------------------------------------------
#
# Rendered from the website's master duck art, committed here, and asserted by
# test/icons.test.ts without Pillow. Not a build step: CI never re-renders them,
# and `--check` asserts structure rather than bytes so a Pillow upgrade that
# re-encodes a PNG cannot redden an unrelated PR.
#
# `uv run --with` needs only uv — there is no Python environment in this repo
# and this target must not create one. matplotlib is there for one font file
# (DejaVu), which is why nothing has to be committed or installed.
icons: ## Re-render the committed icon set from the yeaboi-site duck art (needs uv)
	uv run --with pillow --with matplotlib --no-project python scripts/gen_desktop_icons.py

# --- packaging (electron-builder) --------------------------------------------
#
# What ships is an application around a RELEASED wheel, not around any working
# tree: `bundle` installs yeaboi==VERSION from PyPI into a pinned
# python-build-standalone runtime, and electron-builder wraps that. There is no
# default — this repo has no version line of its own, and the app's version is
# the version of the yeaboi it carries.
VERSION ?=

_require-version:
	@test -n "$(VERSION)" || { echo "VERSION=X.Y.Z is required — it must already be on PyPI"; exit 1; }

bundle: _require-version ## Stage the bundled Python for this platform (VERSION=X.Y.Z, must be on PyPI)
	@test -d node_modules || $(MAKE) install
	node scripts/fetch-python.mjs --version $(VERSION)

pack: ## Unsigned local package into dist/ (a smoke test, not a release)
	@test -d resources/py || { echo "no staged runtime — run: make bundle VERSION=X.Y.Z"; exit 1; }
	$(MAKE) build
	CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --publish never

dist: ## Signed installers into dist/ — needs the signing env vars (release.yml does this)
	$(MAKE) build
	npx electron-builder --publish never

# `npm run build` exits 0 on an unresolved `url()` — the asset is left to be
# "resolved at runtime", where nothing resolves it. That is how a design package
# missing its fonts reached this app as a silent fallback to the system stack.
build-check: ## Build, and fail on the warnings a build is allowed to survive
	$(NPM) run build:check

clean: ## Remove build output and the staged runtime
	rm -rf out dist resources/py

# node.mk already makes this `lint format-check test build`. Adding prerequisites
# WITHOUT a recipe extends that list rather than replacing it — an override of a
# target that already has a recipe makes `make` warn, and the warning is right.
ship-gate: contracts-check tooling-check check-manifest build-check
