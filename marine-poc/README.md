# Nunat Marine POC

Kalaallisut-first **private trip notebook** for the Uummannaq–Qaarsut corridor.

## Safety boundary

This is a local-knowledge and trip-recording companion. It is **not** an official nautical chart, chartplotter, VHF, AIS, PLB/EPIRB, or emergency service.

No GST chart/ENC content is included. Bathymetry is labelled context-only / not for navigation.

Personal trips and waypoints stay on-device (IndexedDB in the web POC). Sync is off.

## Stack

React 19 · TypeScript · Effect 4 beta · MapLibre · Capacitor shell stubs · Vitest

## Run locally

```sh
pnpm install
pnpm test
pnpm dev
```

Open `http://127.0.0.1:5180`.

## Deploy to Omarchy

```sh
make marine-omarchy
```

Serves on Tailscale port **3459** (place-names map stays on **3457**).

## Native tracking

Web/PWA records **foreground only**. Locked-screen recording requires the custom native plugin stubs under `ios/` and `android/` — standard Capacitor Geolocation is insufficient.
