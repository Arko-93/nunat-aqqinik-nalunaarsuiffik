# Implementation ledger

**Plan:** `docs/nunat-decision-geography-product-implementation-plan.md`  
**Working branch:** `feat/canonical-identity-e2e`  
**Baseline commit:** `707d01767c568d1cea0a609ae4bbcf9067fdf4d2`  
**Baseline date:** 2026-08-01  
**Phase:** 5 UI finished (quiet shell); ready to merge; Phase 3 still blocked on identity confirmation

## Phase 0 — Baseline

### Working tree

Clean on `main` at baseline; branch created with no discarded user changes.

### Commands and results

| Command | Result |
|---|---|
| `make -C data validate` | PASS — 100 records across 9 source files |
| `make -C data test` | PASS — fixtures + reconciliation + build integration |
| `make -C data publish-check` | FAIL (expected) — 94 errors, `src_legacy_seed` pending |
| `pnpm --dir web install --frozen-lockfile` | PASS |
| `pnpm --dir web typecheck` | PASS |
| `pnpm --dir web test` | PASS — 16 tests |
| `pnpm --dir web build` | PASS |

### Record counts (canonical source)

| File | Count |
|---|---|
| places | 15 |
| place-classifications | 15 |
| place-names | 28 |
| place-geometries | 15 |
| administrative-areas | 5 |
| administrative-memberships | 15 |
| external-identifiers | 0 |
| connections | 3 lines (2 edges + header/structure) |
| connection-services | 2 |
| sources | 3 |

### Known blockers

1. `publish-check` blocked by `src_legacy_seed` pending provenance (expected).
2. Reconciliation: 0 confirmed matches; 15 `candidate_exact_name`; Asiaq waiting.
3. Web reachability joins by official name (`linksFromOfficialName`) — Phase 1 target (resolved on branch).
4. Live NunaGIS fetch can still write `web/public/data/` directly — web must switch to `data/releases/CURRENT` mount (Phase 2 handoff).

### Phase 2 foundation (2026-08-01)

| Command | Result |
|---|---|
| `make -C data validate` | PASS |
| `make -C data test` | PASS — includes `test_schema_meta.py` + `test_release.py` |
| `make -C data publish-check` | FAIL (expected) — 94 errors, `src_legacy_seed` pending |
| `make -C data register-snapshot` | PASS — `snp_nunagis_placenames_2026_08_01` |
| `make -C data release` | PASS — `2026.08.01.1`, 97 publication blockers in manifest |

Selected release: `data/releases/CURRENT` → `2026.08.01.1`

### Architecture note for Phase 1

No confirmed `external-identifiers` yet. Crosswalk is generated from `data/reconciliation/place-seeds.ndjson` candidate NunaGIS GlobalIDs with `identityStatus: "candidate"`. Operational joins use non-null `placeId`; upstream-only features (`placeId: null`) cannot show canonical operational claims. Confirmed `xid_` records will promote status to `canonical` when Phase 3 confirms identities.

### Phase 4 read API scaffold (2026-08-01)

| Command | Result |
|---|---|
| `pnpm --dir api install` | PASS |
| `pnpm --dir api typecheck` | PASS |
| `pnpm --dir api test` | PASS — 7 tests |

Package: `api/` — Hono server reading `data/releases/CURRENT` → `decision-geography.db` via Node 22 `node:sqlite`. Search uses SQL LIKE; FTS5 documented as follow-up.

## Phase log

| Phase | Status | Notes |
|---|---|---|
| 0 Baseline | complete | See above |
| 1 Canonical identity | complete | `linksFromPlaceId`; no `linksFromOfficialName`; 25 web tests |
| 2 Snapshots and releases | complete | Schemas, `2026.08.01.1`, web mounts release for identity/reachability |
| 3 Locality spine | blocked | Inclusion rule written; 0 confirmed `xid_`; needs human confirm |
| 4 Read API | scaffold complete | `api/` Hono + SQLite; 8 v1 endpoints; 7 tests; FTS follow-up |
| 5 Greenland-first UI | foundations complete | AppShell, PlaceList, PlaceDossier, MobilePlaceSheet, i18n kl/da/en |
| 6 Date-aware reachability | partial | Multi-service export done; effective-date filter + isolation reports remain |
| 7 Operational sources | pending | |

### Phase 5 notes (2026-08-01)

- Search uses complete placename index (`allPlaces`), not map-filtered subset.
- Tabs shown only when backed by data (Overview / Access / Sources).
- Kalaallisut UI strings are provisional — marked in Sources tab and STATUS.
- OfflineStatus reports `navigator.onLine` + selected release id/date.
- Google Fonts removed; local font stacks only.

### Residual / next integrator work

1. **Phase 3:** Confirm first seed (e.g. Nuuk) → write `xid_` + promote crosswalk to canonical; do not auto-merge.
2. **Phase 2 residual:** Package gazetteer midpoints into release snapshots (web still loads `/data/placenames.geojson`).
3. **Phase 4 follow-up:** FTS5 + OpenAPI client generation.
4. **Phase 5 follow-up:** Native KL review; AccessPlanner; full offline package UX; a11y pass with screen reader.
5. **Phase 6:** Effective-date service filtering + isolation reports.
