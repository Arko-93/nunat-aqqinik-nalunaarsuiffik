#!/usr/bin/env python3
"""Decision Geography validation and test runner."""

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker, ValidationError

DATA_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = DATA_DIR / "source"
SCHEMA_DIR = DATA_DIR / "schema"
TEST_DIR = DATA_DIR / "tests"

SOURCE = {
    "places.ndjson": "place.schema.json",
    "place-classifications.ndjson": "place-classification.schema.json",
    "place-names.ndjson": "place-name.schema.json",
    "place-geometries.ndjson": "place-geometry.schema.json",
    "administrative-areas.ndjson": "administrative-area.schema.json",
    "administrative-memberships.ndjson": "administrative-membership.schema.json",
    "external-identifiers.ndjson": "external-identifier.schema.json",
    "connections.ndjson": "connection.schema.json",
    "connection-services.ndjson": "connection-service.schema.json",
    "sources.ndjson": "source.schema.json",
}

def read_ndjson(path):
    rows = []
    if not path or not path.exists():
        return rows
    with path.open(encoding="utf-8") as f:
        for ln, line in enumerate(f, 1):
            s = line.strip()
            if not s:
                continue
            try:
                rows.append(json.loads(s))
            except json.JSONDecodeError as e:
                raise ValueError(f"{path.name}:{ln}: invalid JSON — {e}")
    return rows


def load_schema(name):
    p = SCHEMA_DIR / name
    with p.open(encoding="utf-8") as f:
        return json.load(f)


def schema_errors(records, schema, label):
    errs = []
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    for i, r in enumerate(records):
        try:
            validator.validate(r)
        except ValidationError as e:
            errs.append(f"{label}:{i+1}: {e.message}")
    return errs


class ValidationRunner:
    def __init__(self, source_dir):
        self.source_dir = Path(source_dir)
        self.records = {}
        self.errors = []

    def load(self):
        for fname in SOURCE:
            self.records[fname] = read_ndjson(self.source_dir / fname)

    def schema_check(self):
        for fname, sname in SOURCE.items():
            schema = load_schema(sname)
            self.errors.extend(schema_errors(self.records.get(fname, []), schema, fname))

    def id_uniqueness(self):
        seen = set()
        for fname, rows in self.records.items():
            for i, r in enumerate(rows):
                rid = r.get("id")
                if rid:
                    if rid in seen:
                        self.errors.append(f"Duplicate ID '{rid}' across source files")
                    seen.add(rid)

    def foreign_keys(self):
        plc = {r["id"] for r in self.records.get("places.ndjson", [])}
        con = {r["id"] for r in self.records.get("connections.ndjson", [])}
        adm = {r["id"] for r in self.records.get("administrative-areas.ndjson", [])}
        ids_by_type = {
            "place": plc,
            "connection": con,
            "area": adm,
        }

        for fname in (
            "place-classifications.ndjson",
            "place-names.ndjson",
            "place-geometries.ndjson",
        ):
            for i, r in enumerate(self.records.get(fname, [])):
                pid = r.get("place_id")
                if pid and pid not in plc:
                    self.errors.append(f"{fname}:{i+1}: place_id '{pid}' does not resolve")

        for i, r in enumerate(self.records.get("administrative-memberships.ndjson", [])):
            pid = r.get("place_id")
            aid = r.get("administrative_area_id")
            if pid and pid not in plc:
                self.errors.append(f"administrative-memberships.ndjson:{i+1}: place_id '{pid}' does not resolve")
            if aid and aid not in adm:
                self.errors.append(f"administrative-memberships.ndjson:{i+1}: administrative_area_id '{aid}' does not resolve")

        for i, r in enumerate(self.records.get("external-identifiers.ndjson", [])):
            eid = r.get("entity_id")
            entity_type = r.get("entity_type")
            valid_ids = ids_by_type.get(entity_type, set())
            if eid and eid not in valid_ids:
                self.errors.append(
                    f"external-identifiers.ndjson:{i+1}: entity_id '{eid}' "
                    f"does not resolve as {entity_type}"
                )

        for i, r in enumerate(self.records.get("connection-services.ndjson", [])):
            cid = r.get("connection_id")
            if cid and cid not in con:
                self.errors.append(f"connection-services.ndjson:{i+1}: connection_id '{cid}' does not resolve")

    def source_refs(self):
        src_ids = {r["id"] for r in self.records.get("sources.ndjson", [])}
        for fname in SOURCE:
            if fname == "sources.ndjson":
                continue
            for i, r in enumerate(self.records.get(fname, [])):
                for j, ref in enumerate(r.get("source_refs", [])):
                    sid = ref.get("source_id")
                    if sid and sid not in src_ids:
                        self.errors.append(f"{fname}:{i+1}: source_refs[{j}] unknown source '{sid}'")

    def validity_order(self):
        for fname in ("place-classifications.ndjson", "place-names.ndjson",
                       "place-geometries.ndjson",
                       "administrative-memberships.ndjson",
                       "connection-services.ndjson", "external-identifiers.ndjson"):
            for i, r in enumerate(self.records.get(fname, [])):
                vf = r.get("valid_from")
                vt = r.get("valid_to")
                if vf and vt and vf > vt:
                    self.errors.append(f"{fname}:{i+1}: valid_from '{vf}' > valid_to '{vt}'")

    def exactly_one_official_kl_name(self):
        by_place = {}
        for i, r in enumerate(self.records.get("place-names.ndjson", [])):
            if r.get("kind") == "official" and r.get("language") == "kl" and r.get("valid_to") is None:
                by_place.setdefault(r["place_id"], []).append(i + 1)
        active_places = {
            r["id"]
            for r in self.records.get("places.ndjson", [])
            if r.get("status") == "active"
        }
        for pid in sorted(active_places):
            lines = by_place.get(pid, [])
            if not lines:
                self.errors.append(
                    f"place-names.ndjson: active place '{pid}' has no current official KL name"
                )
            if len(lines) > 1:
                self.errors.append(f"place-names.ndjson: place '{pid}' has {len(lines)} current official KL names at rows {lines}")

    def exactly_one_current_classification(self):
        by_place = {}
        for i, record in enumerate(
            self.records.get("place-classifications.ndjson", [])
        ):
            if record.get("valid_to") is None:
                by_place.setdefault(record["place_id"], []).append(i + 1)
        active_places = {
            record["id"]
            for record in self.records.get("places.ndjson", [])
            if record.get("status") == "active"
        }
        for place_id in sorted(active_places):
            lines = by_place.get(place_id, [])
            if len(lines) != 1:
                self.errors.append(
                    "place-classifications.ndjson: active place "
                    f"'{place_id}' has {len(lines)} current classifications "
                    f"at rows {lines}"
                )

    def entity_lifecycle(self):
        for i, r in enumerate(self.records.get("places.ndjson", [])):
            if r.get("status") == "retired" and r.get("retired_at") is None:
                self.errors.append(f"places.ndjson:{i+1}: retired entity missing retired_at")
            if r.get("status") != "retired" and r.get("retired_at") is not None:
                self.errors.append(
                    f"places.ndjson:{i+1}: non-retired entity must not have retired_at"
                )

    def self_connections(self):
        for i, r in enumerate(self.records.get("connections.ndjson", [])):
            if r.get("origin_place_id") and r.get("destination_place_id"):
                if r["origin_place_id"] == r["destination_place_id"]:
                    self.errors.append(f"connections.ndjson:{i+1}: self-connection ({r['origin_place_id']})")

    def duplicate_edges(self):
        seen = {}
        for i, r in enumerate(self.records.get("connections.ndjson", [])):
            o, d, m, direction = r.get("origin_place_id",""), r.get("destination_place_id",""), r.get("mode",""), r.get("direction","")
            a, b = sorted([o, d]) if direction == "bidirectional" else (o, d)
            key = (a, b, m, direction)
            if all(key):
                if key in seen:
                    self.errors.append(f"connections.ndjson:{i+1}: duplicate edge {a} <-> {b} ({m}), first at row {seen[key]}")
                else:
                    seen[key] = i + 1

    def external_identifier_uniqueness(self):
        seen = {}
        for i, r in enumerate(self.records.get("external-identifiers.ndjson", [])):
            if r.get("valid_to") is not None:
                continue
            key = (r.get("namespace"), r.get("value"))
            if key in seen:
                self.errors.append(
                    f"external-identifiers.ndjson:{i+1}: duplicate current "
                    f"namespace/value {key}, first at row {seen[key]}"
                )
            else:
                seen[key] = i + 1

    def seasonality(self):
        for i, r in enumerate(self.records.get("connection-services.ndjson", [])):
            szn = r.get("seasonality", {})
            kind = szn.get("kind")
            months = szn.get("months", [])
            if kind == "year_round" and months:
                self.errors.append(f"connection-services.ndjson:{i+1}: year_round must have empty months")
            if kind == "seasonal" and not months:
                self.errors.append(f"connection-services.ndjson:{i+1}: seasonal must list months")


    def slug_uniqueness(self):
        import urllib.parse
        names = self.records.get("place-names.ndjson", [])
        plc = self.records.get("places.ndjson", [])
        kl = {}
        for n in names:
            if n.get("kind") == "official" and n.get("language") == "kl" and n.get("valid_to") is None:
                kl[n["place_id"]] = n["value"]
        slugs = {}
        for p in plc:
            pid = p["id"]
            name = kl.get(pid, pid)
            slug = urllib.parse.quote(name.lower().replace(" ", "-").replace("/", "-"), safe="-")
            slugs.setdefault(slug, []).append(pid)
        for slug, pids in slugs.items():
            if len(pids) > 1:
                self.errors.append(f"Duplicate slug '{slug}' for places: {', '.join(pids)}")

    def retired_entity_assertions(self):
        plc = {r["id"]: r for r in self.records.get("places.ndjson", [])}
        retired = {pid for pid, p in plc.items() if p.get("status") == "retired"}
        for fname in ("place-classifications.ndjson", "place-names.ndjson",
                      "place-geometries.ndjson",
                      "administrative-memberships.ndjson"):
            for i, r in enumerate(self.records.get(fname, [])):
                if r.get("place_id") in retired and r.get("valid_to") is None:
                    self.errors.append(f"{fname}:{i+1}: active assertion on retired place '{r['place_id']}'")

        retired_connections = {
            r["id"]
            for r in self.records.get("connections.ndjson", [])
            if r.get("retired_at") is not None
        }
        for i, r in enumerate(self.records.get("connection-services.ndjson", [])):
            if r.get("connection_id") in retired_connections and r.get("valid_to") is None:
                self.errors.append(
                    f"connection-services.ndjson:{i+1}: active service on retired "
                    f"connection '{r['connection_id']}'"
                )

    def assertion_sources_verified(self):
        srcs = {r["id"]: r for r in self.records.get("sources.ndjson", [])}
        for fname in ("places.ndjson", "place-classifications.ndjson",
                       "place-names.ndjson",
                       "place-geometries.ndjson", "administrative-areas.ndjson",
                       "administrative-memberships.ndjson",
                       "connection-services.ndjson", "external-identifiers.ndjson"):
            for i, r in enumerate(self.records.get(fname, [])):
                if r.get("valid_to") is not None:
                    continue
                for j, ref in enumerate(r.get("source_refs", [])):
                    sid = ref.get("source_id")
                    src = srcs.get(sid)
                    if src and src.get("verification_status") == "pending":
                        self.errors.append(f"{fname}:{i+1}: current assertion references pending source '{sid}'")

    def verified_source_metadata(self):
        for i, source in enumerate(self.records.get("sources.ndjson", [])):
            if source.get("verification_status") != "verified":
                continue
            if not source.get("url"):
                self.errors.append(
                    f"sources.ndjson:{i+1}: verified source '{source['id']}' has no URL"
                )
            if not source.get("retrieved_at"):
                self.errors.append(
                    f"sources.ndjson:{i+1}: verified source '{source['id']}' "
                    "has no retrieved_at"
                )

    def pending_sources(self):
        for i, r in enumerate(self.records.get("sources.ndjson", [])):
            if r.get("verification_status") == "pending":
                self.errors.append(f"sources.ndjson:{i+1}: source '{r['id']}' pending — blocks publish")

    def run_all(self, check_pending=False):
        self.load()
        self.schema_check()
        self.id_uniqueness()
        self.foreign_keys()
        self.source_refs()
        self.validity_order()
        self.exactly_one_official_kl_name()
        self.exactly_one_current_classification()
        self.entity_lifecycle()
        self.slug_uniqueness()
        self.retired_entity_assertions()
        self.self_connections()
        self.duplicate_edges()
        self.external_identifier_uniqueness()
        self.seasonality()
        if check_pending:
            self.pending_sources()
            self.assertion_sources_verified()
            self.verified_source_metadata()
        return self.errors


CROSS_EXPECTED = {
    "broken-fk": "does not resolve",
    "unknown-source": "unknown source",
    "reversed-validity": "valid_from",
    "current-with-valid-to": "has no current official",
    "multiple-canonical": "current official",
    "self-connection": "self-connection",
    "duplicate-edge": "duplicate edge",
    "duplicate-edge-reversed": "duplicate edge",
    "retired-no-date": "retired_at",
    "duplicate-id": "Duplicate ID",
    "pending-source": "pending",
    "year-round-with-months": "year_round",
    "duplicate-slug": "Duplicate slug",
    "retired-entity-active": "active assertion on retired place",
    "assertion-pending-source": "references pending source",
}


def run_fixture_tests():
    errors = []

    def test_schema(label, records, schema_name, expect_pass, expect_contains=None):
        schema = load_schema(schema_name)
        errs = schema_errors(records, schema, label)
        if expect_pass:
            if errs:
                errors.append(f"VALID EXPECTED but got errors: {label}: {'; '.join(errs)}")
            else:
                print(f"  ✓ {label} passed")
        else:
            if not errs:
                errors.append(f"INVALID EXPECTED but passed: {label}")
            elif expect_contains:
                if any(expect_contains in e for e in errs):
                    print(f"  ✓ {label} caught ({len(errs)} errors)")
                else:
                    errors.append(f"{label}: expected error containing '{expect_contains}', got: {errs}")
            else:
                print(f"  ✓ {label} caught ({len(errs)} errors)")

    def test_cross(label, source_dir, expect_contains, check_pending=False):
        runner = ValidationRunner(source_dir)
        errs = runner.run_all(check_pending=check_pending)
        if expect_contains:
            matched = any(expect_contains in e for e in errs)
            if matched:
                print(f"  ✓ cross/{label} — caught '{expect_contains}'")
            else:
                errors.append(f"cross/{label}: expected '{expect_contains}', got: {errs}")
        else:
            if errs:
                errors.append(f"cross/{label}: unexpected errors: {errs}")
            else:
                print(f"  ✓ cross/{label} passed")

    # --- Schema-level valid fixtures ---
    valid_dir = TEST_DIR / "valid"
    if valid_dir.exists():
        for p in sorted(valid_dir.iterdir()):
            if p.suffix != ".ndjson" or p.name not in SOURCE:
                continue
            rows = read_ndjson(p)
            test_schema(f"valid/{p.name}", rows, SOURCE[p.name], expect_pass=True)

    # --- Schema-level invalid fixtures ---
    for scenario, fname, expect_str in [
        ("malformed-id", "places.ndjson", "does not match"),
        ("unknown-property", "places.ndjson", "Additional properties"),
        ("bad-coordinates-lat", "place-geometries.ndjson", "is greater than the maximum of 90"),
        ("bad-coordinates-lon", "place-geometries.ndjson", "is greater than the maximum of 180"),
        ("bad-geometry-type", "place-geometries.ndjson", "is not one of"),
        ("invalid-seasonality-month", "connection-services.ndjson", "is greater than the maximum of 12"),
        ("invalid-date", "places.ndjson", "is not a 'date'"),
    ]:
        p = TEST_DIR / "invalid" / scenario / fname
        if not p.exists():
            continue
        rows = read_ndjson(p)
        test_schema(f"invalid/{scenario}", rows, SOURCE[fname], expect_pass=False, expect_contains=expect_str)

    # --- Cross-record fixtures ---
    cross_dir = TEST_DIR / "cross"
    if cross_dir.exists():
        for scenario in sorted(cross_dir.iterdir()):
            if scenario.is_dir():
                expect = CROSS_EXPECTED.get(scenario.name)
                check_pending = scenario.name in ("pending-source", "assertion-pending-source")
                test_cross(scenario.name, scenario, expect, check_pending=check_pending)

    place_fixture = read_ndjson(valid_dir / "places.ndjson")
    name_fixture = read_ndjson(valid_dir / "place-names.ndjson")
    if place_fixture and name_fixture:
        historical_name = dict(name_fixture[0])
        historical_name.update(
            {
                "id": "nam_00000000-0000-4000-8000-000000000003",
                "kind": "historical",
                "valid_from": "2020-01-01",
                "valid_to": "2023-12-31",
            }
        )
        runner = ValidationRunner(valid_dir)
        runner.records = {
            "places.ndjson": place_fixture,
            "place-names.ndjson": [name_fixture[0], historical_name],
        }
        runner.validity_order()
        runner.exactly_one_official_kl_name()
        if runner.errors:
            errors.append(
                "history/closed-assertion: unexpected errors: "
                + "; ".join(runner.errors)
            )
        else:
            print("  ✓ history/closed-assertion preserved")

    return errors


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["validate", "test", "publish-check"], default="validate")
    parser.add_argument("--source-dir", type=str, default=None)
    args = parser.parse_args()

    source_dir = Path(args.source_dir) if args.source_dir else SOURCE_DIR
    check_pending = args.mode == "publish-check"

    runner = ValidationRunner(source_dir)
    errors = runner.run_all(check_pending=check_pending)
    rec_counts = {f: len(runner.records[f]) for f in SOURCE if runner.records[f]}

    test_errors = []
    if args.mode in ("test", "publish-check"):
        print("Running test fixtures...")
        test_errors = run_fixture_tests()
        errors.extend(test_errors)

    if errors:
        header = "Validation errors" if args.mode == "validate" else args.mode.upper()
        print(f"\n{header} ({len(errors)}):")
        for e in errors[:30]:
            print(f"  ✗ {e}")
        if len(errors) > 30:
            print(f"  ... and {len(errors) - 30} more")
        print(f"\n❌ {args.mode.upper()} failed ({len(errors)} errors)")
        sys.exit(1)
    else:
        total = sum(rec_counts.values())
        active = sum(1 for v in rec_counts.values() if v > 0)
        print(f"\n✅ {args.mode.upper()} passed — {total} records across {active} source files")
        sys.exit(0)


if __name__ == "__main__":
    main()
