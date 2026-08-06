# Agent instructions for nunat-aqqinik-nalunaarsuiffik

## Product lens

We build operational decision systems for public organisations working across fragmented data, limited capacity and difficult geography.

This repository provides Greenland's place identity layer and composable Decision Geography extensions. Place identity is the stable core; reachability is the first operational extension.

Read `docs/STATUS.md` before changing the data contract. It is the source of truth for product scope, architecture, validation gates, implementation phases, and current status.

## Dataset principles

- **Authoritative source first** — Nunat Aqqinik Aalajangiisartut at Oqaasileriffik is the authority for official place-name decisions. Asiaq is a geodata/base-map custodian and may be authoritative for distributed geometry, not for the naming decision itself. Never modify an assertion without a source authoritative for that field.
- **Preserve all official spellings** — Greenlandic orthography (1973 reform) is canonical. Danish exonyms are secondary.
- **Permanent identity** — Never derive an `id` from a name, slug, municipality, or other mutable attribute. Existing `plc_<uuid>` and `con_<uuid>` identifiers never change.
- **One record per place** — A place can have multiple names but exactly one canonical Greenlandic name.
- **Composable extensions** — Operational datasets reference permanent place IDs. Do not copy place records into extension sources.
- **Structural reachability only** — Connections describe maintained transport relationships, not live departures or booking availability.
- **Shared coastline** — The V1 interim land/sea boundary is the complete OSM coastline land polygon surface (ODbL) unioned with Mapterhorn DEM land (elevation > ~1 m in a z12 coastal band, CC BY 4.0): the mask matches the land hillshade by construction, so no ocean layer can paint where the DEM renders land (issue #19). It drives the display mask above all ocean layers and is the reference shoreline for future bathymetry clipping. Asiaq may replace both when authoritative distributable geometry arrives. Clipping depth bands before tile generation is future IBCAO/GEBCO tiling work — the V1 fix is the display mask only. Never use Natural Earth or partial landuse/landcover fills as the mask, and never let ocean layers paint above it.
- **Slow, careful updates** — Batch updates and preserve validity periods. Never patch an assertion without a paper trail.

## Canonical source files

All source files live under `data/source/` as newline-delimited JSON:

| File | ID prefix | Contents |
| --- | --- | --- |
| `places.ndjson` | `plc_` | Durable place identity |
| `place-classifications.ndjson` | `cls_` | Time-bounded feature classification assertions |
| `place-names.ndjson` | `nam_` | Name assertions (official, exonym, historical, alias) |
| `place-geometries.ndjson` | `geo_` | Point geometry assertions (GeoJSON) |
| `administrative-areas.ndjson` | `adm_` | Administrative area definitions |
| `administrative-memberships.ndjson` | `mem_` | Time-bounded area membership assertions |
| `external-identifiers.ndjson` | `xid_` | Upstream authority identifiers |
| `connections.ndjson` | `con_` | Durable structural transport edges |
| `connection-services.ndjson` | `svc_` | Time-bounded service assertions on connections |
| `sources.ndjson` | `src_` | Provenance registry |

JSON Schemas (Draft 2020-12) live under `data/schema/` — one file per record type.

## Build

```sh
make -C data        # validate + build distributions
make -C data test   # fixtures + reproducible build/distribution/SQLite checks
```

## How to add or update an assertion

1. Add a traceable source to `data/source/sources.ndjson` if it's new.
2. Add or update the assertion in the relevant canonical source file.
3. Preserve existing permanent IDs (place, connection, area).
4. Set validity dates when a relationship or attribute changes.
5. Run `make -C data` and fix any validation failures.
6. Commit both source changes and rebuilt distributions.

For Phase 2, use `data/reconciliation/README.md`. The Oqaasileriffik side uses
the public NunaGIS PlacenamesRegister (`make -C data fetch-nunagis
normalize-nunagis reconcile`). Asiaq geometry still needs a separate export.
Exact-name candidates are not verified matches.

## Testing

```sh
make -C data validate       # Schema, IDs, FKs, temporal, semantic checks
make -C data test           # validate + regression fixtures
make -C data publish-check  # test + block pending provenance
```

Validation checks IDs, uniqueness, coordinates, source references, connection endpoints, temporal validity, seasonality, and other invariants.

Do not commit changes that fail `test`.
