.DEFAULT_GOAL := help

NPM := npm

.PHONY: help install dev build typecheck test icons pack dist clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	$(NPM) install

# The backend is the planning-platform FastAPI stack, run from that repo:
#   cd ../planning-platform && docker compose up -d && make db-migrate && make dev-backend
dev: ## Run the app with HMR (needs the planning-platform backend on :8000)
	$(NPM) run dev

build: ## Production build (electron-vite)
	$(NPM) run build

typecheck: ## tsc --noEmit
	$(NPM) run typecheck

test: ## Run the vitest suite
	$(NPM) run test

# Rendered from the website's master duck art, committed here, and asserted by
# test/icons.test.ts without Pillow. `uv run --with` needs only uv — there is
# no Python environment in this repo and this target must not create one.
icons: ## Re-render the committed icon set from the yeaboi-site duck art (needs uv)
	uv run --with pillow --with matplotlib --no-project python scripts/gen_desktop_icons.py

pack: ## Unsigned local package into dist/ (a smoke test, not a release)
	$(MAKE) build
	CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --publish never

dist: ## Signed installers into dist/ — needs the signing env vars
	$(MAKE) build
	npx electron-builder --publish never

clean: ## Remove build output
	rm -rf out dist
