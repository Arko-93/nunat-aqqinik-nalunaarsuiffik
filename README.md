# Nunat Aqqinik Nalunaarsuiffik

Greenland's place identity layer and the foundation for Decision Geography.

The implementation source of truth is [docs/STATUS.md](docs/STATUS.md). A bounded copy-paste prompt for the next coding agent is in [AGENT_PROMPT.md](AGENT_PROMPT.md).

## Tilgang

We build operational decision systems for public organisations working across fragmented data, limited capacity and difficult geography.

## Product model

Decision Geography has a small stable core and composable operational extensions:

1. **Place identity** answers: What place is this?
2. **Reachability** answers: What connects to it, how, and when?
3. Domain datasets answer: What demand, capacity, service, or risk exists there?
4. Decision systems answer: What should happen next?

The place-name register is the shared geographic join layer. Public services, transport, population, emergency coverage, logistics, tourism, and other datasets can reference the same permanent place IDs without sharing a database or application.

## Why this dataset

The official Greenlandic place-name register is a small, continuously maintained dataset that serious digital products in Greenland eventually need. Logistics systems, maps, emergency dispatch, weather alerts, address forms, tourism guides, and government portals all anchor to named places.

The complete gazetteer is expected to contain roughly 3,000–5,000 entries and change slowly. The operational locality spine is smaller: inhabited and serviced places used to allocate people, capacity, transport, money, and response.

## Identity rules

- `id` is an opaque permanent identifier in the dataset namespace.
- A name, spelling, slug, municipality, or status can change without changing `id`.
- `slug` is a mutable human-readable alias and must not be used as a foreign key.
- External authority identifiers belong in source mappings, not in `id`.
- Every assertion must have a traceable source reference.

The 15 migrated seed records currently reference `src_legacy_seed`. That source is explicitly marked `pending`. Oqaasileriffik pointed to the public NunaGIS PlacenamesRegister for official-name extract; the 15 seeds now have Type 21/23 `candidate_exact_name` rows awaiting review confirmation. Replace name claims with those reviewed record-level IDs, and geometry claims with field-appropriate Asiaq evidence, before treating the seed as verified.

## Canonical data model

Canonical sources are normalized by entity type: durable identities are separate from time-bounded assertions. All source files live under `data/source/` as newline-delimited JSON.

```text
data/
├── schema/                   # JSON Schema (Draft 2020-12) per record type
│   ├── place.schema.json
│   ├── place-classification.schema.json
│   ├── place-name.schema.json
│   ├── place-geometry.schema.json
│   ├── administrative-area.schema.json
│   ├── administrative-membership.schema.json
│   ├── external-identifier.schema.json
│   ├── connection.schema.json
│   ├── connection-service.schema.json
│   └── source.schema.json
├── scripts/                  # Build, validate, test, migration
│   ├── build.py              # Generate consumer distributions
│   ├── ndjson2db.py          # Build SQLite with views
│   ├── validate.py           # Schema, referential, temporal, semantic checks
│   ├── gen_schemas.py        # Generate schema files (run after model changes)
│   ├── gen_fixtures.py       # Generate test fixtures
│   └── migrate_phase1.py     # One-time migration from flat model
├── source/                   # Canonical source records (authoritative)
│   ├── places.ndjson         # Durable place identity
│   ├── place-classifications.ndjson
│   ├── place-names.ndjson    # Name assertions (official, exonym, historical)
│   ├── place-geometries.ndjson
│   ├── administrative-areas.ndjson
│   ├── administrative-memberships.ndjson
│   ├── external-identifiers.ndjson
│   ├── connections.ndjson    # Durable structural transport edges
│   ├── connection-services.ndjson
│   └── sources.ndjson        # Provenance registry
├── tests/                    # Regression fixtures
│   ├── valid/                # One valid example per record type
│   ├── invalid/              # Schema-level failure cases
│   └── cross/                # Cross-record failure cases
└── dist/                     # Generated distributions (never edit by hand)
    ├── nunat-aqqinik-nalunaarsuiffik.ndjson / .json / .geojson / .csv
    ├── reachability.ndjson / .json / .csv
    ├── decision-geography.db (SQLite)
    └── manifest.json
```

### Durable entities

**Place** — permanent identity plus minimal sourced lifecycle fields:

| Field | Meaning |
|---|---|
| `id` | Permanent `plc_<uuid>` |
| `status` | `active`, `historical`, or `retired` |
| `created_at` | When this identity was created |
| `retired_at` | When the identity was retired (null if active) |
| `source_refs` | Evidence for lifecycle claims |

**Connection** — durable structural edge between two places:

| Field | Meaning |
|---|---|
| `id` | Permanent `con_<uuid>` |
| `origin_place_id` / `destination_place_id` | Foreign keys to places |
| `direction` | `one_way` or `bidirectional` |
| `mode` | `air`, `helicopter`, `sea`, `local_boat`, or `road` |
| `created_at` / `retired_at` | Identity lifecycle |

### Sourced assertions (time-bounded)

All assertions (classifications, names, geometries, memberships, services) carry:
- `id` — permanent assertion ID with type prefix
- `valid_from` / `valid_to` — effective period (null = unbounded)
- `source_refs` — traceable evidence references
- `observed_at` — when the source was observed

### Consumer distributions

Generated files are never edited by hand. `make -C data build` produces:

- **Places** — one record per place with current canonical name, geometry, and membership
- **Reachability** — one row per structural connection with every current service assertion in a `services` array
- **Manifest** — record counts, schema version, deterministic data-as-of date, checksums, and pending-source flag
- **SQLite** — historical tables with `current_places` and `current_connections` views

## Validation contract

Validation is part of the product. Three gates:

```sh
make -C data validate       # Schema, IDs, FKs, sources, temporal, semantics
make -C data test           # fixtures + reproducible builds + distribution/SQLite checks
make -C data publish-check  # test + block pending provenance
```

At minimum, validation catches:
- Malformed or duplicate IDs
- Unknown properties on any record type
- Broken foreign keys and unresolvable source references
- Reversed validity ranges
- Multiple current official Kalaallisut names for one place
- Missing or multiple current classifications for an active place
- Invalid GeoJSON coordinate structure or WGS84 range
- Self-connections and duplicate structural edges (including reversed bidirectional)
- Invalid seasonality/month combinations
- Current assertions with `valid_to`
- Retired entities without `retired_at`
- Publication attempts with pending provenance

## Prerequisites

- Python 3.12+
- Dependencies from `requirements.txt`

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Build and validation

```sh
make -C data          # validate + build
make -C data validate # validate sources only
make -C data test     # validate + run regression fixtures
make -C data build    # generate distributions only
make -C data clean    # remove distributions
```

## Official names map (Omarchy)

Phase B map of official Greenland place names (NunaGIS midpoints, full register).
Runs on Omarchy beside the logistics console (`:3456`).

```sh
make map-omarchy   # fetch placenames, build web/, deploy Docker on Omarchy
```

Open [http://omarchy.tail189279.ts.net:3457](http://omarchy.tail189279.ts.net:3457)
while connected to Tailscale. Not on Cloudflare.

Local development:

```sh
pnpm --dir web install
pnpm --dir web fetch:placenames
pnpm --dir web dev
```

## Status

- 15 migrated places with canonical names, geometries, and municipal memberships
- 15 time-bounded classification assertions; classification no longer lives on place identity
- 2 sourced transport connections (Qaqortoq↔Narsaq, Qaqortoq↔Nanortalik — Air Greenland helicopter, year-round)
- 3 sources: 2 verified (Air Greenland notice; NunaGIS PlacenamesRegister snapshot), 1 pending (`src_legacy_seed`)
- Oqaasileriffik replied 2026-07-30 with the NunaGIS PlacenamesRegister path; Asiaq still pending
- Reconciliation: 15 Oqaasileriffik `candidate_exact_name` rows; Asiaq `waiting_for_export`; overall unresolved
- Phase 1 complete; Phase 2 in progress; Phase 4 proven; concurrent-service projection implemented
- `make -C data publish-check` fails due to `src_legacy_seed` — expected until Phase 2

### Reachability query

Given a place and an effective date, the system answers:

```sql
SELECT pn.value AS place, c.mode, cs.operator, cs.seasonality_json,
       cs.frequency_band, cs.frequency_basis
FROM connections c
JOIN connection_services cs ON cs.connection_id = c.id AND cs.valid_to IS NULL
JOIN places p ON p.id = CASE WHEN c.origin_place_id = :place_id
    THEN c.destination_place_id ELSE c.origin_place_id END
JOIN place_names pn ON pn.place_id = p.id AND pn.kind = 'official'
    AND pn.language = 'kl' AND pn.valid_to IS NULL
WHERE (
        c.origin_place_id = :place_id
        OR (c.direction = 'bidirectional' AND c.destination_place_id = :place_id)
    )
    AND (cs.valid_from IS NULL OR cs.valid_from <= :effective_date)
    AND (cs.valid_to IS NULL OR cs.valid_to >= :effective_date)
    AND cs.status = 'active'
    AND c.retired_at IS NULL;
```

Example: from Qaqortoq on 2026-07-26 → Nanortalik and Narsaq reachable by helicopter. Air Greenland publishes up to multiple daily weekday return flights and year-round service; `published_maximum` prevents that upper bound from being read as a guarantee.
