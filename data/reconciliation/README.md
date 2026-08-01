# Place-seed reconciliation

`place-seeds.ndjson` is the review queue for the 15 provisional seed identities.
It is generated and must not change canonical assertions by itself.

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
make -C data fetch-nunagis
make -C data normalize-nunagis
make -C data reconcile
```

That writes:

- `data/raw/nunagis_placenames/<YYYY-MM-DD>/` — dated attributes-only snapshot + manifest
- `data/reconciliation/authority/oqaasileriffik-nunagis.ndjson` — Type 21 (By/`town`) and Type 23 (Bygd/`settlement`) rows only
- `data/reconciliation/place-seeds.ndjson` — regenerated review queue

Exact-name matches from that file become `candidate_exact_name` on the
Oqaasileriffik side. They are not verified matches. Coordinates are omitted on
purpose: NunaGIS polygons are not Asiaq point geometry.

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

After review, update canonical assertions manually with source references,
upstream external identifiers, effective dates, and preserved history. Then run
all validation gates.
