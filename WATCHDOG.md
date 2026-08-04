# Watchdog notes

This project is Greenland's geographic identity layer. Data integrity and provenance beat record count. Review every change against these priorities.

## Ground truth rules

- Never invent or infer a real-world fact: place name, coordinate, municipality, route, operator, capability, seasonality, frequency, or status all require a traceable primary source.
- No assertion may be added while it still references a pending legacy source (`src_legacy_seed`). Replace references only with evidence, assertion by assertion.
- Permanent IDs (`plc_` and other stable ids) are identity. Never change one to reflect changed attributes.
- Names, slugs, municipalities, coordinates, operators, and upstream IDs are attributes, not identity.
- Generated files under `data/dist/` are outputs, never inputs. Do not edit or read truth from them.

## Schema and validation

- Unknown properties must fail schema validation — watch for new fields added to data without a matching schema change.
- Invalid GeoJSON structure, out-of-range WGS84 coordinates, malformed or duplicate IDs, broken foreign keys, and unknown source references must fail validation.
- No reversed validity ranges; historical assertions are valid only with ordered `valid_to`.
- At most one current official Kalaallisut name per place.
- No self-connections; no duplicate structural edges, including reversed endpoints of bidirectional edges.
- Invalid seasonality/month combinations must fail.
- A retired entity requires `retired_at`; a publication attempt containing pending provenance must fail `publish-check`.

## Process discipline

- Reconciliation reports must record matched, conflicting, missing, and unresolved counts — never silently normalise discrepancies away.
- Preserve history with validity periods; do not overwrite past truth.
- Keep schemas, validation, distributions, SQLite, and `docs/STATUS.md` synchronized in the same change.
- Scope: no live departures, delays, fares, inventory, booking, or UI work. No web application unless explicitly assigned.
- If an authoritative source is unavailable, stop the import, record the exact blocker in `docs/STATUS.md`, and do not compensate with guessed data.
