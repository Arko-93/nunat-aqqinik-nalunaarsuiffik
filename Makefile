# Repository convenience targets

SHELL := /bin/bash

.PHONY: preview-assemble map-fetch map-build map-omarchy preview-omarchy

map-fetch:
	pnpm --dir web fetch:placenames

map-build: map-fetch
	pnpm --dir web install
	pnpm --dir web build

# Primary Omarchy product surface: official names map
map-omarchy:
	pnpm --dir web install
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
