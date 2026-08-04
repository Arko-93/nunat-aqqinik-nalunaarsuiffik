# Nunat Marine POC

Kalaallisut-first **private trip notebook** for the Uummannaq–Qaarsut corridor.

## Safety boundary

This is a local-knowledge and trip-recording companion. It is **not** an official nautical chart, chartplotter, VHF, AIS, PLB/EPIRB, or emergency service.

No GST chart/ENC content is included. Bathymetry is labelled context-only / not for navigation.

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
- Real phone GPS: HTTPS required. From this Mac:

```sh
bash scripts/marine-https-tunnel.sh
```

Open the printed `https://*.trycloudflare.com` URL on the phone, allow location, then **Download** the corridor before opening the map.

## Corridor package

Built into `public/packages/uummannaq-qaarsut/`:

- `places.geojson` — repository place release clip
- `land.geojson` — Natural Earth 10m land clip (PMTiles when tippecanoe is available)
- `style.json` + `manifest.json` with per-file SHA-256

## Native tracking

Web/PWA records **foreground only**. Locked-screen recording requires the Capacitor `BackgroundLocation` plugin wired to `ios/` Core Location and `android/` foreground service stubs.
