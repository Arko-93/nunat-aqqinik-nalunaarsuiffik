# Repository convenience targets

SHELL := /bin/bash

.PHONY: preview-assemble map-fetch map-build map-omarchy preview-omarchy api-install api-typecheck api-test api-dev api-generate-client marine-install marine-test marine-fetch-land-assets marine-publish-land-assets marine-build marine-omarchy web-fetch-coastline-mask web-publish-coastline-mask web-fetch-ocean-depth web-publish-ocean-depth web-fetch-land-peaks web-publish-land-peaks web-fetch-corridor-pack web-publish-corridor-pack

map-fetch:
	bash scripts/sync-web-release.sh

map-build: map-fetch
	pnpm --dir web install
	bash scripts/fetch-coastline-mask-assets.sh
	bash scripts/fetch-ocean-depth-assets.sh
	pnpm --dir web build

# Omarchy test surface (deploy from current worktree/branch; do not merge)
map-omarchy:
	pnpm --dir web install
	bash scripts/sync-web-release.sh
	bash scripts/fetch-coastline-mask-assets.sh
	bash scripts/fetch-ocean-depth-assets.sh
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

api-generate-client: api-install
	pnpm --dir api generate:client

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

# Self-tiled IBCAO/GEBCO ocean depth (issue #23). PMTiles stay local
# (gitignored). Fetch or build-ocean-depth.py.
web-fetch-ocean-depth:
	bash scripts/fetch-ocean-depth-assets.sh

web-publish-ocean-depth: web-fetch-ocean-depth
	bash scripts/publish-ocean-depth-assets.sh

# Peaks-only land color bands (issue #24). PMTiles stay local
# (gitignored). Fetch or build-land-peaks.py.
web-fetch-land-peaks:
	bash scripts/fetch-land-peaks-assets.sh

web-publish-land-peaks: web-fetch-land-peaks
	bash scripts/publish-land-peaks-assets.sh

# Full Qaarsut→Kullorsuaq corridor offline pack. PMTiles stay local
# (gitignored). Fetch or build-corridor-pack.py.
web-fetch-corridor-pack:
	bash scripts/fetch-corridor-pack-assets.sh

web-publish-corridor-pack: web-fetch-corridor-pack
	bash scripts/publish-corridor-pack-assets.sh

marine-build: marine-install marine-fetch-land-assets
	pnpm --dir marine-poc build

# Omarchy marine POC on :3459 (does not replace place-names map on :3457)
marine-omarchy: marine-build
	bash scripts/deploy-omarchy-marine.sh
