# --- shared tooling (yeaboi-tooling, pinned by .tooling-rev) ------------------
#
# Copied verbatim from the tooling repo's bootstrap/Makefile.head. It clones the
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
include $(TOOLING)/mk/node.mk

# --- end shared tooling ------------------------------------------------------

# What this repo does NOT vendor. The routes manifest under contracts/ is
# GENERATED here, from the renderer's own registry — desktop is the producer of
# that contract, not a consumer of it, so there is no .contracts-rev and no
# CONTRACTS_* block. Vendoring it back would put the generator and a snapshot in
# charge of the same file, and contracts-check would go red every time a route
# moved here before yeaboi.ai caught up.

.PHONY: help dev icons pack dist clean check-manifest gen-manifest build-check

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# install, lint, format, format-check, typecheck, test, test-fast, test-scoped,
# build and ship-gate all come from mk/node.mk above and map onto the npm
# scripts. Nothing is overridden here: an override of a target that already has
# a recipe makes `make` warn, and the warning is right.
#
# `npm run lint` is `npm run typecheck` — there is no ESLint in this tree, and
# with strict TypeScript on, `tsc --noEmit` is what actually rejects code.

# The backend is the planning-platform FastAPI stack, run from that repo:
#   cd ../planning-platform && docker compose up -d && make db-migrate && make dev-backend
dev: ## Run the app with HMR (needs the planning-platform backend on :8000)
	bash scripts/dev-preflight.sh
	$(NPM) run dev

# Rendered from the website's master duck art, committed here, and asserted by
# test/icons.test.ts without Pillow. `uv run --with` needs only uv — there is
# no Python environment in this repo and this target must not create one.
icons: ## Re-render the committed icon set from the yeaboi-site duck art (needs uv)
	uv run --with pillow --with matplotlib --no-project python scripts/gen_desktop_icons.py

sprites: ## Re-render the onboarding lifecycle sprites from the yeaboi-site duck art (needs uv)
	uv run --with pillow --no-project python scripts/gen_lifecycle_sprites.py

mascots: ## Re-render the robo and the two door kits from the vendored pixel duck (needs uv)
	uv run --with pillow --no-project python scripts/gen_mascot_sprites.py

pack: ## Unsigned local package into dist/ (a smoke test, not a release)
	$(MAKE) build
	CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --publish never

dist: ## Signed installers into dist/ — needs the signing env vars
	$(MAKE) build
	npx electron-builder --publish never

clean: ## Remove build output
	rm -rf out dist

# --- gates ------------------------------------------------------------------
#
# Both already run in CI; naming them here is what lets /ship and the Stop hook
# reach them through the one target every repo shares.

gen-manifest: ## Re-render contracts/v1/routes_manifest.json from the renderer's route registry
	$(NPM) run gen-manifest

check-manifest: ## Assert the committed routes manifest matches the renderer's registry
	$(NPM) run gen-manifest -- --check

build-check: build ## Turn an unresolved asset reference (a warning the build survives) into a failure
	$(NPM) run build:check

# node.mk already makes this `lint format-check test build`. Adding prerequisites
# WITHOUT a recipe extends that list rather than replacing it.
ship-gate: check-manifest build-check tooling-check
