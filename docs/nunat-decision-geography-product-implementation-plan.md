# Nunat Aqqinik Nalunaarsuiffik
## Product strategy and implementation plan

**Repository:** `Arko-93/nunat-aqqinik-nalunaarsuiffik`  
**Primary integrator:** Grok 4.5 Max  
**Subagents:** Composer 2.5 Max  
**Subagent count:** Chosen by the primary integrator after repository inspection  
**Plan date:** 2026-08-01  
**Plan status:** Implementation-ready, but every external source and licence must be rechecked during execution

---

## 1. Executive decision

This project should not become only a polished place-name map.

Its highest-value direction is:

> **Greenland's trusted Place and Access Graph: stable place identity, dated evidence, transport reachability, service coverage, environmental conditions, and operational decisions.**

The existing repository already contains the correct blueprint:

```text
Stable place identity
        ↓
Names, geometry, administration, and external IDs as sourced assertions
        ↓
Structural reachability and time-bounded services
        ↓
Population, facilities, responsibility, conditions, and disruptions
        ↓
Operational decisions for people, freight, public services, and response
```

The project can develop a real moat when it maintains the difficult layer between public datasets:

- Which records refer to the same real place?
- Which source is authoritative for each field?
- What changed, when, and according to whom?
- Which places are connected for a particular purpose and date?
- How fresh and trustworthy is each answer?

Public source data alone is not the moat. The maintained crosswalk, change history, evidence model, operational graph, local corrections, and Greenland-first experience are the moat.

### Recommended product position

Keep the place identity core open, auditable, and reusable. Build differentiated operational products on top.

| Layer | Recommended position |
|---|---|
| Place IDs, official names, aliases, basic geometry, source mappings | Open and versioned |
| Reachability, service patterns, disruptions, and isolation analysis | Product layer |
| Municipal coverage, logistics, emergency, and partner dashboards | Commercial or partner layer |
| Arctic federation outside Greenland | Later extension |

### Immediate priority

The first implementation priority is:

> **Remove all operational joins based on place names and introduce canonical identity end-to-end.**

The current canonical model correctly treats names as mutable assertions. The web application still resolves reachability through official names. That contradiction must be removed before expanding data or UI scope.

---

## 2. Product scope

### 2.1 Core product

The core product answers:

> For this Greenland place and effective date, what is it called, which identifiers refer to it, how can people, freight, or emergency services reach it, what conditions apply, and what evidence supports each answer?

### 2.2 Primary user groups

| User | Main question |
|---|---|
| Resident or traveller | What is this place, and how can I reach it? |
| Municipal or public employee | Which authority, population, facilities, and services relate to this place? |
| Logistics or transport operator | Which connections and constraints affect people or freight? |
| Emergency or field team | What access exists, what changed, and how current is the evidence? |

### 2.3 Do now

1. Complete trusted identity for inhabited and serviced Greenland places.
2. Build dated, evidence-backed structural reachability.
3. Publish a versioned read API and offline-capable web product.
4. Make Kalaallisut and Danish first-class interface languages.
5. Expose freshness, source evidence, and uncertainty clearly.

### 2.4 Later

1. Add live or near-live transport only through reliable feeds.
2. Add municipal service coverage and capacity datasets.
3. Add weather, sea ice, and environmental constraints.
4. Add partner correction and data-sharing workflows.
5. Federate selected Arctic datasets after Greenland coverage is deep.

### 2.5 Explicit non-goals for the first milestone

- A booking engine.
- Turn-by-turn routing.
- A generic world or Arctic map.
- Unverified real-time availability.
- A large microservice architecture.

---

## 3. Moats and defensibility

### 3.1 Canonical place graph

A maintained crosswalk can connect:

```text
Oqaasileriffik / NunaGIS
Greenland Address Register
Statistics Greenland
Municipal systems
Airports and ports
Transport operators
Local and historical names
```

Every external record should resolve to a stable internal `plc_<uuid>` when the identity is confirmed.

This graph becomes useful infrastructure because downstream systems can share place identity without sharing the same database or application.

### 3.2 Evidence and change ledger

Each factual claim should retain:

```text
Source dataset
Exact source snapshot
Upstream record ID
Observed date
Effective validity period
Verification status
Conflict or correction history
Release containing the claim
```

A competitor can download the same source data. Reproducing years of reviewed mappings, conflicts, corrections, and effective-date history is much harder.

### 3.3 Operational access graph

The graph should represent different access meanings separately:

| Meaning | Example |
|---|---|
| Structural connection | A maintained helicopter relationship exists |
| Service pattern | An operator normally serves the connection in selected months |
| Dated trip | A specific published departure exists |
| Service alert | The trip or connection is suspended or delayed |
| External condition | Weather, ice, harbour, or runway conditions affect access |

This distinction prevents the system from claiming that a place is currently reachable when it only knows that a structural route exists.

### 3.4 Greenland-first experience

The interface should be designed around Greenland rather than adapted from a generic map application.

The product moat includes:

- Kalaallisut-first terminology and search.
- Same-name and near-name disambiguation.
- Low-bandwidth and offline regional packages.
- Settlement, municipality, transport, and source concepts familiar to users.
- Local correction workflows that preserve authority and evidence.

### 3.5 Partner and correction network

A mature product should allow operators, municipalities, authorities, and residents to submit corrections without overwriting source truth.

```text
Correction submitted
        ↓
Source or local observation attached
        ↓
Candidate assertion created
        ↓
Maintainer or authority review
        ↓
Accepted, rejected, or kept as a visible conflict
        ↓
Published in a named release
```

The network becomes more valuable as more organisations use the same permanent place IDs.

---

## 4. Current repository assessment

### 4.1 Strong foundations already present

| Foundation | Repository evidence |
|---|---|
| Permanent identities | `data/source/places.ndjson` and opaque `plc_<uuid>` IDs |
| Mutable assertions | Separate names, geometry, classifications, memberships, and services |
| Provenance | `sources.ndjson`, source references, observed dates, verification states |
| Temporal history | `valid_from` and `valid_to` fields |
| Validation gates | `validate`, `test`, and `publish-check` |
| Consumer outputs | JSON, NDJSON, CSV, GeoJSON, SQLite, and manifests |
| Map prototype | React, Vite, MapLibre, Kumo, ranked search, and progressive disclosure |
| Reachability tracer | Two sourced helicopter connections and generated graph output |

### 4.2 Critical gaps

| Priority | Gap | Consequence |
|---|---|---|
| P0 | Reachability and selection use official names | Renames, duplicates, and aliases can join incorrectly |
| P0 | Live upstream fetch can write directly to public web data | Builds are not fully reproducible or reviewed |
| P1 | Only 15 canonical seed places exist | The operational locality spine is incomplete |
| P1 | Reachability export keeps only the first active service | Concurrent operators and service patterns are lost |
| P1 | UI language and taxonomy are mixed | The product is not yet intuitive for Greenland users |

### 4.3 Identity nuance for the full gazetteer

The map contains many geographic features that are not yet canonical `place` entities.

Do not mint fake canonical place IDs merely to satisfy the frontend.

Use two identities:

```ts
type GazetteerFeature = {
  featureId: `nunagis:${string}`;
  placeId: `plc_${string}` | null;
  identityStatus: "canonical" | "candidate" | "upstream_only";
  officialName: string;
  // remaining sourced display fields
};
```

Rules:

1. Every map feature has a stable source-scoped `featureId`.
2. Only reconciled entities receive a canonical `placeId`.
3. Operational joins require a non-null canonical `placeId`.
4. Search may find upstream-only geography, but operational panels must state that no canonical identity exists yet.
5. Names may resolve candidates, but they must never become foreign keys.

---

## 5. Target architecture

### 5.1 System overview

```text
┌──────────────────────────────┐
│ Authorities and source data  │
│ NunaGIS · GAR · Statistics   │
│ Operators · DMI · partners   │
└──────────────┬───────────────┘
               │ source adapters
               ▼
┌────────────────────────────────────────────────────┐
│ Acquisition                                        │
│ immutable snapshots · checksums · schema metadata │
│ terms · licence · retrieval and import status      │
└──────────────────────┬─────────────────────────────┘
                       ▼
┌────────────────────────────────────────────────────┐
│ Reconciliation and canonical data                  │
│ places · assertions · external IDs · connections  │
│ services · conflicts · validity · provenance       │
└──────────────────────┬─────────────────────────────┘
                       ▼
┌────────────────────────────────────────────────────┐
│ Named release                                      │
│ SQLite · GeoParquet · JSON · GeoJSON · PMTiles    │
│ manifest · checksums · changes · source health     │
└─────────────┬──────────────────────┬───────────────┘
              ▼                      ▼
       Versioned read API     Offline-first web app
              │                      │
              └──────────┬───────────┘
                         ▼
               Operational products
```

### 5.2 Canonical identity model

Keep the current separation between durable identities and sourced assertions.

Add a generated or canonical crosswalk capable of expressing:

```json
{
  "place_id": "plc_...",
  "namespace": "nunagis.global_id",
  "value": "3151E3D0-67E9-47BA-B000-01EE34DBF2D1",
  "valid_from": null,
  "valid_to": null,
  "source_refs": []
}
```

Use namespaces such as:

```text
nunagis.global_id
nunagis.record_id
gar.locality_id
statistics_greenland.area_code
iata.airport_code
icao.airport_code
operator.location_code
```

The exact namespace names must be documented and stable.

### 5.3 Source and snapshot model

The current `source` record combines dataset identity and retrieval details. Split or extend it into four concepts.

| Entity | Purpose |
|---|---|
| `source_dataset` | Publisher, authority scope, access method, terms, licence, expected cadence |
| `source_snapshot` | URL, exact retrieval time, checksum, media type, schema fingerprint |
| `import_run` | Adapter version, counts, warnings, errors, previous snapshot |
| `change_event` | Added, modified, removed, conflicted, or remapped record |

A source snapshot must be immutable. A new retrieval creates a new snapshot.

### 5.4 Release model

Production consumers must use a named immutable release.

Example:

```text
2026.08.01.1
```

Each release should contain:

```text
release.json
manifest.json
changes.json
source-health.json
places.json / places.geojson / places.parquet
connections.json
services.json
search-index.json
identity-crosswalk.json
current SQLite database
optional PMTiles packages
```

The manifest should include:

```json
{
  "release_id": "2026.08.01.1",
  "created_at": "2026-08-01T22:00:00Z",
  "data_as_of": "2026-08-01",
  "schema_versions": {},
  "record_counts": {},
  "source_snapshot_ids": [],
  "checksums": {},
  "publication_blockers": []
}
```

### 5.5 Production data rule

Production builds must not fetch live upstream data directly.

Required flow:

```text
fetch snapshot
    ↓
validate snapshot and terms
    ↓
normalize
    ↓
diff previous snapshot
    ↓
review identity and factual changes
    ↓
publish named release
    ↓
build web and API from the release
```

The existing live fetch script can remain as an acquisition adapter, but it must write to a snapshot area rather than directly defining production truth.

---

## 6. Reachability and operational data model

### 6.1 Keep durable structure separate from changing service

Use these entities:

| Entity | Responsibility |
|---|---|
| `connection` | Durable relation between two canonical places and one mode |
| `service_pattern` | Operator, purpose, normal frequency, seasonality, validity |
| `dated_trip` | A particular published departure, voyage, or call |
| `service_alert` | Suspension, cancellation, delay, closure, or restriction |
| `condition_observation` | Weather, ice, runway, harbour, or other constraint |

Do not add all entities immediately if no source supports them. Define them when the first real source needs them.

### 6.2 Required status vocabulary

The UI and API must distinguish:

```text
structurally_connected
normally_served
scheduled_on_date
observed_operating
currently_disrupted
status_unknown
```

Never present `structurally_connected` as live travel availability.

### 6.3 Multiple service preservation

A connection can have several active service assertions.

The export must return all applicable services for the effective date:

```json
{
  "connection_id": "con_...",
  "origin_place_id": "plc_...",
  "destination_place_id": "plc_...",
  "mode": "helicopter",
  "services": [
    {
      "service_id": "svc_...",
      "operator": "Air Greenland",
      "capabilities": ["passenger", "freight"],
      "frequency_band": "multiple_daily",
      "frequency_basis": "published_maximum",
      "valid_from": "2026-04-16",
      "valid_to": null,
      "status": "active",
      "source_refs": []
    }
  ]
}
```

### 6.4 Effective-date query

Every reachability query should require or default an effective date.

```text
Given place_id and effective date:
1. Find structural edges active on the date.
2. Find every service assertion valid on the date.
3. Filter by requested capability and mode.
4. Preserve unknown and conflicting status.
5. Return evidence and freshness with every result.
```

### 6.5 Isolation and loss-of-access analysis

After the structural network is complete, calculate:

- Places with no structural passenger connection.
- Places dependent on one mode or one operator.
- Seasonal loss of connection.
- Freight and emergency capability gaps.
- Changes between releases that reduce access.

These analyses are likely more valuable than a generic route-line map.

---

## 7. Public API blueprint

### 7.1 API principles

1. Use canonical `place_id` for every operational join.
2. Return release and freshness metadata with factual responses.
3. Make effective dates explicit.
4. Preserve uncertainty and conflicts.
5. Provide bulk release files as well as HTTP endpoints.

### 7.2 Place discovery

```http
GET /v1/places?q=naajaat&language=kl
GET /v1/places?municipality=960&type=settlement
GET /v1/places?bbox=minLon,minLat,maxLon,maxLat
GET /v1/places/{place_id}?at=2026-08-01
```

### 7.3 Identity and evidence

```http
GET /v1/places/{place_id}/names?at=2026-08-01
GET /v1/places/{place_id}/identifiers
GET /v1/places/{place_id}/evidence
GET /v1/places/{place_id}/changes
POST /v1/places/resolve
```

### 7.4 Reachability

```http
GET /v1/places/{place_id}/connections?at=2026-08-01
GET /v1/places/{place_id}/connections?capability=freight
GET /v1/reachability?from=plc_...&to=plc_...&at=2026-08-01
GET /v1/reachability?from=plc_...&max_transfers=2&mode=sea,helicopter
```

### 7.5 Releases and standards

```http
GET /v1/releases/latest
GET /v1/releases/{release_id}/manifest
GET /v1/changes?since=2026.07.01.1
GET /v1/source-health
GET /ogc/collections/places/items
GET /ogc/collections/connections/items
GET /downloads/{release_id}/decision-geography.db
GET /tiles/{release_id}/places.pmtiles
```

### 7.6 Place resolution endpoint

Request:

```json
{
  "identifiers": [
    {
      "namespace": "nunagis.global_id",
      "value": "3151E3D0-67E9-47BA-B000-01EE34DBF2D1"
    }
  ],
  "name": "Aasiaat",
  "municipality_code": 959,
  "coordinates": [-52.87, 68.71]
}
```

Response:

```json
{
  "result": "candidate",
  "release_id": "2026.08.01.1",
  "candidates": [
    {
      "place_id": "plc_...",
      "confidence": 0.99,
      "reasons": [
        "external_identifier_exact",
        "official_name_exact",
        "municipality_exact"
      ]
    }
  ],
  "requires_confirmation": false
}
```

Name-and-coordinate-only resolution must not merge identities automatically.

### 7.7 Response metadata

Every factual response should expose:

```json
{
  "release_id": "2026.08.01.1",
  "data_as_of": "2026-08-01",
  "freshness": {
    "status": "current",
    "last_observed_at": "2026-08-01"
  },
  "source_refs": []
}
```

---

## 8. Greenland-first UI and UX

### 8.1 Information architecture

Use task-oriented navigation instead of internal dataset language.

Recommended primary sections:

```text
Places
Travel and freight
Public services
Weather and conditions
Sources and changes
```

Replace unclear labels such as `Lens`, `Responsibility`, and `+ Geography` with words users understand without documentation.

### 8.2 Desktop layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ Search current, old, Danish, or local name        │ KL │ DA │ EN │
├────────────────┬────────────────────────┬──────────────────────────┤
│ Results / list │ Map                    │ Place dossier            │
│                │                        │ Overview                 │
│ Disambiguation │ Selected place         │ Access                   │
│ Nearby places  │ Routes and conditions  │ Services                 │
│                │                        │ Sources and changes       │
└────────────────┴────────────────────────┴──────────────────────────┘
```

The list and dossier must remain useful without the map.

### 8.3 Mobile layout

```text
┌──────────────────────────────┐
│ Search                 KL ▾  │
├──────────────────────────────┤
│ List │ Map                  │
│                              │
│            map               │
│                              │
├──────────────────────────────┤
│ Place bottom sheet           │
│ Overview · Access · Sources  │
└──────────────────────────────┘
```

Use a bottom sheet with collapsed, half, and full states. Do not stack every control over the map bottom edge.

### 8.4 Search and ambiguity

Search must run against the complete local search index, not only the currently visible map layer.

Search fields should include:

```text
official Kalaallisut name
historical and spelling variants
Danish and international names
locality and municipality codes
external source identifiers
```

Show why similar results differ:

```text
Naajaat
Settlement · Avannaata Kommunia
Inhabited place near Upernavik

Naajat
Island group · Avannaata Kommunia
Geographical feature
```

Ranking alone is not sufficient for ambiguous Greenland names.

### 8.5 Place dossier

Recommended tabs:

| Tab | Content |
|---|---|
| Overview | Names, type, municipality, coordinates, identifiers |
| Access | Structural connections, services, purposes, seasonality |
| Services | Facilities, public services, capacity, responsibility |
| Conditions | Weather, ice, harbour, runway, and active alerts |
| Sources | Evidence, dates, changes, conflicts, and release metadata |

Only show tabs backed by data. Empty speculative sections should not appear.

### 8.6 Access planner

Use explicit context:

```text
From: Qaarsut
To: Uummannaq
Date: 2026-08-12
Purpose: Passenger | Freight | Emergency
```

Group results by meaning:

```text
Direct structural connections
Services valid on the selected date
Connections requiring transfer
Seasonal or suspended services
No current evidence
```

Every result should show its evidence date and source.

### 8.7 Trust and freshness

Use concise labels:

```text
Verified authority source
Operator-published
Local observation
Conflicting sources
Last checked 3 days ago
Offline copy from 2026-07-29
```

Do not use colour alone. Include icon, text, and accessible labels.

### 8.8 Language

Use Kalaallisut, Danish, and English resource files.

Rules:

1. Kalaallisut appears first in language selection.
2. Danish appears second and English third.
3. The browser document language changes with the selected language.
4. Operational terms require native review before release.
5. Search supports names from every available language regardless of UI language.

### 8.9 Offline and low-bandwidth operation

Provide two data tiers:

| Tier | Behaviour |
|---|---|
| Locality core | Loads immediately and remains available offline |
| Full gazetteer | Lazy-loads or downloads by municipality or region |

The product should show:

```text
Downloaded region
Snapshot date
Release ID
Estimated package size
Update available
```

Self-host fonts and production map assets. Do not require Google Fonts or a third-party style endpoint for basic operation.

### 8.10 Recommended components

| Component | Responsibility |
|---|---|
| `AppShell` | Desktop and mobile responsive structure |
| `GlobalPlaceSearch` | Multilingual complete-index search |
| `PlaceResultCard` | Disambiguation and identity status |
| `PlaceDossier` | Overview, access, services, conditions, sources |
| `AccessPlanner` | Date, origin, destination, and purpose query |
| `SourceEvidenceDrawer` | Provenance and release details |
| `MapLayerMenu` | User-facing map content groups |
| `MobilePlaceSheet` | Mobile dossier interaction |
| `OfflineStatus` | Package, release, freshness, and network state |
| `PlaceList` | Non-map access and keyboard navigation |

---

## 9. Technical stack

### 9.1 Keep

| Area | Current choice | Decision |
|---|---|---|
| Frontend | React 19, Vite, TypeScript | Keep |
| Map | MapLibre GL | Keep |
| UI primitives | Cloudflare Kumo | Keep where accessible and stable |
| Domain validation | Effect Schema | Keep at data and service boundaries |
| Data build | Python, JSON Schema, SQLite | Keep |

### 9.2 Add when the corresponding phase begins

| Capability | Recommended option |
|---|---|
| URL and place navigation | TanStack Router |
| Remote and release data caching | TanStack Query |
| Localization | Lingui or FormatJS |
| Offline shell and packages | Workbox or Vite PWA plus IndexedDB |
| Thin read API | Hono with a repository adapter and generated OpenAPI |

The integrator may choose FastAPI instead of Hono only if repository inspection shows a materially simpler and better-supported implementation. Document the trade-off before changing the recommendation.

### 9.3 Read API storage

Start with generated SQLite.

Recommended adapters:

```text
SqliteRepository for Omarchy or container deployment
D1Repository only if Cloudflare deployment becomes necessary
StaticReleaseRepository for purely file-based fallback
```

Do not introduce PostgreSQL or PostGIS until concurrent editing, user accounts, spatial transactions, or larger analytical workloads require it.

### 9.4 Search implementation

```text
Locality index          → eager load
Full gazetteer index    → Web Worker
Offline regional index  → IndexedDB
Server search           → SQLite FTS5
```

Search should return canonical and upstream-only records with clear identity status.

### 9.5 Suggested repository structure

```text
api/
├── src/
│   ├── routes/
│   ├── repository/
│   ├── contracts/
│   └── index.ts

data/
├── raw/
├── schema/
├── source/
├── snapshots/
├── reconciliation/
├── releases/
└── scripts/
web/
├── src/
│   ├── domain/
│   ├── features/
│   ├── routes/
│   ├── services/
│   ├── ui/
│   └── i18n/
└── public/
    └── releases/
```

Do not reorganize the repository merely to match this tree. Move files only when the current phase benefits from the change.

---

## 10. Valuable data sources and endpoints

Every endpoint below is a candidate integration source. The implementation agent must inspect current metadata, access terms, licences, schema, update cadence, and stable identifiers before production use.

### 10.1 Use first

| Source | Primary use | Current endpoint or entry point |
|---|---|---|
| NunaGIS place register | Names, aliases, types, municipality, locality codes, source IDs | `https://kort.nunagis.gl/refserver/rest/services/PlacenamesRegister/PlacenamesRegisterPublic/MapServer` |
| NunaGIS midpoint layer | Searchable map points and current prototype import | `https://kort.nunagis.gl/refserver/rest/services/PlacenamesRegister/PlacenamesRegisterSearch/MapServer/1` |
| Greenland Address Register | Addresses, roads, units, locality linkage | `https://kort.nunagis.gl/refserver/rest/services/Grunddataregistre/Adresseregister_offentlig/MapServer` |
| Statistics Greenland | Population and demographic measures by locality and period | `https://bank.stat.gl/api/v1/{language}/Greenland` |
| DMI Open Data | Observations, stations, forecasts, and environmental context | `https://opendataapi.dmi.dk/` |

### 10.2 Add after the locality spine

| Source | Potential value | Integration rule |
|---|---|---|
| Royal Arctic Line | Freight routes, settlement schedules, notices | Snapshot dated documents and seek a structured partner feed |
| Air Greenland | Scheduled passenger and freight relationships | Use direct agreement or stable structured source |
| Greenland Airports | Airport and heliport activity and operational information | Separate published schedules from observed operations |
| Copernicus Marine | Sea ice and ocean conditions | Present as timestamped environmental evidence |
| ArcticDEM | Terrain and remote-access analysis | Use for analytical layers, not live access status |

### 10.3 Later public-service sources

Potential datasets include:

```text
health facilities
schools and education
municipal service offices
energy and water infrastructure
telecommunications and connectivity
emergency and response assets
```

Add each dataset only after defining:

```text
field authority
stable external identifiers
update cadence
effective-date behaviour
licence and redistribution status
operational question supported
```

### 10.4 Source adapter contract

Each adapter must produce:

```json
{
  "source_dataset_id": "srcd_...",
  "snapshot_id": "snap_...",
  "retrieved_at": "2026-08-01T20:00:00Z",
  "request": {},
  "response_checksum": "sha256:...",
  "schema_fingerprint": "sha256:...",
  "record_count": 0,
  "licence_status": "verified|unknown|restricted",
  "warnings": []
}
```

Adapter rules:

1. Preserve stable upstream identifiers.
2. Store raw snapshots when terms allow.
3. Record a manifest when raw storage is prohibited.
4. Fail clearly on schema drift.
5. Never silently normalize conflicting facts.

### 10.5 Licensing policy

Source discovery does not imply permission to redistribute.

A public release must fail when:

- Licence or terms are unknown for redistributed content.
- Required attribution is missing.
- A source prohibits the intended use.
- A source record cannot be traced.
- A derived claim exceeds the source's authority scope.

Unknown terms may be used for local evaluation only when the repository clearly marks the restriction.

---

## 11. Implementation roadmap

The primary integrator owns sequencing. Subagents may work in parallel only when file ownership and dependencies do not overlap.

### Phase 0 — Baseline and protect the repository

**Objective:** Establish the exact current state before changing architecture.

#### Actions

1. Read `AGENTS.md`, `docs/STATUS.md`, `README.md`, schemas, validators, and current web domain files.
2. Inspect the active branch, uncommitted changes, recent commits, and current deployment assumptions.
3. Run the complete existing validation and web test suite.
4. Record current canonical counts, generated outputs, and known expected failures.
5. Create a working branch without resetting or discarding user changes.

#### Required commands

```bash
git status --short --branch
git log --oneline -10
make -C data validate
make -C data test
make -C data publish-check
pnpm --dir web install --frozen-lockfile
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web build
```

`publish-check` may fail because legacy provenance remains pending. Record the exact blocker rather than treating it as a regression.

#### Deliverable

Create or update an implementation ledger containing:

```text
current branch
baseline commit
working tree state
commands and exact results
record counts
known blockers
phase being executed
```

#### Exit gate

No code work begins until baseline results and user changes are understood.

---

### Phase 1 — Canonical identity end-to-end

**Objective:** Remove every operational join based on place names.

#### Actions

1. Define `featureId`, nullable `placeId`, and `identityStatus` for map records.
2. Generate a source-feature-to-place crosswalk from confirmed external identifiers.
3. Refactor reachability helpers and selection flows to accept `placeId`.
4. Prevent operational panels for upstream-only features without canonical identity.
5. Add duplicate-name, rename, alias, and unresolved-identity tests.

#### Main files

```text
web/src/domain/placename.ts
web/src/domain/reachability.ts
web/src/domain/search.ts
web/src/ui/App.tsx
web/src/ui/MapCanvas.tsx
web/scripts/export-reachability-graph.py
data/source/external-identifiers.ndjson
data/scripts/build.py
```

#### Required behaviour

```text
Search may match a name.
Search returns an entity or feature identity.
Every subsequent operational action uses placeId.
No connection, service, facility, or observation joins by display name.
```

#### Exit gate

- No active function equivalent to `linksFromOfficialName` remains in operational code.
- A renamed place still resolves its historical service links through `placeId`.
- Two features with the same name never share operational data accidentally.
- Data validation, web tests, typecheck, and build pass.

---

### Phase 2 — Immutable source snapshots and releases

**Objective:** Ensure production data is reproducible, reviewable, and versioned.

#### Actions

1. Define source dataset, snapshot, import run, and change-event contracts.
2. Change live fetchers to write immutable snapshot output and manifests.
3. Add normalization and previous-snapshot diff stages.
4. Generate a named release with checksums and source health.
5. Make web and API builds consume a selected release only.

#### Required outputs

```text
data/snapshots/<source>/<timestamp>/
data/releases/<release_id>/manifest.json
data/releases/<release_id>/changes.json
data/releases/<release_id>/source-health.json
```

#### Publication rules

```text
No direct upstream-to-public-data path
No mutable release directory
No unrecorded schema drift
No unknown redistribution status in a public release
No generated artefact without checksum
```

#### Exit gate

Two clean builds from the same release produce identical data content and checksums.

---

### Phase 3 — Complete the operational locality spine

**Objective:** Reconcile every qualifying inhabited and serviced locality to authoritative identities.

#### Actions

1. Finalize the inclusion rule for inhabited and serviced localities.
2. Reconcile every qualifying NunaGIS Type 21 and 23 record.
3. Add authoritative names, geometry, memberships, and external identifiers.
4. Resolve or document homonyms, historical names, and source conflicts.
5. Replace legacy source references assertion by assertion.

#### Review requirements

```text
Exact name matches remain candidates until explicitly confirmed.
Geometry authority is evaluated separately from naming authority.
A conflict remains visible until resolved.
Existing plc_ IDs never change because an attribute changes.
New IDs are minted only after existing identities are checked.
```

#### Exit gate

- The locality spine has complete authoritative coverage.
- Identity collisions are zero or explicitly blocked from publication.
- Every published assertion has traceable evidence.
- `make -C data publish-check` passes for the locality core.

---

### Phase 4 — Versioned read API and complete search

**Objective:** Make the identity layer reusable by the web product and other Greenland systems.

#### Actions

1. Define versioned API contracts and effective-date semantics.
2. Implement place discovery, identity, evidence, release, and basic connection endpoints.
3. Build SQLite FTS search across every available name and identifier.
4. Generate typed frontend clients from the API contract.
5. Add cache headers, ETags, and release metadata.

#### Required endpoint groups

```text
/v1/places
/v1/places/{place_id}
/v1/places/{place_id}/identifiers
/v1/places/{place_id}/evidence
/v1/places/resolve
/v1/releases
/v1/source-health
```

#### Exit gate

- Search does not depend on current map filters.
- Search finds official, historical, Danish, and alternative names.
- Every operational response includes release and freshness metadata.
- API contract and integration tests pass.

---

### Phase 5 — Greenland-first web application

**Objective:** Turn the map prototype into an intuitive place and access product.

#### Actions

1. Implement desktop list-map-dossier layout and mobile bottom sheet.
2. Add Kalaallisut, Danish, and English resource files and switching.
3. Replace internal data labels with user-facing concepts.
4. Add ambiguous-name result cards and a non-map place list.
5. Add source, freshness, conflict, and offline-state components.

#### Design rules

```text
Map supports the task; it does not replace the task.
Every map interaction has a list or keyboard equivalent.
Colour never carries meaning alone.
User language and data language are separate.
Upstream-only and canonical identities look different.
```

#### Exit gate

- Core place discovery works in all three languages.
- Mobile interaction does not hide essential map controls.
- Keyboard navigation and screen-reader checks pass.
- Offline locality search works from a saved release.

---

### Phase 6 — Date-aware reachability

**Objective:** Expand the tracer bullet into a trustworthy access graph.

#### Actions

1. Export every active service assertion rather than only the first.
2. Apply `valid_from` and `valid_to` for the requested effective date.
3. Add capability, mode, operator, and seasonality filtering.
4. Return structural, normal-service, disruption, and unknown states separately.
5. Add isolation, single-dependency, and seasonal-loss reports.

#### Required tests

```text
multiple active services on one connection
future service excluded before valid_from
expired service excluded after valid_to
bidirectional and one-way behaviour
unknown status remains unknown
```

#### Exit gate

A query for one place and date returns every applicable connection and service with evidence, without implying live availability.

---

### Phase 7 — Operational source adapters and offline regions

**Objective:** Add the first high-value domain joins without losing trust or maintainability.

#### Actions

1. Add Statistics Greenland population joins using stable place mappings.
2. Add one reviewed transport source adapter, preferably RAL or a partner feed.
3. Add DMI observations or forecasts as clearly separated condition data.
4. Generate municipality or regional offline packages.
5. Add source health and upstream-change review screens.

#### Source selection rule

Choose one source at a time based on:

```text
authority
stable identifiers
licence
update reliability
operational value
```

#### Exit gate

A maintainer can fetch, diff, review, rebuild, and publish the selected sources without manual data surgery.

---

## 12. Dependency order

```text
Phase 0 baseline
    ↓
Phase 1 canonical identity
    ↓
Phase 2 snapshots and releases
    ↓
Phase 3 locality spine
    ├───────────────┐
    ↓               ↓
Phase 4 API      Phase 5 UI foundations
    └───────┬───────┘
            ↓
Phase 6 reachability
            ↓
Phase 7 operational sources
```

UI shell, component exploration, and accessibility research may begin earlier on a separate branch. They must not define new real-world data or bypass identity and release rules.

---

## 13. Primary integrator execution prompt

Copy the following section to the Grok 4.5 Max primary agent, or place this entire document in the repository and point the agent to it.

```text
You are the primary integrator for Arko-93/nunat-aqqinik-nalunaarsuiffik.

Your model is Grok 4.5 Max. You may create Composer 2.5 Max subagents. You decide the number of subagents after inspecting the repository, dependency graph, file ownership, and current working tree. Do not use a fixed number merely because this plan lists work lanes.

MISSION

Turn the repository into Greenland's trusted Place and Access Graph:

stable place identity → evidence and history → structural reachability → service, condition, and coverage layers → operational decisions.

The map is a product surface. The core moat is maintained identity, provenance, change history, source reconciliation, and Greenland-specific operational coverage.

STARTING RULES

1. Read AGENTS.md, docs/STATUS.md, README.md, this plan, every relevant schema, and every complete file you intend to change.
2. Inspect git status, branch, user changes, recent commits, build commands, and current deployment before editing.
3. Preserve all user work. Never reset, discard, overwrite, or clean files you did not create without explicit permission.
4. Work on a dedicated branch. Do not push, merge, publish, or open a pull request unless Ole explicitly requests it.
5. Run the strongest available tests yourself. Do not trust subagent completion claims without verification.

PRIMARY ARCHITECTURAL RULES

- A display name is never an operational foreign key.
- Canonical operational joins use place_id.
- Upstream-only map features use a source-scoped featureId and nullable placeId.
- Production consumes immutable named releases, not live upstream responses.
- Every real-world assertion requires traceable source evidence and effective dates.
- Unknown, conflicting, unavailable, and not applicable are different states.
- Structural reachability is not live availability.
- Keep the place identity core thin. Add domain entities only when a real source and decision need them.

SUBAGENT ORCHESTRATION

Use Composer 2.5 Max subagents for bounded work with non-overlapping ownership. You may split or combine the suggested lanes:

- identity and canonical data contracts
- snapshot, release, and provenance pipeline
- API, search, and generated clients
- UI, localization, offline, and accessibility
- reachability, tests, documentation, and migration

Before spawning a subagent, give it:

- one bounded objective
- exact files or directories it owns
- files it must not change
- dependencies and assumptions
- acceptance criteria
- required commands
- expected return format

Do not assign two subagents to modify the same cross-cutting file concurrently. Reserve integration files for yourself when practical.

SUBAGENT RETURN CONTRACT

Each subagent must return:

1. Files inspected.
2. Files changed.
3. Behaviour implemented.
4. Commands run with exact results.
5. Assumptions, risks, and unresolved blockers.

Reject or revise a subagent patch that broadens scope, invents facts, changes permanent IDs, weakens validation, or bypasses release provenance.

EXECUTION ORDER

Execute the phases in this plan. Complete the current phase gate before broadening the product domain. Parallel work is allowed only when the dependency graph and file ownership make it safe.

The first code phase is mandatory:

Canonical IDs end-to-end: remove official-name reachability joins.

Do not begin broad API, live data, or polished product work while operational joins still depend on names.

INTEGRATION METHOD

For every completed work packet:

1. Read the entire patch.
2. Check it against AGENTS.md, docs/STATUS.md, schemas, and this plan.
3. Resolve contract inconsistencies yourself.
4. Run data validation, tests, typecheck, web tests, and build.
5. Update status documentation and the implementation ledger.

QUALITY GATES

At minimum, preserve and run:

make -C data validate
make -C data test
make -C data publish-check
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web build

Add targeted tests for identity collisions, renamed places, multiple service assertions, effective dates, search aliases, mobile layouts, language switching, offline state, and evidence metadata as those features are implemented.

EXTERNAL DATA RULES

Open and inspect every primary source before adding a real-world fact. Record licence, terms, retrieval metadata, source identifiers, and authority scope. A URL alone is not provenance when the source exposes record identifiers or downloadable snapshots.

Do not scrape or redistribute a source merely because it is publicly visible. Unknown terms block public release.

COMMUNICATION WITH OLE

Start each update with the result, issue, or action. Use numbered steps for multi-step work. State the exact location, cause, and fix for errors. After changes, state what works and which command verified it. Do not promise background work or ask repeat questions already answered by the repository or current chat.

FINAL DELIVERY

Report:

- current branch and baseline commit
- phases completed
- files changed
- architecture decisions and rejected alternatives
- canonical record counts
- source and reconciliation status
- tests and exact results
- expected publication blockers
- screenshots or concise UI verification when relevant
- remaining work in dependency order

Do not claim completion when a gate has not run or a source remains unverified.
```

---

## 14. Suggested subagent work lanes

The primary integrator chooses the number of subagents. The following are boundaries, not required agent counts.

| Lane | Bounded responsibility | Avoid concurrent ownership of |
|---|---|---|
| Identity | Map feature identity, crosswalk, canonical joins, migration tests | `App.tsx` if UI lane is active |
| Provenance | Snapshot schemas, import runs, diffing, releases, manifests | Canonical identity contracts without coordination |
| API and search | HTTP contracts, SQLite queries, FTS, generated clients | Data schemas still changing in another lane |
| UI and language | App shell, dossier, bottom sheet, i18n, accessibility | Domain entity design |
| Reachability and QA | Multi-service export, effective dates, reports, integration tests | New external facts without source review |

The integrator should combine lanes when a boundary creates more coordination than useful parallelism.

---

## 15. Subagent task template

```markdown
# Task

## Objective
One bounded result.

## Context
Why this task exists and which phase gate it advances.

## Files owned
- Exact file or directory

## Do not change
- Exact files or contracts reserved by the integrator

## Required behaviour
1. Behaviour one.
2. Behaviour two.
3. Behaviour three.

## Constraints
- No real-world fact without a primary source.
- No name-based operational join.
- Preserve permanent IDs and user changes.

## Acceptance criteria
- Concrete observable result.
- Required tests.
- Required build command.

## Return
1. Files inspected.
2. Files changed.
3. Commands and exact results.
4. Risks and blockers.
```

---

## 16. File-level implementation map

### P0 identity work

| File | Expected change |
|---|---|
| `web/src/domain/placename.ts` | Add source feature identity, nullable canonical place identity, and identity status |
| `web/src/domain/reachability.ts` | Replace name lookup with place-ID lookup |
| `web/src/domain/search.ts` | Return identities while preserving multilingual name matching |
| `web/src/ui/App.tsx` | Select and navigate by identity rather than official name |
| `web/scripts/export-reachability-graph.py` | Preserve all applicable services and canonical IDs |

### Provenance and releases

| File or area | Expected change |
|---|---|
| `data/schema/` | Add snapshot, import-run, release, and change-event contracts |
| `data/scripts/` | Add fetch, normalize, diff, release, and publication gates |
| `data/raw/` or `data/snapshots/` | Store immutable upstream evidence |
| `data/releases/` | Store immutable named consumer releases |
| `docs/STATUS.md` | Track exact phase and source blockers |

### UI product work

| File or area | Expected change |
|---|---|
| `web/src/ui/` | Split map shell, search, dossier, and mobile sheet |
| `web/src/i18n/` | Add `kl`, `da`, and `en` resources |
| `web/src/routes/` | Add shareable place, date, and access URLs |
| `web/src/services/` | Release, API, offline, and freshness clients |
| `web/src/domain/` | Keep presentation-independent rules and contracts |

---

## 17. Tests and verification

### 17.1 Identity tests

```text
two features share the same official name
a place receives a new official name
an old Danish name finds the correct place
a source feature has no canonical identity
an exact-name candidate is not automatically merged
```

### 17.2 Reachability tests

```text
multiple services exist on one connection
service starts after the query date
service ends before the query date
one-way connection respects direction
unknown service status remains visible
```

### 17.3 Release tests

```text
same source and code produce identical checksums
schema drift produces a clear failure
removed upstream record appears in changes
unknown licence blocks public release
web build uses a selected release only
```

### 17.4 UI tests

```text
search works independently of map filter
Kalaallisut, Danish, and English switching works
same-name results explain their difference
mobile place sheet exposes core actions
keyboard-only place discovery works
```

### 17.5 Verification commands

```bash
make -C data validate
make -C data test
make -C data publish-check
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web build
```

Add Playwright and accessibility commands when those tools enter the repository.

---

## 18. Definition of done

### 18.1 Trusted identity milestone

The identity foundation is complete when:

- Every qualifying locality has a permanent canonical ID.
- Operational code contains no place-name foreign-key joins.
- Every published current name and geometry has source evidence.
- Every external source identifier is namespaced and traceable.
- The same release rebuilds reproducibly.

### 18.2 Useful product milestone

The first useful product is complete when:

- Users can find a place through current, old, or Danish names.
- Users can understand same-name results.
- Users can inspect place identity, municipality, access, and sources.
- Reachability answers are date-aware and preserve all services.
- The locality core works offline in Kalaallisut and Danish.

### 18.3 Operational moat milestone

The moat begins to compound when:

- Multiple public and partner datasets resolve to the same place IDs.
- Source changes produce reviewable diffs.
- Municipalities or operators depend on the crosswalk or access graph.
- Corrections and conflicts improve future releases.
- Operational reports reveal isolation, dependency, or service gaps.

---

## 19. Success metrics

| Metric | Meaning |
|---|---|
| Canonical locality coverage | Percentage of qualifying localities with confirmed `place_id` |
| Verified assertion coverage | Percentage of published claims with accepted evidence |
| Namespace coverage | Number of useful external systems mapped to canonical IDs |
| Source freshness | Age and health of each source snapshot |
| Access graph coverage | Localities with passenger, freight, or emergency edges |
| Change-review effort | Time and manual steps required to publish an upstream update |
| Product comprehension | Users correctly distinguish structural, scheduled, and live status |
| Offline coverage | Regions and releases available without network access |

Do not optimize record count alone. Optimize trustworthy decisions and maintainability.

---

## 20. Main risks

| Risk | Control |
|---|---|
| False identity merge | Require external IDs or explicit review; never merge by name alone |
| Unknown source rights | Block public release and record terms status |
| Stale data presented as live | Show effective date, observed date, freshness, and status meaning |
| Scope expansion before foundation | Enforce phase gates and one operational source at a time |
| UI hides uncertainty | Expose source, conflict, identity, and offline states in normal workflows |

---

## 21. Decisions to avoid

1. Do not expand across the Arctic before Greenland locality and access coverage is strong.
2. Do not call structural connections live routes or current availability.
3. Do not fetch upstream data directly during production web builds.
4. Do not add PostGIS, microservices, or event infrastructure without a measured need.
5. Do not let UI polish weaken provenance, validation, or effective-date rules.

---

## 22. First implementation issue

Create this issue or use it as the first primary-agent work packet.

```markdown
# Canonical IDs end-to-end: remove official-name reachability joins

## Objective
Make every operational connection between the map, search, and reachability graph use canonical `place_id`.

## Scope
- `web/src/domain/placename.ts`
- `web/src/domain/reachability.ts`
- `web/src/domain/search.ts`
- `web/src/ui/App.tsx`
- `web/src/ui/MapCanvas.tsx`
- `web/scripts/export-reachability-graph.py`
- generated crosswalk output

## Required behaviour
1. Every map feature has a source-scoped `featureId`.
2. Reconciled entities have a canonical `placeId`.
3. Upstream-only features have `placeId: null` and a visible identity status.
4. Reachability lookup accepts `placeId`, never an official name.
5. Navigation between connected places uses `placeId`.

## Acceptance criteria
- Duplicate names cannot cross-link operational data.
- A renamed place retains its connections.
- Upstream-only features cannot display canonical operational claims.
- All data and web tests pass.
- The integrator confirms no operational name join remains.
```

---

## 23. Final implementation principle

The project should become more useful through trusted joins, not through an increasing number of map layers.

The durable sequence is:

```text
identity first
provenance second
release discipline third
locality coverage fourth
API and product fifth
operational sources sixth
Arctic expansion last
```

That sequence gives the project a stronger technical foundation, a clearer Greenland-specific product, and a moat that compounds through maintenance and use.
