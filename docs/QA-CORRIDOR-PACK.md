# Offline corridor pack — smoke QA (issue #22)

The full Qaarsut→Kullorsuaq pack serves land relief, ocean depth, coastline
mask and localities from OPFS with the network dead. Evidence below is from
the live app (dev server `:3460`, Chrome via browser-harness).

## Setup

1. `bash scripts/fetch-corridor-pack-assets.sh` (or
   `.venv/bin/python web/scripts/build-corridor-pack.py`).
2. `pnpm --dir web dev --port 3460`.
3. Open the app, click the Download area button (or let the installed pack
   auto-apply on reload — OPFS persists).

## Checkpoints

| Check | How | Result |
| --- | --- | --- |
| Pack installs and verifies | Download area shows "Ready offline" (+ `Pakke corridor_qaarsut_kullorsuaq_2026-08-06`) | Pass |
| Style switches to pack sources | `__nunatMap.getStyle().sources` — land-relief/ocean-depth-dem/ocean-depth-vector/coastline-land are `pmtiles:///packages/qaarsut-kullorsuaq/...`; `nunat:tile-serving: "opfs-pack"`; `terrain-ocean-hillshade` served from the pack raster | Pass |
| No live tile servers after install | The offline style contains no remote Mapterhorn/ocean tile URLs — MapLibre cannot request them | Pass (structural) |
| Offline serving | Kill the dev server (`pkill -f "vite.*3460"`), pan to Qaarsut z10: `querySourceFeatures('coastline-land')` → 9 mask features, `ocean-depth-vector` depare → 175, contours → 389; `queryRenderedFeatures({layers:['terrain-coastline-mask']})` → 1 | Pass |
| Renders terrain offline | Screenshot at Qaarsut z10 with server dead: 723 pixel samples of the mask land fill (~#e8e0cf), land hillshade tones present | Pass |
| Stub never claims terrain | Unit tests: kind=stub with terrain files listed → `isTerrainOfflineReady` false | Pass |
| Manifest honest | Unit tests parse the shipped manifest: kind=full, notes say "not for navigation", native 512 px land-relief documented | Pass |

## Known limits (documented in the manifest notes)

- Land relief is z0–z10 (native 512 px); z11+ overzooms. Pack cap is 300 MB.
- Ocean depth vector is z0–z11 (self-tiled IBCAO v5.2 + GEBCO_2026,
  clipped to the shared coastline); z12 renders overzoomed. The ocean
  hillshade raster (`ocean-depth-dem.pmtiles`, z0–z10) is in the pack
  again and served offline; z11+ overzooms.
- Tiles outside the corridor bbox are absent (no network fallback).

## Unit coverage

`pmtiles-protocol.test.ts` (pack-bound tiles served before any network),
`terrain-style.test.ts` (offline compose contract), `corridor-pack.test.ts`
(full-pack install/read/delete + subscribers), `manifest.test.ts` (shipped
manifest, stub-claiming-terrain rejection).
