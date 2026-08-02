#!/usr/bin/env python3
"""Build SQLite DB from canonical sources with historical tables and current views."""

import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = Path(os.environ.get("DECISION_GEOGRAPHY_SOURCE_DIR", DATA_DIR / "source"))
DIST_DIR = Path(os.environ.get("DECISION_GEOGRAPHY_DIST_DIR", DATA_DIR / "dist"))
DB_PATH = DIST_DIR / "decision-geography.db"


def read_ndjson(path):
    rows = []
    if path.exists():
        with path.open(encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if s:
                    rows.append(json.loads(s))
    return rows


def j(data):
    return json.dumps(data, ensure_ascii=False)


def build():
    places = read_ndjson(SOURCE_DIR / "places.ndjson")
    classifications = read_ndjson(SOURCE_DIR / "place-classifications.ndjson")
    names = read_ndjson(SOURCE_DIR / "place-names.ndjson")
    geoms = read_ndjson(SOURCE_DIR / "place-geometries.ndjson")
    areas = read_ndjson(SOURCE_DIR / "administrative-areas.ndjson")
    memberships = read_ndjson(SOURCE_DIR / "administrative-memberships.ndjson")
    ext_ids = read_ndjson(SOURCE_DIR / "external-identifiers.ndjson")
    connections = read_ndjson(SOURCE_DIR / "connections.ndjson")
    services = read_ndjson(SOURCE_DIR / "connection-services.ndjson")
    sources = read_ndjson(SOURCE_DIR / "sources.ndjson")

    if DB_PATH.exists():
        DB_PATH.unlink()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA journal_mode = WAL")

    db.executescript("""
        CREATE TABLE sources (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            publisher TEXT,
            url TEXT,
            retrieved_at TEXT,
            effective_from TEXT,
            effective_to TEXT,
            media_type TEXT,
            checksum TEXT,
            licence TEXT,
            verification_status TEXT NOT NULL,
            notes TEXT
        );

        CREATE TABLE places (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            retired_at TEXT,
            source_refs_json TEXT NOT NULL,
            CHECK (retired_at IS NULL OR status = 'retired')
        );

        CREATE TABLE place_classifications (
            id TEXT PRIMARY KEY,
            place_id TEXT NOT NULL REFERENCES places(id),
            feature_type TEXT NOT NULL,
            valid_from TEXT,
            valid_to TEXT,
            source_refs_json TEXT NOT NULL,
            observed_at TEXT NOT NULL
        );

        CREATE TABLE place_names (
            id TEXT PRIMARY KEY,
            place_id TEXT NOT NULL REFERENCES places(id),
            value TEXT NOT NULL,
            language TEXT NOT NULL,
            kind TEXT NOT NULL,
            valid_from TEXT,
            valid_to TEXT,
            source_refs_json TEXT NOT NULL,
            observed_at TEXT NOT NULL
        );

        CREATE TABLE place_geometries (
            id TEXT PRIMARY KEY,
            place_id TEXT NOT NULL REFERENCES places(id),
            geometry_json TEXT NOT NULL,
            valid_from TEXT,
            valid_to TEXT,
            source_refs_json TEXT NOT NULL,
            observed_at TEXT NOT NULL
        );

        CREATE TABLE administrative_areas (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            level TEXT NOT NULL,
            source_refs_json TEXT NOT NULL
        );

        CREATE TABLE administrative_memberships (
            id TEXT PRIMARY KEY,
            place_id TEXT NOT NULL REFERENCES places(id),
            administrative_area_id TEXT NOT NULL REFERENCES administrative_areas(id),
            valid_from TEXT,
            valid_to TEXT,
            source_refs_json TEXT NOT NULL,
            observed_at TEXT NOT NULL
        );

        CREATE TABLE external_identifiers (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            namespace TEXT NOT NULL,
            value TEXT NOT NULL,
            valid_from TEXT,
            valid_to TEXT,
            source_refs_json TEXT NOT NULL
        );

        CREATE TABLE connections (
            id TEXT PRIMARY KEY,
            origin_place_id TEXT NOT NULL REFERENCES places(id),
            destination_place_id TEXT NOT NULL REFERENCES places(id),
            direction TEXT NOT NULL,
            mode TEXT NOT NULL,
            created_at TEXT NOT NULL,
            retired_at TEXT,
            CHECK (origin_place_id <> destination_place_id)
        );

        CREATE TABLE connection_services (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL REFERENCES connections(id),
            operator TEXT,
            capabilities_json TEXT NOT NULL,
            seasonality_json TEXT NOT NULL,
            frequency_band TEXT NOT NULL,
            frequency_basis TEXT NOT NULL,
            status TEXT NOT NULL,
            valid_from TEXT,
            valid_to TEXT,
            source_refs_json TEXT NOT NULL,
            observed_at TEXT NOT NULL
        );

        CREATE INDEX idx_place_names_place ON place_names(place_id);
        CREATE INDEX idx_classifications_place
            ON place_classifications(place_id, valid_to);
        CREATE INDEX idx_place_names_current ON place_names(place_id, kind, language, valid_to);
        CREATE INDEX idx_geometries_place ON place_geometries(place_id);
        CREATE INDEX idx_memberships_place ON administrative_memberships(place_id);
        CREATE INDEX idx_memberships_area ON administrative_memberships(administrative_area_id);
        CREATE INDEX idx_ext_ids_entity ON external_identifiers(entity_id);
        CREATE INDEX idx_connections_origin ON connections(origin_place_id);
        CREATE INDEX idx_connections_dest ON connections(destination_place_id);
        CREATE INDEX idx_services_connection ON connection_services(connection_id);

        CREATE TRIGGER external_identifier_entity_insert
        BEFORE INSERT ON external_identifiers
        BEGIN
            SELECT CASE
                WHEN NEW.entity_type = 'place'
                     AND NOT EXISTS (SELECT 1 FROM places WHERE id = NEW.entity_id)
                    THEN RAISE(ABORT, 'external identifier place does not exist')
                WHEN NEW.entity_type = 'connection'
                     AND NOT EXISTS (SELECT 1 FROM connections WHERE id = NEW.entity_id)
                    THEN RAISE(ABORT, 'external identifier connection does not exist')
                WHEN NEW.entity_type = 'area'
                     AND NOT EXISTS (
                         SELECT 1 FROM administrative_areas WHERE id = NEW.entity_id
                     )
                    THEN RAISE(ABORT, 'external identifier area does not exist')
            END;
        END;

        CREATE TRIGGER external_identifier_entity_update
        BEFORE UPDATE OF entity_type, entity_id ON external_identifiers
        BEGIN
            SELECT CASE
                WHEN NEW.entity_type = 'place'
                     AND NOT EXISTS (SELECT 1 FROM places WHERE id = NEW.entity_id)
                    THEN RAISE(ABORT, 'external identifier place does not exist')
                WHEN NEW.entity_type = 'connection'
                     AND NOT EXISTS (SELECT 1 FROM connections WHERE id = NEW.entity_id)
                    THEN RAISE(ABORT, 'external identifier connection does not exist')
                WHEN NEW.entity_type = 'area'
                     AND NOT EXISTS (
                         SELECT 1 FROM administrative_areas WHERE id = NEW.entity_id
                     )
                    THEN RAISE(ABORT, 'external identifier area does not exist')
            END;
        END;

        CREATE VIEW current_places AS
        SELECT
            p.id,
            cn.value AS canonical_name_kl,
            cn.source_refs_json AS name_source_refs,
            pc.feature_type,
            pc.source_refs_json AS classification_source_refs,
            p.status,
            p.created_at,
            pg.geometry_json,
            pg.source_refs_json AS geometry_source_refs,
            adm.municipality,
            adm.municipality_id
        FROM places p
        LEFT JOIN place_classifications pc
            ON pc.place_id = p.id AND pc.valid_to IS NULL
        LEFT JOIN place_names cn
            ON cn.place_id = p.id AND cn.kind = 'official' AND cn.language = 'kl' AND cn.valid_to IS NULL
        LEFT JOIN place_geometries pg
            ON pg.place_id = p.id AND pg.valid_to IS NULL
        LEFT JOIN (
            SELECT m.place_id,
                   a.name AS municipality,
                   a.id AS municipality_id
            FROM administrative_memberships m
            JOIN administrative_areas a ON a.id = m.administrative_area_id
            WHERE m.valid_to IS NULL AND a.level = 'municipality'
        ) adm ON adm.place_id = p.id
        WHERE p.status != 'retired';

        CREATE VIEW current_connections AS
        SELECT
            c.id,
            c.origin_place_id,
            c.destination_place_id,
            c.direction,
            c.mode,
            cs.operator,
            cs.capabilities_json,
            cs.seasonality_json,
            cs.frequency_band,
            cs.frequency_basis,
            cs.status,
            cs.valid_from,
            cs.valid_to,
            cs.source_refs_json
        FROM connections c
        LEFT JOIN connection_services cs
            ON cs.connection_id = c.id AND cs.valid_to IS NULL
        WHERE c.retired_at IS NULL;
    """)

    def i(table, cols, rows):
        placeholders = ",".join("?" for _ in cols)
        col_names = ",".join(cols)
        db.executemany(f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})", rows)

    i("sources",
        ["id", "title", "publisher", "url", "retrieved_at", "effective_from", "effective_to",
         "media_type", "checksum", "licence", "verification_status", "notes"],
        [(s["id"], s["title"], s.get("publisher"), s.get("url"), s.get("retrieved_at"),
          s.get("effective_from"), s.get("effective_to"), s.get("media_type"),
          s.get("checksum"), s.get("licence"), s["verification_status"], s.get("notes"))
         for s in sources])

    i("places",
        ["id", "status", "created_at", "retired_at", "source_refs_json"],
        [(p["id"], p["status"], p["created_at"], p.get("retired_at"), j(p["source_refs"]))
         for p in places])

    i("place_classifications",
        ["id", "place_id", "feature_type", "valid_from", "valid_to", "source_refs_json", "observed_at"],
        [(c["id"], c["place_id"], c["feature_type"], c.get("valid_from"),
          c.get("valid_to"), j(c["source_refs"]), c["observed_at"])
         for c in classifications])

    i("place_names",
        ["id", "place_id", "value", "language", "kind", "valid_from", "valid_to", "source_refs_json", "observed_at"],
        [(n["id"], n["place_id"], n["value"], n["language"], n["kind"],
          n.get("valid_from"), n.get("valid_to"), j(n["source_refs"]), n["observed_at"])
         for n in names])

    i("place_geometries",
        ["id", "place_id", "geometry_json", "valid_from", "valid_to", "source_refs_json", "observed_at"],
        [(g["id"], g["place_id"], j(g["geometry"]), g.get("valid_from"), g.get("valid_to"),
          j(g["source_refs"]), g["observed_at"])
         for g in geoms])

    i("administrative_areas",
        ["id", "name", "level", "source_refs_json"],
        [(a["id"], a["name"], a["level"], j(a["source_refs"])) for a in areas])

    i("administrative_memberships",
        ["id", "place_id", "administrative_area_id", "valid_from", "valid_to", "source_refs_json", "observed_at"],
        [(m["id"], m["place_id"], m["administrative_area_id"], m.get("valid_from"), m.get("valid_to"),
          j(m["source_refs"]), m["observed_at"])
         for m in memberships])

    i("connections",
        ["id", "origin_place_id", "destination_place_id", "direction", "mode", "created_at", "retired_at"],
        [(c["id"], c["origin_place_id"], c["destination_place_id"], c["direction"], c["mode"],
          c["created_at"], c.get("retired_at"))
         for c in connections])

    i("connection_services",
        ["id", "connection_id", "operator", "capabilities_json", "seasonality_json", "frequency_band", "frequency_basis",
         "status", "valid_from", "valid_to", "source_refs_json", "observed_at"],
        [(s["id"], s["connection_id"], s.get("operator"), j(s["capabilities"]), j(s["seasonality"]),
          s["frequency_band"], s["frequency_basis"], s["status"], s.get("valid_from"), s.get("valid_to"),
         j(s["source_refs"]), s["observed_at"])
         for s in services])

    i("external_identifiers",
        ["id", "entity_type", "entity_id", "namespace", "value", "valid_from", "valid_to", "source_refs_json"],
        [(x["id"], x["entity_type"], x["entity_id"], x["namespace"], x["value"],
          x.get("valid_from"), x.get("valid_to"), j(x["source_refs"]))
         for x in ext_ids])

    db.commit()

    # FK integrity check
    fk_errors = list(db.execute("PRAGMA foreign_key_check"))
    db.close()

    if fk_errors:
        print(f"FK ERRORS: {fk_errors}")
        sys.exit(1)

    manifest_path = DIST_DIR / "manifest.json"
    if manifest_path.exists():
        digest = hashlib.sha256(DB_PATH.read_bytes()).hexdigest()
        with manifest_path.open(encoding="utf-8") as file:
            manifest = json.load(file)
        manifest.setdefault("sha256", {})["dist/decision-geography.db"] = digest
        with manifest_path.open("w", encoding="utf-8") as file:
            json.dump(manifest, file, indent=2)

    print(f"Built {DB_PATH}: {len(places)} places, {len(classifications)} classifications, {len(names)} names, "
          f"{len(connections)} connections, {len(services)} services, "
          f"{len(sources)} sources — FK check passed")


if __name__ == "__main__":
    build()
