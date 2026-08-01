# Agent implementation prompt

Copy the prompt below into a coding agent with this repository as its working directory.

---

You are implementing Decision Geography in this repository.

Start by reading these files completely, in this order:

1. `AGENTS.md`
2. `docs/STATUS.md`
3. `README.md`
4. Every file under `data/schema/`
5. `data/scripts/validate.py`
6. `data/Makefile`

## Goal

Build Greenland's small, continuously maintained geographic identity layer and its first operational extension: structural reachability.

The system exists so public organisations can join fragmented datasets by stable place identity and answer:

> Given a place and an effective date, which other places are structurally reachable, by which modes, under what seasonal constraints, and according to which evidence?

Optimise for trusted operational decisions, not record count, interface polish, or speculative scope.

## Your assignment

Implement **Phase 2 — Establish authoritative place provenance** from `docs/STATUS.md`.

Advance the phase as an evidence-preserving reconciliation:

- Oqaasileriffik replied 2026-07-30 with the public NunaGIS PlacenamesRegister path; a dated seed-name snapshot and Type 21/23 authority file already exist. Asiaq is still pending. Do not resend the Oqaasileriffik request; begin from review confirmation and any Asiaq reply or files supplied by the user.
- Read `data/reconciliation/README.md`, normalize received exports into its staging contract, and regenerate the 15-place review queue.
- Record its licence, retrieval metadata, upstream IDs, and raw snapshot or manifest.
- Reconcile the 15 seed places against authority records without changing their `plc_` IDs.
- Add external identifiers when the authority exposes stable upstream IDs.
- Replace `src_legacy_seed` references assertion by assertion only when evidence supports them.
- Record discrepancies and unresolved matches instead of silently normalising them.
- Keep schemas, validation, distributions, SQLite, and status documentation synchronized.

## Non-negotiable rules

- Never invent or infer a real-world fact.
- Do not add a place name, coordinate, municipality, route, operator, capability, seasonality, frequency, or status without a traceable primary source.
- Existing records reference a pending legacy source. Preserve that status until each assertion is verified.
- `publish-check` must fail while published assertions depend on pending sources.
- Names, slugs, municipalities, coordinates, operators, and upstream IDs are not identity.
- Never change an existing permanent ID to reflect changed attributes.
- Generated files under `data/dist/` are outputs, never inputs.
- Unknown properties must fail schema validation.
- Preserve history with validity periods; do not overwrite past truth.
- Keep live departures, delays, fares, inventory, booking, UI work, and later domain extensions out of scope.

## Implementation approach

1. Inspect the current source model and map each seed place to its current assertions.
2. Acquire and register the field-appropriate primary source before changing real-world data.
3. Produce a reconciliation report: matched, conflicting, missing, and unresolved.
4. Apply only unambiguous verified matches while preserving permanent IDs and history.
5. Run all gates and inspect generated distributions and SQLite.

Use standard-library tooling where practical. If adding a dependency is necessary for standards-compliant JSON Schema validation, justify it, pin it, and document how to install and run it. Do not create a web application.

## Required validation behaviour

At minimum, demonstrate failures for:

- Malformed or duplicate IDs
- Unknown properties
- Broken foreign keys
- Unknown source references
- Reversed validity ranges
- Multiple current official Kalaallisut names for one place
- Invalid GeoJSON coordinate structure or WGS84 range
- A self-connection
- A duplicate structural edge, including reversed endpoints for a bidirectional edge
- Invalid seasonality/month combinations
- A historical assertion must be accepted when `valid_to` is valid and ordered
- A retired entity without `retired_at`
- A publication attempt containing pending provenance

## Completion evidence

Do not claim completion until you can report:

- Files changed
- Canonical record counts by type
- Fixture tests passed
- `make -C data validate` result
- `make -C data test` result
- Expected `make -C data publish-check` result
- SQLite foreign-key check result
- Reconciliation counts: matched, conflicting, missing, and unresolved
- Any Phase 2 exit condition that remains blocked

If authoritative source access is unavailable, stop the import work, record the exact access blocker in `docs/STATUS.md`, and do not compensate by adding guessed data.

Stop after Phase 2 passes its exit condition or the authoritative-source blocker is precisely documented. Do not begin Phase 3 expansion.

---
