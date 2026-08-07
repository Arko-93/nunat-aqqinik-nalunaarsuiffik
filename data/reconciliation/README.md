# Place-seed reconciliation

`place-seeds.ndjson` is the review queue for provisional place identities in
`data/source/`. It is generated and must not change canonical assertions by itself.

## Empty queue

```sh
make -C data reconcile
```

With no authority files present, every seed stays `unresolved` and both
authorities report `waiting_for_export`.

## NunaGIS / Oqaasileriffik path

Oqaasileriffik pointed to the public NunaGIS PlacenamesRegister REST layer as
the official placenames extract. Fetch, normalize, then reconcile:

```sh
make -C data fetch-nunagis-localities   # full Type 21/23 (preferred for Phase 3)
# or: make -C data fetch-nunagis        # seed-name filter only
make -C data normalize-nunagis
make -C data reconcile
```

That writes:

- `data/snapshots/nunagis_placenames/<YYYY-MM-DD>/type-21-23-query.json` — full locality extract (+ manifest)
- `data/reconciliation/authority/oqaasileriffik-nunagis.ndjson` — Type 21 (By/`town`) and Type 23 (Bygd/`settlement`) rows only
- `data/reconciliation/place-seeds.ndjson` — regenerated review queue

Exact-name matches from that file become `candidate_exact_name` on the
Oqaasileriffik side. They are not verified matches. Coordinates are omitted on
purpose: NunaGIS polygons are not Asiaq point geometry.

Homonyms (same `PlacenameOfficial`, different places) must not use
`import_nunagis_localities.py --names`. Use `--record-ids` with MapServer/0
GlobalIDs after checking `MunicipalityCode`, `LokalityCode`, and midpoint
latitude (south Kujalleq ~60°N vs north Avannaata ~73°N). Midpoint-layer
GlobalIDs differ from the register layer — never copy them into `xid_`.

## Other authority exports

After receiving exports, normalize their records into one or more NDJSON files
and pass each file to the script:

```sh
python3 data/scripts/reconcile_places.py \
  --authority path/to/oqaasileriffik.ndjson \
  --authority path/to/asiaq.ndjson
```

Each normalized authority record accepts only these fields:

```json
{
  "namespace": "oqaasileriffik",
  "record_id": "authority-stable-id",
  "official_name": "Nuuk",
  "feature_type": "town",
  "longitude": -51.733,
  "latitude": 64.175,
  "decision_ref": "optional authority reference",
  "confirmed_place_id": "plc_existing-permanent-id"
}
```

`namespace`, `record_id`, and `official_name` are required. Coordinates must be
provided as a longitude/latitude pair. Omit fields the source does not assert.

An exact normalized name creates only `candidate_exact_name`. It never changes
data and is not a verified match. Add `confirmed_place_id` only after reviewing
the authority record against the existing identity. A place is `matched` only
when both Oqaasileriffik and Asiaq records explicitly confirm it and no compared
field differs. Differences are reported as `conflicting`; missing and ambiguous
records remain visible.

`confirmed_place_id` is the durable naming-confirmation pointer, written onto
the authority row after a manual review (see Phase 3 Nuuk, #29). Regenerate the
queue with `make -C data reconcile` only — do not hand-edit `place-seeds.ndjson`,
it is a generated queue. `normalize-nunagis` overwrites the authority file from
the latest snapshot, but it **preserves** existing `confirmed_place_id` values by
`decision_ref` (stable numeric ID), with `record_id` fallback — so confirmations
survive GlobalID rotation between extracts.

A place whose Oqaasileriffik side is confirmed stays `unresolved` overall until
its Asiaq side also confirms. Do not invent an Asiaq confirmation to force
`matched`; that state waits for the real geometry export.

After review, update canonical assertions manually with source references,
upstream external identifiers, effective dates, and preserved history. Then run
all validation gates.
