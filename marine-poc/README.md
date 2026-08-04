# Nunat Marine POC

Kalaallisut-first **private trip notebook** for the Uummannaq–Qaarsut corridor.

## Safety boundary

This is a local-knowledge and trip-recording companion. It is **not** an official nautical chart, chartplotter, VHF, AIS, PLB/EPIRB, or emergency service.

No GST chart/ENC content is included. Bathymetry is labelled context-only / not for navigation.

## Basemap

When online, the map uses **OpenFreeMap Liberty** (same family as the main nunat web app) plus **Open Waters Seascape** hillshade and depth contours. Depth is context only.

When offline, the app falls back to the packaged flat GeoJSON style.

Personal trips and waypoints stay on-device (IndexedDB + CacheStorage). Sync is off.

## Stack

React 19 · TypeScript · Effect 4 beta · MapLibre · PMTiles protocol · Capacitor plugin bridge · Vitest

## POC capabilities

1. Download / verify / delete one offline corridor package (CacheStorage + checksums).
2. Show current location, accuracy circle (meters), speed and course.
3. Start / pause / stop trip recording (web foreground; native locked-screen stubbed).
4. Save a private waypoint with category + note.
5. Review trip health, export GPX/GeoJSON, permanently delete.

## Run locally

```sh
pnpm install
pnpm test
pnpm prepare:corridor   # needs .venv with pyshp+shapely; tippecanoe optional for PMTiles
pnpm dev
```

Open `http://127.0.0.1:5180` (demo GPS on HTTP). Use HTTPS for real GNSS.

## Deploy to Omarchy

```sh
make marine-omarchy
```

- HTTP (demo GPS only): `http://omarchy.tail189279.ts.net:3459`
- Real phone GPS: HTTPS required.

```sh
bash scripts/marine-https-tunnel.sh
```

Then open **https://marine.sikumut.gl** on the phone (keep the tunnel process running on this Mac).  
Allow location → **Download** → **Open map**.  
Do not use plain `http://omarchy…:3459` for GPS — browsers force a corridor simulator there.

## Greenland package

One downloadable package at `public/packages/greenland/`:

- `places.geojson` — localities + higher-importance geography (NunaGIS midpoints)
- `land.geojson` — OSM simplified land polygons (island-aware; NOT Natural Earth 10m)
- `water.geojson` — simplified OSM inland/coastal water
- `style.json` + `manifest.json` (SHA-256)

Build validates that every town/village sits on/near the land fill.

```sh
# once: .venv with pyshp + shapely + pyproj
python3 -m venv .venv && .venv/bin/pip install -r requirements-prepare.txt
pnpm prepare:regions
```

Catalog: `public/packages/catalog.json`.

## Native tracking

Web/PWA records **foreground only**. Locked-screen recording requires the Capacitor `BackgroundLocation` plugin wired to `ios/` Core Location and `android/` foreground service stubs.
