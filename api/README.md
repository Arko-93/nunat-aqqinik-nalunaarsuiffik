# Decision Geography read API

Thin versioned read API over the generated release SQLite database (`decision-geography.db`).

## Prerequisites

- Node.js ≥ 22.13
- pnpm 11.x
- A built release at `data/releases/CURRENT` (default: `2026.08.01.1`)

## Quick start

From the repository root:

```sh
make api-dev
```

Or:

```sh
pnpm --dir api install
pnpm --dir api dev
```

The server listens on `http://127.0.0.1:8787` by default.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `DECISION_GEOGRAPHY_RELEASES_DIR` | `data/releases` | Release directory root |
| `DECISION_GEOGRAPHY_RELEASE_ID` | from `CURRENT` pointer | Pin a specific release |
| `PORT` | `8787` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |

## Endpoints (v1)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/releases/latest` | Active release pointer + freshness |
| GET | `/v1/releases/{release_id}/manifest` | Full manifest (ETag supported) |
| GET | `/v1/source-health` | Snapshot and publication blockers |
| GET | `/v1/places?q=` | Name search (FTS5 prefix; LIKE fallback) |
| GET | `/v1/places/{place_id}` | Place detail + names + geometry |
| GET | `/v1/places/{place_id}/identifiers` | External identifiers |
| GET | `/v1/places/{place_id}/connections?at=YYYY-MM-DD` | Structural connections + services valid on `at` |
| GET | `/v1/reports/isolation?at=YYYY-MM-DD` | Passenger isolation report for effective date |
| POST | `/v1/places/resolve` | Identifier/name resolution (candidates only) |

Every factual response includes `release_id`, `data_as_of`, and `freshness` where available.

## Tests

```sh
pnpm --dir api test
pnpm --dir api typecheck
```

## Search note

Place search prefers SQLite FTS5 (`place_names_fts`) over current names and place external identifiers, with prefix tokens (`"Nuuk"*`). Mid-string queries and older DBs without the FTS table fall back to SQL `LIKE`.
