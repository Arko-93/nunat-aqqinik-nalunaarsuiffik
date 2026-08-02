# Immutable source snapshots

Upstream evidence is stored under:

```text
snapshots/<source_slug>/<retrieval_timestamp>/
  manifest.json          # source_snapshot contract
  <payload files>
```

Rules:

- A new retrieval creates a new timestamp directory; never overwrite an existing snapshot.
- Each snapshot manifest records checksum, `retrieved_at`, and `licence_status`.
- `licence_status: unknown` is allowed for development but becomes a publication blocker in releases.
- Register datasets in `source-datasets.ndjson` before writing snapshots.

Acquisition adapters (for example `fetch_nunagis_placenames.py`) write here first. Legacy copies under `data/raw/` remain for backward compatibility until callers migrate.

Register an existing raw snapshot:

```sh
make -C data register-snapshot
```
