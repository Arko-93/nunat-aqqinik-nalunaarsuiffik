# Decision Geography status and implementation plan

## Status

This document is the product and implementation source of truth.

- Current stage: Product plan Phases 0–2, Phase 4 API scaffold, and Phase 5 quiet UI landed; Phase 3 naming spine complete for qualifying Type 21/23 — 73 places; Asiaq geometry pending
- Current data: 73 place identities, 73 classification assertions, 106 names, 15 geometries (58 imported localities have no Asiaq `geo_` yet), 73 memberships, 73 external identifiers (`nunagis.global_id`), 2 connections, and 2 service assertions
- Publication status: still not authoritative; `publish-check` reports expected pending-provenance blockers while `src_legacy_seed` remains on seed place status, geometry, and administrative records
- Immediate work: Asiaq geometry parked (no external chase); API FTS5, Phase 6 date/isolation, and UI offline/a11y polish landed
- First operational extension: structural reachability (joins by `placeId`; multi-service export preserved)
- Selected release: `data/releases/CURRENT` → `2026.08.07.6` (web mounts via `scripts/sync-web-release.sh`; includes display-only NunaGIS `placenames.geojson`; `isolation-report.json`; SQLite FTS5 `place_names_fts`)
- Read API: `api/` on `:8787` (`make api-dev`); place search uses FTS5 with LIKE fallback
- Phase 5 UI: terrain-first map on `web/` (land hillshade + land peak color bands — peaks-only, transparent below 500 m, discrete 500/1000/2000 m bands above the hillshade and below place labels, `nunat:land-peak-bands: 500-1000-2000` — + ocean meter bands hybrid D via `depth_abs_m` + discrete metric fills; ocean source is now self-tiled IBCAO v5.2 bathymetry with GEBCO_2026 fallback, depth bands/contours clipped to the shared coastline before tiling, raster hillshade + vector MVT served as same-origin PMTiles from `packages/ocean-depth`), V1 interim coastline land mask — OSM coastline ∪ Mapterhorn DEM land (ODbL + CC BY 4.0), above all ocean layers, map-first shell (search → Overview+Sources; no lens/Access/List–Map), KL/DA/EN switch (KL first; KL copy provisional), Download area corridor pack (OPFS; full Qaarsut→Kullorsuaq pack: land-relief z0–10 native 512 px + land peak bands z0–10 + ocean-depth vector z0–11 + ocean hillshade raster z0–10 + corridor mask z0–13 + localities, kind=full manifest, offline serves the same tile paths via OPFS), app-shell SW (`nunat-shell-*` only), not-for-navigation, tile-gap labels (issue #26: quiet chrome chip when land DEM or ocean-depth tiles are absent in the viewport — protocol-reported, `nunat:tile-gap-labels: visible`, never a symbol layer so NunaGIS labels stay primary); gaps remain: Asiaq geometry swap for the shared shoreline; no Google Fonts
- Locality inclusion rule: `docs/LOCALITY_SPINE_INCLUSION.md`
- Implementation ledger: `docs/IMPLEMENTATION_LEDGER.md`
- Product plan: `docs/nunat-decision-geography-product-implementation-plan.md`
- Product map: Omarchy `:3457` serves the official-names map (`web/`), not the old static review HTML
- Marine POC: `marine-poc/` private trip notebook (Uummannaq–Qaarsut); Omarchy `:3459` via `make marine-omarchy`; does not write into `data/source/`
- Map data: release-mounted NunaGIS PlacenamesRegisterSearch midpoints (`placenames.geojson`, 30,542 features, display-only — not Asiaq geometry); locality filter Type 21/23 → 73 qualifying after Grise Fiord exclusion
- Authority requests: Oqaasileriffik replied 2026-07-30 pointing to NunaGIS; Asiaq reply still pending
- Reconciliation (data ops): 0 matched, 0 conflicting, 0 missing, 73 unresolved overall; Oqaasileriffik `confirmed` ×73 via `confirmed_place_id`; Asiaq `waiting_for_export` ×73
- Phase 3 naming spine: 73 / 73 qualifying Type 21/23 confirmed (all Oqaasileriffik `confirmed_place_id`); `Grise Fiord :100:` (NunaGIS ID=13434) excluded — Canadian Ellesmere Island hamlet mis-typed as Type 23, not in authority. Homonyms Aappilattoq×2 / Tasiusaq×2 kept distinct (#40). Danish conflicts kept visible on seeds: Kangerlussuaq — register Danish `Danmarkshavn` vs seed `Søndre Strømfjord`; Narsaq — register has no Danish claim vs seed `Narssaq`; Kulusuk — register Danish `Kulusuk` vs seed `Kap Dan`
- Identity crosswalk: release-mounted `identity-crosswalk.json` — 73 canonical mappings (0 candidate)
- Note: “Nunat Aqqinik Nalunaarsuiffik” is the NunaGIS public placenames register name; naming decisions remain Nunat Aqqinik Aalajangiisartut at Oqaasileriffik
- Last implementation audit: 2026-08-07

When this document conflicts with generated files, generated files are wrong. When it conflicts with an authoritative primary source about a real-world fact, the primary source wins and the discrepancy must be recorded.

## Actual goal

Build Greenland's small, continuously maintained geographic identity layer, then compose operational datasets around it.

The system must let independent public-sector datasets reliably refer to the same places and answer operational questions across fragmented data, limited capacity, and difficult geography.

The first proof is reachability:

> Given a place and an effective date, which other places are structurally reachable, by which modes, under what seasonal constraints, and according to which evidence?

This is not mainly a map, directory, route planner, or public website. Those can be products built from the data. The core product is trusted identity, provenance, history, and joins.

## First principles

### 1. Optimise for decisions, not data volume

Only add data that supports a real join, constraint, or operational question. A smaller maintained dataset is better than a broad stale catalogue.

### 2. Keep a thin stable core

Place identities are the shared interface. Transport, population, services, emergency coverage, logistics, and tourism reference those identities without redefining places.

### 3. Identity is not a label

Permanent IDs must not contain or depend on names, spellings, municipalities, coordinates, operators, or other mutable facts.

### 4. Store claims with evidence

A real-world value is an assertion made by a source at a point in time. Names, coordinates, memberships, operators, seasonality, and service status need source references and effective dates.

### 5. Preserve history

Do not overwrite a past truth when the world changes. Close its validity period and add the new assertion.

### 6. Make uncertainty explicit

Unknown, pending verification, conflicting, and not applicable are different states. Do not turn missing evidence into a guessed value.

### 7. Separate durable structure from changing service

A transport connection is a structural edge. Operator, frequency, capability, seasonality, and status are time-bounded service assertions attached to that edge.

### 8. Source once, publish many formats

Canonical NDJSON source records generate consumer-friendly JSON, GeoJSON, CSV, and SQLite. Generated files are never edited by hand.

## Scope

### In scope now

- Permanent place identities
- Official Kalaallisut names and sourced alternate names
- Point geometry
- Administrative relationships
- External authority identifiers
- Provenance and retrieval metadata
- Structural transport connections
- Time-bounded transport service assertions
- Deterministic distributions and validation

### Explicitly out of scope

- Live departures, delays, fares, inventory, or booking
- Turn-by-turn routing
- Unsourced route inference from maps or memory
- Public-service, population, or emergency datasets before reachability is proven
- A confirm/reject maintainer console as the primary product UI (map of official names is the product surface; reconciliation remains data ops)

### Product UI (Phase B)

- Full official gazetteer on a Greenland map (`web/`), deployed at Omarchy `:3457`
- Locations from NunaGIS midpoint points, not guessed coordinates
- Scope toggle: all names | localities (Type 21/23); progressive zoom bands (no clusters); ranked search (localities first)

## Source-of-truth hierarchy

1. `AGENTS.md` — repository working rules
2. `docs/STATUS.md` — product goal, architecture, phases, acceptance gates, and current status
3. `data/schema/` — machine-readable record contracts
4. `data/source/` — canonical normalized records
5. `data/scripts/validate.py` — cross-record and semantic invariants
6. `data/dist/` — generated consumer artefacts
7. `README.md` — orientation, not a competing specification

Raw upstream material belongs under `data/snapshots/<source>/<timestamp>/` when licensing permits (legacy copies may remain under `data/raw/`). If raw material cannot be committed, store a manifest containing its URL, retrieval timestamp, media type, checksum when available, licence, and access notes.

Named consumer releases live under `data/releases/<release_id>/`. Production web/API builds must consume the selected release recorded in `data/releases/CURRENT`, not live upstream or mutable `data/dist/`.

## Authority policy

### Place identity and names

- Official Greenlandic naming decisions: Nunat Aqqinik Aalajangiisartut at Oqaasileriffik.
- Geometry and distributed base-map records: Asiaq, subject to its product terms and field-level provenance.
- Preserve the authority's upstream record identifier when one exists.
- Kalaallisut official orthography is canonical.
- Danish and other names are alternate name assertions, not replacements.

### Transport

- Prefer a primary operator publication or the public authority responsible for the service.
- Prefer a dated service contract, network description, route publication, or timetable over marketing copy.
- Use timetables only as evidence that a structural connection exists; do not import individual departures.
- Record the effective period represented by the source.
- If sources disagree, keep the conflicting assertions, record both sources, and leave the conflict visible until resolved.

### Prohibited evidence

- Agent memory
- Search-result snippets without opening the primary source
- An unsourced third-party map
- Inference from proximity
- Existing seed data marked `pending`

## Target canonical data model

Canonical sources should separate durable entities from mutable assertions.

```text
data/source/
├── places.ndjson
├── place-classifications.ndjson
├── place-names.ndjson
├── place-geometries.ndjson
├── administrative-areas.ndjson
├── administrative-memberships.ndjson
├── external-identifiers.ndjson
├── connections.ndjson
├── connection-services.ndjson
└── sources.ndjson
```

### Place

A durable identity with minimal sourced lifecycle claims.

```json
{
  "id": "plc_<uuid>",
  "status": "active",
  "created_at": "YYYY-MM-DD",
  "retired_at": null,
  "source_refs": [
    {
      "source_id": "src_<uuid>",
      "record_id": "upstream-record-id"
    }
  ]
}
```

Changing a name, point, municipality, or upstream identifier must not change the place ID.

### Place classification assertion

```json
{
  "id": "cls_<uuid>",
  "place_id": "plc_<uuid>",
  "feature_type": "town",
  "valid_from": null,
  "valid_to": null,
  "source_refs": [
    {
      "source_id": "src_<uuid>",
      "record_id": "upstream-record-id"
    }
  ],
  "observed_at": "YYYY-MM-DD"
}
```

Classification is mutable evidence, not identity. Close the previous assertion
and add a new one when a place changes between classifications.

### Place name assertion

```json
{
  "id": "nam_<uuid>",
  "place_id": "plc_<uuid>",
  "value": "Nuuk",
  "language": "kl",
  "kind": "official",
  "valid_from": null,
  "valid_to": null,
  "source_refs": [
    {
      "source_id": "src_<uuid>",
      "record_id": "upstream-record-id"
    }
  ],
  "observed_at": "YYYY-MM-DD"
}
```

Exactly one current official Kalaallisut name is allowed per place.

### Place geometry assertion

```json
{
  "id": "geo_<uuid>",
  "place_id": "plc_<uuid>",
  "geometry": {
    "type": "Point",
    "coordinates": [-51.733, 64.175]
  },
  "valid_from": null,
  "valid_to": null,
  "source_refs": [
    {
      "source_id": "src_<uuid>",
      "record_id": "upstream-record-id"
    }
  ],
  "observed_at": "YYYY-MM-DD"
}
```

GeoJSON coordinate order is longitude, latitude.

### Administrative membership assertion

```json
{
  "id": "mem_<uuid>",
  "place_id": "plc_<uuid>",
  "administrative_area_id": "adm_<uuid>",
  "valid_from": "YYYY-MM-DD",
  "valid_to": null,
  "source_refs": [
    {
      "source_id": "src_<uuid>",
      "record_id": "upstream-record-id"
    }
  ],
  "observed_at": "YYYY-MM-DD"
}
```

Municipal names must not be used as foreign keys.

### External identifier

```json
{
  "id": "xid_<uuid>",
  "entity_type": "place",
  "entity_id": "plc_<uuid>",
  "namespace": "authority-defined-namespace",
  "value": "authority-record-id",
  "valid_from": null,
  "valid_to": null,
  "source_refs": [
    {
      "source_id": "src_<uuid>",
      "record_id": "authority-record-id"
    }
  ]
}
```

The pair `namespace + value` must be unique among current identifiers.

### Structural connection

One record represents a durable edge for an origin, destination, direction, and mode.

```json
{
  "id": "con_<uuid>",
  "origin_place_id": "plc_<uuid>",
  "destination_place_id": "plc_<uuid>",
  "direction": "bidirectional",
  "mode": "air",
  "created_at": "YYYY-MM-DD",
  "retired_at": null
}
```

Operator and frequency do not define connection identity.

### Connection service assertion

```json
{
  "id": "svc_<uuid>",
  "connection_id": "con_<uuid>",
  "operator": "Example operator",
  "capabilities": ["passenger", "freight"],
  "seasonality": {
    "kind": "year_round",
    "months": []
  },
  "frequency_band": "multiple_weekly",
  "frequency_basis": "typical",
  "status": "active",
  "valid_from": "YYYY-MM-DD",
  "valid_to": null,
  "source_refs": [
    {
      "source_id": "src_<uuid>",
      "record_id": "route-or-document-reference"
    }
  ],
  "observed_at": "YYYY-MM-DD"
}
```

Frequency is deliberately a coarse evidence-backed band. It is not a promise of a departure.

### Source

```json
{
  "id": "src_<uuid>",
  "title": "Source title",
  "publisher": "Publishing authority",
  "url": "https://example.gl/source",
  "retrieved_at": "YYYY-MM-DD",
  "effective_from": null,
  "effective_to": null,
  "media_type": "text/html",
  "checksum": null,
  "licence": null,
  "verification_status": "verified",
  "notes": null
}
```

`verified` means a human or agent opened the primary source and confirmed that it supports the assertion. It does not mean the source is infallible.

## Distribution model

Canonical sources remain normalized. Distributions are optimized for consumers:

- `places.ndjson`, `.json`, `.csv`, and `.geojson` — one current denormalized place view
- `reachability.ndjson`, `.json`, and `.csv` — one row per current structural connection with a `services` array containing every current service assertion
- `decision-geography.db` — normalized history plus current views
- `manifest.json` — dataset version, data-as-of date, record counts, schema versions, and checksums

SQLite should expose:

- Historical source tables
- A `current_places` view
- A `current_connections` view
- Foreign keys and useful indexes

## Validation contract

Validation is part of the product, not build housekeeping.

### Structural validation

- Every NDJSON line parses independently.
- Every record conforms to its JSON Schema.
- Unknown properties fail validation.
- IDs match their entity prefix and UUID format.
- IDs and current readable slugs are unique.
- Dates use ISO 8601 and validity ranges are ordered.
- Coordinates are valid WGS84 values.

### Referential validation

- Every foreign key resolves.
- Every source reference resolves.
- No connection links a place to itself.
- No active assertion references a retired entity outside its valid period.
- Current external identifiers are unique within their namespace.

### Semantic validation

- Each place has exactly one current official Kalaallisut name.
- Each active place has exactly one current classification.
- Current names and geometries have at least one verified source.
- A seasonal service lists valid months.
- A year-round service has an empty month list.
- A retired record has a retirement date.
- `valid_to: null` defines a current assertion; a non-null `valid_to` preserves a historical assertion.
- Duplicate structural edges are rejected after canonicalizing bidirectional endpoints.
- A frequency band states whether it is a published maximum, typical level, guaranteed minimum, or unknown.

### Provenance validation

- `pending` sources are allowed during development.
- `pending`, missing, or untraceable sources fail publication checks.
- A URL alone is insufficient when the upstream source exposes a record identifier.
- Every imported source snapshot has retrieval metadata.
- Conflicting claims remain represented and are reported.

### Reproducibility validation

- `make clean all` succeeds from source only.
- A second clean build produces identical data content.
- Generated record counts match the manifest.
- SQLite foreign-key checks return no rows.
- Generated distributions are never newer in meaning than canonical sources.

## Commands and gates

The implementation should provide three explicit gates:

```sh
make -C data validate
make -C data test
make -C data publish-check
```

- `validate` — schemas, IDs, references, and semantic invariants
- `test` — validation, regression fixtures, two reproducible builds, manifest checksums, distribution counts, and SQLite integrity
- `publish-check` — the test gate plus verified provenance and no pending assertions

All three gates are implemented. `publish-check` intentionally fails while the legacy seed remains pending.

## Implementation phases

### Phase 0 — Provisional foundation

Status: complete.

- Permanent place IDs minted for the 15 seed records
- Initial place and connection schemas
- Separate reachability source
- Multi-format build
- Pending legacy provenance made explicit

Exit condition met.

### Phase 1 — Harden the canonical contract

Status: complete and audited.

- Add JSON Schemas for every canonical record type, including sources
- Execute JSON Schema validation rather than only hand-written field checks
- Split mutable assertions from durable place and connection identities
- Add administrative area and external identifier entities
- Migrate the 15 seeds without changing their `plc_` IDs
- Add temporal, semantic, and bidirectional-edge invariants
- Add fixture-based tests containing both valid and intentionally invalid records
- Add `test` and `publish-check` targets
- Verify deterministic distributions, manifest checksums, and SQLite integrity
- Preserve historical assertions instead of rejecting non-null `valid_to`
- Distinguish published maximum frequency from typical or guaranteed frequency
- Correct the Phase 4 source URL and effective date against the primary operator notice

Exit condition met. `make -C data validate` and `make -C data test` pass.

### Phase 2 — Establish authoritative place provenance

Status: in progress; immutable snapshot and named-release foundation complete; authoritative reconciliation still open.

- Acquire or register the Oqaasileriffik official-name register or decision records
- Acquire or register Asiaq geometry and upstream geodata identifiers separately
- Oqaasileriffik bulk-export request sent 2026-07-26; reply 2026-07-30 directed to NunaGIS PlacenamesRegisterPublic (`MapServer/0`)
- Dated attributes-only seed-name snapshot stored under `data/snapshots/nunagis_placenames/2026-08-01/` (legacy mirror: `data/raw/nunagis_placenames/2026-08-01/`) with checksum and `licence_status: unknown`
- Phase 2 metadata schemas: `source-dataset`, `source-snapshot`, `import-run`, `change-event`, `release-manifest` under `data/schema/`
- Named release `2026.08.01.1` built under `data/releases/` with manifest, changes, source-health, and dist artefact copies; `data/releases/CURRENT` points at it
- `make -C data release` builds a named release; `make -C data register-snapshot` imports raw evidence into `data/snapshots/`
- Fetch adapters write to `data/snapshots/` by default (`fetch_nunagis_placenames.py`); use `--legacy-raw-dir` to mirror into `data/raw/`
- Release `publication_blockers` record pending provenance (`src_legacy_seed`) and unknown redistribution (`licence_status: unknown` on NunaGIS snapshot)
- Normalized Type 21/23 locality rows written to `data/reconciliation/authority/oqaasileriffik-nunagis.ndjson` (`make -C data fetch-nunagis normalize-nunagis`)
- Source registered as `src_nunagis_placenames_register` (verified retrieval; licence null on service metadata; not geometry authority)
- Asiaq data-access request sent 2026-07-26 for download/service endpoint, field dictionary, licence, update cadence, and stable feature identifiers — reply still pending
- Non-destructive 15-place reconciliation queue and normalized authority-input contract implemented under `data/reconciliation/`
- Exact-name matching produces candidates only; explicit authority-to-`plc_` confirmation is required before a match is accepted
- Current queue: Oqaasileriffik `confirmed` for all 15 seeds after Type 21/23 filtering (each carries `confirmed_place_id`, #29 + #31); Asiaq still `waiting_for_export` ×15
- Review note: Kangerlussuaq Type 23 candidate carries Danish label `Danmarkshavn` in the register vs seed DA `Søndre Strømfjord` — resolved by confirming KL official + Type + `xid_` only; the DA claim stays on the legacy seed source; the Danish conflict is documented in #31. Similar DA notes for Narsaq (register has no Danish; seed `Narssaq`) and Kulusuk (register Danish `Kulusuk`; seed `Kap Dan`)
- Record licence, retrieval metadata, upstream IDs, and raw snapshot or manifest
- Reconcile each of the 15 seeds against authority records
- Replace `src_legacy_seed` references one assertion at a time
- Record discrepancies instead of silently correcting them
- Decide whether administrative-area names require their own sourced assertion model before publication
- Replace legacy provenance on place classification/status and administrative-area records, not only names and geometry
- Do not mark the legacy source verified as a shortcut

Exit condition: all 15 seed places pass `publish-check`.

### Phase 3 — Complete the operational locality spine

Status: naming coverage complete for qualifying Type 21/23 (73 places); Asiaq geometry still pending before overall `matched`.

- Confirm naming identity per place against the NunaGIS authority (no auto-merge): a confirmed place gets both a `nunagis.global_id` `xid_` and `confirmed_place_id` on the Oqaasileriffik authority row
- Asiaq geometry confirmation is still required before a place reaches overall `matched` — do not invent an Asiaq confirmation
- `Grise Fiord :100:` excluded from normalize (`EXCLUDED_DECISION_IDS`, ID=13434)
- Homonyms use `--record-ids` after municipality/lat review
- Create a machine-readable reconciliation report
- Review duplicates, homonyms, historical names, and missing coordinates

Exit condition: the locality spine has full authoritative coverage and zero unresolved identity collisions (naming done; geometry wait remains).

### Phase 4 — Build one reachability tracer bullet

Status: complete (tracer bullet proven).

- Registered Air Greenland's dated service-contract notice as the primary source
- Registered source, added two sourced structural edges and service assertions
- Corrected service validity to the contract start on 2026-04-16
- Recorded `multiple_daily` as a published maximum, not a guaranteed or typical frequency
- Generated denormalized reachability distributions
- Proven: `SELECT` query from Qaqortoq on 2026-07-26 returns Nanortalik and Narsaq
- Exit condition met

### Phase 5 — Expand and operationalise reachability

Status: not started.

- Import the structural network for the locality spine
- Add conflict and change reports
- Detect isolated places and seasonal loss of connectivity
- Add dataset versioning, checksums, and changelog generation
- Document the update runbook for a maintainer with limited weekly capacity
- Concurrent operators and service patterns are already preserved as multiple assertions in each structural connection's `services` array

Exit condition: a maintainer can detect upstream changes, review them, rebuild, and publish without manual file surgery.

## Definition of done

The first product milestone is done when:

- Every locality has a permanent identity and authoritative current name.
- Every published assertion is traceable to an opened primary source.
- Historical changes can be represented without rewriting identity.
- At least one sourced connection answers the reachability query.
- Invalid, ambiguous, or unsourced records fail before publication.
- All consumer formats are reproducibly generated from canonical source data.
- A new agent can follow this document without inventing facts or changing scope.

## Work discipline

For every change:

1. Read `AGENTS.md`, this plan, relevant schemas, and the complete files being changed.
2. State which phase and exit condition the change advances.
3. Inspect the primary source before adding real-world assertions.
4. Update source, schemas, validation, tests, and distributions together when the contract changes.
5. Run the strongest available gate and report exact results.

Do not broaden the domain until the current phase exit condition passes.
