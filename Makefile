# Repository convenience targets

SHELL := /bin/bash

.PHONY: preview-assemble map-fetch map-build map-omarchy preview-omarchy api-install api-typecheck api-test api-dev marine-install marine-test marine-fetch-land-assets marine-publish-land-assets marine-build marine-omarchy web-fetch-coastline-mask web-publish-coastline-mask

map-fetch:
	bash scripts/sync-web-release.sh
	pnpm --dir web fetch:placenames

map-build: map-fetch
	pnpm --dir web install
	bash scripts/fetch-coastline-mask-assets.sh
	pnpm --dir web build

# Omarchy test surface (deploy from current worktree/branch; do not merge)
map-omarchy:
	pnpm --dir web install
	bash scripts/sync-web-release.sh
	pnpm --dir web fetch:placenames
	bash scripts/fetch-coastline-mask-assets.sh
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

marine-install:
	pnpm --dir marine-poc install

marine-test: marine-install
	pnpm --dir marine-poc test

# Fat land.geojson / land.pmtiles stay local (gitignored). Fetch or prepare:regions.
marine-fetch-land-assets:
	bash scripts/fetch-marine-land-assets.sh

marine-publish-land-assets: marine-fetch-land-assets
	bash scripts/publish-marine-land-assets.sh

# Complete OSM coastline land mask for the web map. land.pmtiles stays local
# (gitignored). Fetch or build-coastline-mask.py.
web-fetch-coastline-mask:
	bash scripts/fetch-coastline-mask-assets.sh

web-publish-coastline-mask: web-fetch-coastline-mask
	bash scripts/publish-coastline-mask-assets.sh

marine-build: marine-install marine-fetch-land-assets
	pnpm --dir marine-poc build

# Omarchy marine POC on :3459 (does not replace place-names map on :3457)
marine-omarchy: marine-build
	bash scripts/deploy-omarchy-marine.sh
