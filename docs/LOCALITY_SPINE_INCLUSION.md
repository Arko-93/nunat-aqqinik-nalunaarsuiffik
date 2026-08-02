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

## Current blocker (2026-08-01)

- 15 seeds at `candidate_exact_name`; 0 confirmed `xid_` rows.
- Asiaq export still waiting.
- `src_legacy_seed` pending provenance blocks `publish-check`.

## Confirm workflow (manual)

1. Open `data/reconciliation/place-seeds.ndjson` and the NunaGIS authority row.
2. Verify GlobalID, type, municipality/locality codes, and name variants.
3. If confirmed: add `external-identifiers` row (`nunagis.global_id`), set seed match to `matched`, replace legacy source refs assertion-by-assertion.
4. Rebuild crosswalk + release; run `make -C data publish-check`.

Do **not** auto-merge on name equality.
