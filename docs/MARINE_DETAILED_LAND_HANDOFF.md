# Handoff: Detailed Greenland land map (continue locally)

Branch: `cursor/cloud-agent-1785877052219-wl3u6` (pushed to origin, HEAD `26c2e96`)

Cloud VM kept dying during the ~900 MB land download / full coastline rebuild. **Builder code is saved. Package artefacts are still the old simplified land.** Continue on a local Mac with disk + tippecanoe.

## What is already done (on the branch)

1. [`marine-poc/scripts/prepare-regions.py`](../marine-poc/scripts/prepare-regions.py)
   - Source: `land-polygons-split-4326` (full OSM coastline), not `simplified-land-polygons`
   - Light simplify only (`land_simplify_deg=0.00005`)
   - Multi-polygon features, STRtree locality check
   - Memory-bounded ocean bands
   - `try_build_pmtiles()` → `land.pmtiles` when tippecanoe exists
   - Style/manifest support for PMTiles + `routingFile: land.geojson`
2. [`marine-poc/src/map/MarineMap.tsx`](../marine-poc/src/map/MarineMap.tsx)
   - Probes `land.pmtiles`, rewrites `pmtiles://` URLs, fallback style prefers PMTiles
3. README note for full coastline + PMTiles
4. Earlier marine routing/UX work also on this branch (shore snap, edge-safe A*, locate FAB, etc.)

## What is NOT done

[`marine-poc/public/packages/greenland/`](../marine-poc/public/packages/greenland/) still has:

- `land.geojson` ~2.7 MB, **1 feature**, GeometryCollection
- Manifest source still says **“simplified land polygons”**
- **No `land.pmtiles`**
- Style still points at geojson land

So the map/router still use the crude coastline until you rebuild.

## Local continue prompt (copy into Cursor)

```
Continue the Detailed Greenland land map on branch cursor/cloud-agent-1785877052219-wl3u6.

Context: builder code is already committed (HEAD ~26c2e96). Cloud VM failed during package rebuild. public/packages/greenland/land.geojson is STILL the old simplified coastline (~2.7MB, GeometryCollection, no land.pmtiles). Do not rewrite prepare-regions.py from scratch — read it first.

Goal (from plan detailed_greenland_land):
- Full OSM coastline land for offline fill + boat routing
- Online Liberty + Seascape unchanged
- Not for navigation / no ENC / no Garmin charts this pass

Do this:

1. Checkout branch cursor/cloud-agent-1785877052219-wl3u6 and pull.
2. Install tools:
   - tippecanoe (brew install tippecanoe)
   - marine-poc/.venv with requirements-prepare.txt (pyshp, shapely, pyproj)
   - optional: gdal/ogr2ogr for faster spat clip
3. Download raw land if missing (~883 MB):
   https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip
   → marine-poc/data/raw/ and unpack to land-polygons-split-4326/land_polygons.shp
   Also Geofabrik greenland-latest-free.shp.zip for water if missing.
4. SPEED: prefer ogr2ogr -spat -75 59.5 -10 84 to clip Greenland first, then feed prepare-regions (or let prepare-regions scan; expect long runtime / high RAM on ocean bands).
5. Run: cd marine-poc && pnpm prepare:regions
   Success criteria after rebuild:
   - manifest land source contains "full coastline"
   - land.geojson has many Polygon features (not one GeometryCollection)
   - land.pmtiles exists and is listed in manifest/files
   - style.json land source is vector pmtiles://land.pmtiles when tippecanoe worked
   - localities still pass on-land check
6. Commit rebuilt package artefacts (land.geojson, land.pmtiles, style.json, manifest.json, ocean-bands, water if changed).
7. Run:
   pnpm exec vitest run src/routing/qaarsut-diag.test.ts src/routing/boat-route-responsive.test.ts src/routing/boat-route.test.ts src/routing/locality-routes.test.ts
   Denser land may need slightly higher route budgets — fix only if tests fail.
8. Visual check: Uummannaq / Qaarsut / Disko islands present; towns not floating in sea fill.
9. Deploy only after water package looks right: make marine-omarchy

Constraints from AGENTS.md / STATUS.md:
- Companion only, not navigation
- Do not invent place IDs or “fix” midpoints with guessed coords
- Keep App.tsx loading land.geojson for prepareBoatRouter (routing mask)

Out of scope: Danish/Asiaq ENC, Garmin BlueChart, soundings/buoys as nav aids.
```

## Why cloud struggled

- Full land zip ~900 MB + 1.3 GB shapefile scan
- Ocean-band buffering on detailed coast is RAM-heavy (partially mitigated in code)
- Parent exec pod died mid-run; child agents finished code fixes but not a committed full package rebuild

Local Mac with tippecanoe + enough disk is the right place to finish the rebuild.
