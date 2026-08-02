# Repository convenience targets

SHELL := /bin/bash

.PHONY: preview-assemble map-fetch map-build map-omarchy preview-omarchy api-install api-typecheck api-test api-dev

map-fetch:
	bash scripts/sync-web-release.sh
	pnpm --dir web fetch:placenames

map-build: map-fetch
	pnpm --dir web install
	pnpm --dir web build

# Omarchy test surface (deploy from current worktree/branch; do not merge)
map-omarchy:
	pnpm --dir web install
	bash scripts/sync-web-release.sh
	pnpm --dir web fetch:placenames
	pnpm --dir web build
	bash scripts/deploy-omarchy-preview.sh

# Alias kept for existing muscle memory
preview-omarchy: map-omarchy

# Legacy static assemble (data ops only; not deployed to :3457)
preview-assemble:
	@if [ ! -f data/dist/manifest.json ]; then \
		$(MAKE) -C data; \
	fi
	python3 data/scripts/assemble_preview.py

api-install:
	pnpm --dir api install

api-typecheck:
	pnpm --dir api typecheck

api-test:
	pnpm --dir api test

api-dev: api-install
	pnpm --dir api dev
