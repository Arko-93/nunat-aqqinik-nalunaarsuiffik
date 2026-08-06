# Implementation ledger

**Plan:** `docs/nunat-decision-geography-product-implementation-plan.md`  
**Working branch:** `feat/canonical-identity-e2e`  
**Baseline commit:** `707d01767c568d1cea0a609ae4bbcf9067fdf4d2`  
**Baseline date:** 2026-08-01  
**Phase:** 5 UI finished (quiet shell); Phase 3 identity confirmation in progress — Nuuk confirmed (first canonical `xid_`, #29)

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

1. `publish-check` blocked by `src_legacy_seed` pending provenance on the other 14 seeds (expected).
2. Reconciliation: 1 confirmed `xid_` (Nuuk); 14 seeds still `candidate_exact_name`; Asiaq waiting.
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

### Phase 3: first identity confirmation — Nuuk (2026-08-06)

| Command | Result |
|---|---|
| `make -C data validate` | PASS — 101 records across 10 source files |
| `make -C data test` | PASS — fixtures + reconciliation + build + release |
| `make -C data publish-check` | FAIL (expected) — `src_legacy_seed` pending on the other 14 seeds |
| `python3 web/scripts/build-identity-crosswalk.py` | PASS — 15 entries (1 canonical, 14 candidate) |
| `scripts/sync-web-release.sh` | PASS — Nuuk canonical in release-mounted crosswalk |

- Nuuk confirmation: `plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80` ↔ NunaGIS GlobalID `C9EE223C-C726-4335-80F8-E401E5480001`, record ID=13493 (Type 21/By), official name `Nuuk`, decision ref `nunagis.placenames:ID=13493`. Single candidate, zero differences.
- Wrote first canonical `xid_` (`nunagis.global_id`) to `data/source/external-identifiers.ndjson` (was empty).
- Re-sourced Nuuk name claims (KL official + DA exonym `Godthåb`) and the `town` classification from `src_legacy_seed` to `src_nunagis_placenames_register`.
- Nuuk geometry deliberately stays on `src_legacy_seed` (pending) — Asiaq export still `waiting_for_export`.
- Record count delta: external_identifiers 0 → 1.

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
| 3 Locality spine | in progress | Inclusion rule; Nuuk confirmed first `xid_` (#29); 14 pending |
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

1. **Phase 3 (done):** Nuuk confirmed → wrote first `xid_` + promoted crosswalk to canonical; no auto-merge.
2. **Phase 3 (next):** Review and confirm the remaining 14 seeds the same way (one `xid_` per confirmed place).
3. **Phase 2 residual:** Package gazetteer midpoints into release snapshots (web still loads `/data/placenames.geojson`).
4. **Phase 4 follow-up:** FTS5 + OpenAPI client generation.
5. **Phase 5 follow-up:** Native KL review; AccessPlanner; full offline package UX; a11y pass with screen reader.
6. **Phase 6:** Effective-date service filtering + isolation reports.
