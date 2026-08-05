# Coastline-mask regression fixtures (Qaarsut, Naajaat)

Deterministic geometry fixtures for the shared-coastline contract (issue #16).
Committed; regenerate with:

```sh
.venv/bin/python web/scripts/capture-coastline-fixtures.py \
    --land <osm-coastline-land.geojson>
```

- Land fixtures: OSM coastline land polygons (full coastline, ODbL) —
  the exact shoreline the coastline mask is built from.
- Bathymetry fixtures: real Open Waters Seascape `depare` bands and
  `contours` from public vector tiles (z12 + z13 around each settlement),
  `https://tiles.openwaters.io/seascape/{z}/{x}/{y}.pbf`.
- Raw bands cross land (the defect); the regression test proves the
  shared-coastline clip removes every intersection.

Captured 2026-08-05:

```json
[
  {
    "area": "qaarsut",
    "land_features": 1,
    "bathymetry_features": 76,
    "depare_drval1": [
      0,
      1.8288,
      2,
      3.6576,
      5,
      5.4864,
      9.144,
      10,
      18.288,
      20,
      30,
      36.576,
      50,
      54.864,
      91.44,
      100,
      182.88,
      200,
      300,
      365.76
    ],
    "contour_depth_abs_m": [
      2,
      4,
      5,
      9,
      10,
      18,
      20,
      30,
      37,
      50,
      55,
      91,
      100,
      183,
      200,
      300,
      366
    ],
    "land_sha256": "623471cd130c7f692d67d57d375d45610cabd0c8acc5343e8148a6f92c624dcd",
    "bathymetry_sha256": "ee9052f84caa8073beb49d7791a4c3955c3bbe0ce3622011864a2e0887ada753"
  },
  {
    "area": "naajaat",
    "land_features": 4,
    "bathymetry_features": 170,
    "depare_drval1": [
      0,
      1.8288,
      2,
      3.6576,
      5,
      5.4864,
      9.144,
      10,
      18.288,
      20,
      30,
      36.576,
      50,
      54.864,
      91.44,
      100,
      182.88,
      200,
      300,
      365.76
    ],
    "contour_depth_abs_m": [
      2,
      4,
      5,
      9,
      10,
      18,
      20,
      30,
      37,
      50,
      55,
      91,
      100,
      183,
      200,
      300,
      366
    ],
    "land_sha256": "d3352127c9a5819c199554df1c533b043d6db662c45d1edded5a84bfd4ef5ff3",
    "bathymetry_sha256": "033971c81c5f841ded879e9578e019211855de824f436ef09b214737e19d3814"
  }
]
```
