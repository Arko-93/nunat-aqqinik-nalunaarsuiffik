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

## Current blocker (2026-08-06)

- 14 seeds at `candidate_exact_name`; Nuuk confirmed (#29 — canonical `xid_` + Oqaasileriffik `confirmed_place_id`).
- Nuuk's Oqaasileriffik queue status is `confirmed`; the seed stays `unresolved` until Asiaq confirms (do not invent an Asiaq match).
- Asiaq export still waiting; geometry not claimed.
- `src_legacy_seed` pending provenance on the other 14 seeds blocks `publish-check`.

## Confirm workflow (manual)

1. Open `data/reconciliation/place-seeds.ndjson` and the NunaGIS authority row.
2. Verify GlobalID, type, municipality/locality codes, and name variants.
3. If confirmed: add an `external-identifiers` row (`nunagis.global_id`) and set `confirmed_place_id` on the Oqaasileriffik authority row; refresh the queue with `make -C data reconcile` (never hand-edit `place-seeds.ndjson`; `normalize-nunagis` preserves confirmations by `record_id`).
4. Replace legacy source refs assertion-by-assertion; rebuild crosswalk + release; run `make -C data publish-check`.

Naming confirmation = the `xid_` **and** the Oqaasileriffik `confirmed_place_id`. The seed reaches overall `matched` only when Asiaq also confirms; do not force it by inventing an Asiaq confirmation.

Do **not** auto-merge on name equality.
