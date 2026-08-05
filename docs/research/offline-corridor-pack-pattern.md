# Research: Offline corridor pack pattern (Qaarsut→Kullorsuaq)

**Ticket:** [#6](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/6) · Map: [#3](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/3)  
**Question:** What concrete offline pattern should we use for one downloadable Qaarsut→Kullorsuaq corridor pack (Google Maps–like “download area”), including tile format, storage estimate, update story, and browser constraints for family dogfood devices?  
**Date:** 2026-08-05

## Recommendation (one-liner)

Ship one **versioned PMTiles corridor pack** (land DEM + ocean meter-bands + localities), store large archives in **OPFS** with a range-capable `pmtiles.Source`, use a **Service Worker only for the app shell + small assets**, and drive install/update/delete with an explicit **Download area** UX plus `navigator.storage.persist()` and **Add to Home Screen** on iOS.

## Recommended pattern

### Package shape

One downloadable region under a stable slug, versioned by pack id (same idea as the marine POC corridor/manifest pattern):[^marine-readme][^marine-cache]

```text
packages/qaarsut-kullorsuaq/
  manifest.json          # id, bbox, bytes, per-file sha256, createdAt
  style.json             # MapLibre style; local sprite/glyph URLs
  land-relief.pmtiles    # raster-dem (Terrarium) for hillshade / 3D
  ocean-depth.pmtiles    # vector meter-band polygons (preferred) or raster bands
  localities.geojson     # corridor towns/settlements (or tiny vector PMTiles)
  sprites/ + glyphs/     # offline labels/icons (not fetched from CDN)
```

Suggested planning bbox (coastal strip, refine later):

`[-58.5, 70.4, -50.5, 74.9]` — Qaarsut / Uummannaq north through Upernavik to Kullorsuaq.

Do **not** treat Cache Storage alone as the pack store. Product language already rejects “browser-cache-only” for this pack.[^context]

### Tile format

| Layer | Format | Why |
|---|---|---|
| Land relief | **PMTiles** `raster-dem`, `"encoding": "terrarium"` | Protomaps documents Terrarium DEM sources for MapLibre; PMTiles is the distribution unit.[^pmtiles-maplibre][^mapterhorn] |
| Ocean depth | **PMTiles** vector (meter bands) first | Smaller than raster bathymetry for banded UI; matches “meter bands” product language.[^context] |
| Localities | GeoJSON (or small vector PMTiles) | Sparse point data; marine POC uses GeoJSON + SHA-256 verify.[^marine-manifest] |
| Coast/land fill (optional) | Vector PMTiles | Marine POC already builds `land.pmtiles` via tippecanoe.[^handoff] |

**Client wiring (online or offline):**

1. Register once: `maplibregl.addProtocol("pmtiles", protocol.tile)` from the official `pmtiles` JS library.[^pmtiles-maplibre]
2. Online nationwide tiles: `pmtiles://https://…/….pmtiles` with HTTP Range Requests.[^pmtiles-concepts]
3. Offline pack: register each local archive with a **custom `Source`** (or `FileAPISource` / OPFS-backed range reader) via `protocol.add(pmtilesInstance)` so MapLibre does not depend on network Range Requests against a Service Worker.[^pmtiles-discussion][^opfs]

Build corridor extracts from larger archives with:

```sh
pmtiles extract INPUT.pmtiles OUTPUT.pmtiles --bbox=MIN_LON,MIN_LAT,MAX_LON,MAX_LAT
# optional: --maxzoom=N
```

Source archive must be clustered; extract is the supported corridor-cut tool.[^pmtiles-cli][^mapterhorn]

PMTiles archives are **read-only**; in-place tile updates are not supported — replace the whole file.[^pmtiles-concepts]

### Storage roles (split by job)

| Store | Holds | Role |
|---|---|---|
| **OPFS** (`navigator.storage.getDirectory()`) | `*.pmtiles` (large binaries) | Primary pack body; byte-range reads; subject to origin quota.[^opfs][^mdn-quota] |
| **Cache API** | App shell, `style.json`, sprites, glyphs, small GeoJSON | Classic PWA offline shell; also used by marine POC for package files today.[^webdev-storage][^marine-cache] |
| **IndexedDB** | Install metadata only (pack id, installedAt, verify status) | Not tile blobs.[^webdev-storage] |
| **Service Worker** | Intercept app navigation + shell assets | Offline app boot; not the DEM Range proxy.[^mdn-sw] |

After a successful user-initiated download, call `navigator.storage.persist()` so Chromium/Firefox are less likely to evict under storage pressure.[^webdev-persist][^mdn-quota]

### UX steps (Google Maps–like “download area”)

Mirror the metaphor, not Google’s native APIs:

1. **Show the corridor** on the map (outline / dim outside bbox).
2. **Download for offline** — name, estimated size, zoom depth (e.g. relief to z11–12).
3. **Progress** — bytes loaded / `manifest.bytes` (marine POC already streams per-file progress).[^marine-cache]
4. **Verify** — SHA-256 per file; refuse to mark Ready on mismatch.[^marine-cache]
5. **Protect** — request persistent storage in the same gesture; on iOS Safari, prompt **Add to Home Screen** (see constraints).
6. **Ready offline** — status chip; Open map uses local sources only.
7. **Manage** — Update available / Delete / storage used (`navigator.storage.estimate()`).[^mdn-quota]

### Update story

1. Publish a new immutable pack id (e.g. `corridor_qaarsut_kullorsuaq_YYYY-MM-DD`).
2. Host `catalog.json` with `bytes`, bbox, and current id (marine POC pattern).[^marine-readme]
3. Online client compares installed id → shows **Update** with delta size ≈ full pack size (no in-place PMTiles patch).[^pmtiles-concepts]
4. Download into a temp OPFS directory → verify → atomic activate → delete previous.
5. App shell updates via normal Service Worker lifecycle (`install` / waiting / `activate`).[^mdn-sw]

## Rough size estimate (corridor)

Anchors from this repo’s whole-Greenland marine package (vector land only, no DEM):[^marine-manifest]

| File | Bytes |
|---|---|
| `land.pmtiles` (full Greenland) | ~62 MB |
| Package total (land GeoJSON + PMTiles + places + water + bands) | ~138 MB |
| Tiny Uummannaq–Qaarsut pilot (flat GeoJSON, no DEM) | ~87 KB |

Planning budget for **Qaarsut→Kullorsuaq** with land relief + ocean bands + localities:

| Component | Rough MB | Notes |
|---|---|---|
| Land DEM PMTiles (Terrarium, maxzoom ~11–12) | **40–120** | Dominant cost; raster-dem tiles are heavy; cut with `pmtiles extract --maxzoom`.[^mapterhorn][^pmtiles-cli] |
| Ocean meter-band vector PMTiles | **2–15** | Prefer bands over full raster bathymetry for v1. |
| Coast/land vector (optional) | **5–15** | Scale of full-GL 62 MB land tiles, coastal strip only. |
| Localities + style + sprites/glyphs | **1–5** | |
| **Dogfood target** | **80–180 MB** | Comfortable on modern phones over Wi‑Fi. |
| **Hard cap** | **≤250 MB** | If over: drop DEM maxzoom by 1, then drop optional coast PMTiles. |

Measure after the first real extract; do not treat this table as a release gate without a weighed artefact.

## Browser constraints (family dogfood)

| Constraint | Source | Product implication |
|---|---|---|
| Script-writable storage (Cache, IndexedDB, SW) can be deleted after **7 days of Safari use without interaction** | WebKit ITP blog[^webkit-7day] | Require **Add to Home Screen** for iPhone/iPad dogfood; Home Screen apps are not under that Safari counter.[^webkit-7day] |
| Default storage is **best-effort**; LRU eviction under pressure | MDN / web.dev[^mdn-quota][^webdev-storage] | Call `persist()` after Download; show storage used. |
| Persistent permission UX differs (Firefox prompts; Chromium heuristics; Safari often silent) | web.dev Persistent storage[^webdev-persist] | Do not rely on persist alone on iOS — combine with Home Screen. |
| OPFS / SW need **secure contexts** (HTTPS) | MDN OPFS + Service Worker[^opfs][^mdn-sw] | Dogfood only on HTTPS (marine POC already documents this for GPS).[^marine-readme] |
| Origin quotas are large (~60% disk Chromium/Safari browser apps) | MDN[^mdn-quota] | Quota is rarely the limiter; pack size + cellular download are. |
| Private / Incognito storage is temporary | MDN[^mdn-quota] | Warn: downloads will not survive the session. |
| Opaque cross-origin Cache entries can inflate reported quota (Chrome ~7 MB pad) | Chrome PWA docs[^chrome-opaque] | Prefer **same-origin** hosted pack files; do not Cache CDN DEM tiles. |
| PMTiles needs **range reads**; SW + full-file Cache is a poor Range proxy | Protomaps concepts + maintainer guidance[^pmtiles-concepts][^pmtiles-discussion] | OPFS-backed Source for offline DEM/vector archives. |

## Risks

1. **iOS Safari eviction** if the family only opens the site in Safari tabs — mitigate with Home Screen install copy.
2. **DEM size blow-up** if maxzoom is set like a street basemap — cap relief zoom; re-extract.
3. **Range + Cache mismatch** if we copy marine POC CacheStorage wholesale for 100+ MB DEM — works for small packs, fails UX/perf for terrain; move large files to OPFS.
4. **Update = full re-download** (immutable PMTiles) — set expectations in UX; Wi‑Fi recommended.
5. **Safety copy** must ship in pack warnings — open-grid depth is not chart-grade navigation (map #3 scope).

## Repo reference (read-only)

- Marine POC install/verify/delete via CacheStorage: `marine-poc/src/packages/package-cache.ts`
- Corridor/region builders: `marine-poc/scripts/prepare-corridor.py`, `prepare-regions.py`
- Handoff on PMTiles land artefacts: `docs/MARINE_DETAILED_LAND_HANDOFF.md`
- Product term: `CONTEXT.md` → Offline corridor pack

## Sources

[^pmtiles-concepts]: Protomaps Docs — [PMTiles Concepts](https://docs.protomaps.com/pmtiles/) (single-file archive, HTTP Range Requests, read-only / no in-place update, v3).
[^pmtiles-maplibre]: Protomaps Docs — [PMTiles for MapLibre GL](https://docs.protomaps.com/pmtiles/maplibre) (`Protocol`, `addProtocol`, vector / raster / `raster-dem` + Terrarium encoding).
[^pmtiles-cli]: Protomaps Docs — [pmtiles CLI](https://docs.protomaps.com/pmtiles/cli) (`extract --bbox` / `--maxzoom`, clustered source required).
[^mapterhorn]: Protomaps Blog — [Mapterhorn - Terrain for Web Mapping](https://protomaps.com/blog/mapterhorn-terrain/) (Terrarium tiles, PMTiles distribution, `pmtiles extract` corridor example).
[^pmtiles-discussion]: Protomaps/PMTiles Discussion [#594](https://github.com/protomaps/PMTiles/discussions/594) (maintainer: prefer filesystem + custom `Source` for offline/local persistent storage).
[^opfs]: MDN — [Origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) (`navigator.storage.getDirectory()`, SyncAccessHandle range read/write, quota-bound).
[^mdn-quota]: MDN — [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) (best-effort vs persistent, Chromium/Firefox/Safari quotas, LRU eviction, `estimate()`).
[^webdev-storage]: web.dev — [Storage for the web](https://web.dev/articles/storage-for-the-web) (Cache for network resources, OPFS for file-based content, IndexedDB for other data).
[^webdev-persist]: web.dev — [Persistent storage](https://web.dev/articles/persistent-storage) (`navigator.storage.persist()`, when to request, what is protected).
[^webkit-7day]: WebKit Blog — [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/13946/full-third-party-cookie-blocking-and-more/) (7-day cap on script-writable storage; Home Screen apps exempt from Safari’s counter).
[^mdn-sw]: MDN — [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) (offline proxy, secure context, install/activate lifecycle).
[^chrome-opaque]: Chrome Developers — [Debug Progressive Web Apps](https://developer.chrome.com/docs/devtools/progressive-web-apps) (opaque cached responses and quota padding).
[^context]: Repo — `CONTEXT.md` (Offline corridor pack: one downloadable region; avoid full Greenland offline and browser-cache-only).
[^marine-readme]: Repo — `marine-poc/README.md` (CacheStorage + checksum package UX; HTTPS for real devices).
[^marine-cache]: Repo — `marine-poc/src/packages/package-cache.ts` (install/progress/verify/delete via Cache API).
[^marine-manifest]: Repo — `marine-poc/public/packages/greenland/manifest.json` (byte sizes for land.pmtiles and total package).
[^handoff]: Repo — `docs/MARINE_DETAILED_LAND_HANDOFF.md` (tippecanoe → `land.pmtiles`, style `pmtiles://` URLs).
