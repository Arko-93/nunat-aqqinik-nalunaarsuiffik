# Locality spine inclusion rule (Phase 3)

## Qualifying localities

Include a place in the operational locality spine when **all** of the following hold:

1. NunaGIS PlacenamesRegister type is **21 (By / town)** or **23 (Bygd / settlement)**.
2. The feature has a stable upstream GlobalID.
3. The place is inhabited or regularly serviced for people, freight, or public operations (seed set today; full Type 21/23 coverage is the Phase 3 target).
4. Identity is confirmed by review **or** by a namespaced external identifier — never by exact name alone.

## Confirmation rule

| Evidence | `identityStatus` | Action |
|---|---|---|
| Confirmed `xid_` with `nunagis.global_id` | `canonical` | Operational joins allowed |
| Exact-name candidate only | `candidate` | Map join for seed tooling; not publication-grade |
| No place mapping | `upstream_only` | Search/display only |

Exact-name candidates in `data/reconciliation/place-seeds.ndjson` remain **candidates** until an explicit confirm step writes `external-identifiers.ndjson` and updates seed status to `matched`.

## Authority split

- **Naming decision:** Nunat Aqqinik Aalajangiisartut / Oqaasileriffik (via NunaGIS register for distributed records).
- **Geometry:** Asiaq when export is available; do not treat NunaGIS midpoints as geometry authority for publication-grade coordinates.
- Existing `plc_` IDs never change when attributes change.

## Current status (2026-08-07)

- Authority file covers all Type 21/23 rows (74) from `type-21-23-query.json`.
- Canonical spine: 69 places — 15 seeds + 4 Type 21 towns (#36) + 50 unique Type 23 settlements (#38).
- Every imported place has canonical `xid_` + Oqaasileriffik `confirmed_place_id`.
- Every place stays `unresolved` overall until Asiaq confirms (do not invent an Asiaq match).
- Imported localities have municipality membership from NunaGIS `MunicipalityCode`; no `geo_` (Asiaq owns geometry).
- Still out: Aappilattoq×2, Tasiusaq×2 (homonyms); `Grise Fiord :100:` (not imported — likely bad/non-GL label).
- `src_legacy_seed` pending provenance on seed place status, geometry, and administrative records blocks `publish-check`.

## Confirm / import workflow

1. Fetch full localities: `make -C data fetch-nunagis-localities`.
2. Normalize: `make -C data normalize-nunagis` — preserves `confirmed_place_id` by `decision_ref` (stable numeric ID), with `record_id` fallback. GlobalIDs can rotate between extracts.
3. Mint selected names with `data/scripts/import_nunagis_localities.py --names … --sync-global-ids` (no auto-merge on name; skips if official KL already exists).
4. Refresh the queue with `make -C data reconcile` (never hand-edit `place-seeds.ndjson`).
5. Rebuild release + crosswalk; run `make -C data test`.

Naming confirmation = the `xid_` **and** the Oqaasileriffik `confirmed_place_id`. A place reaches overall `matched` only when Asiaq also confirms; do not force it by inventing an Asiaq confirmation.

Do **not** auto-merge on name equality.
