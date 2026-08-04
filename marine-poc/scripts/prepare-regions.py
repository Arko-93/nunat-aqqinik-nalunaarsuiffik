#!/usr/bin/env python3
"""Build a whole-Greenland offline marine package.

Places: clip web/public/data/placenames.geojson (NunaGIS midpoints, WGS84).
Land: OSM simplified land polygons (island-aware). NE 10m is too coarse —
it drops west-coast islands so towns appear in the sea.
Water: OSM water polygons, simplified for phone download size.

Place coordinates are not swapped here. Visual offshore bugs are land-fill
quality bugs until Asiaq settlement points replace NunaGIS midpoints.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
RAW = ROOT / "data" / "raw"
PACKAGES = ROOT / "public" / "packages"
PLACES_SRC = REPO / "web" / "public" / "data" / "placenames.geojson"
NE_LAND = RAW / "ne_10m_land.shp"
OSM_NATURAL = RAW / "gis_osm_natural_a_free_1.shp"
OSM_WATER = RAW / "gis_osm_water_a_free_1.shp"
OSM_LAND_ZIP = RAW / "simplified-land-polygons-complete-3857.zip"
OSM_LAND_SHP = (
    RAW
    / "simplified-land-polygons-complete-3857"
    / "simplified_land_polygons.shp"
)
OSM_LAND_URL = (
    "https://osmdata.openstreetmap.de/download/"
    "simplified-land-polygons-complete-3857.zip"
)

# Keep localities + higher-importance geography so packages stay phone-sized.
MIN_IMPORTANCE = 400
MAX_GEOGRAPHY = 6000
# Locality must sit on/near land fill (degrees ≈ 500 m at 70°N).
LOCALITY_LAND_TOLERANCE_DEG = 0.005


@dataclass(frozen=True)
class Region:
    slug: str
    package_id: str
    title_kl: str
    title_da: str
    title_en: str
    bbox: tuple[float, float, float, float]  # west, south, east, north
    description_en: str
    land_simplify_m: float = 1200.0  # Web Mercator metres (OSM land)
    land_simplify_deg: float = 0.0006  # WGS84 polish
    water_simplify: float = 0.0008
    include_beaches: bool = True
    include_water: bool = True


REGIONS: list[Region] = [
    Region(
        slug="greenland",
        package_id="greenland_2026-08-04_marine",
        title_kl="Kalaallit Nunaat",
        title_da="Grønland",
        title_en="Greenland",
        bbox=(-75.0, 59.5, -10.0, 84.0),
        description_en="Whole Greenland companion map — not for navigation.",
        land_simplify_m=1200.0,
        land_simplify_deg=0.0006,
        water_simplify=0.0012,
        include_beaches=False,
        include_water=True,
    ),
]


def sha256_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def in_bbox(lon: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    west, south, east, north = bbox
    return west <= lon <= east and south <= lat <= north


def is_locality(props: dict) -> bool:
    value = props.get("isLocality")
    return value is True or value == "true" or value == 1 or value == "1"


def clip_places(region: Region) -> tuple[Path, int, int]:
    if not PLACES_SRC.exists():
        raise SystemExit(f"Missing placenames at {PLACES_SRC}")

    fc = json.loads(PLACES_SRC.read_text(encoding="utf-8"))
    localities: list[dict] = []
    geography: list[dict] = []
    for feature in fc.get("features", []):
        geom = feature.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        lon, lat = float(coords[0]), float(coords[1])
        if not in_bbox(lon, lat, region.bbox):
            continue
        props = feature.get("properties") or {}
        if is_locality(props):
            localities.append(feature)
            continue
        importance = props.get("importance")
        if isinstance(importance, (int, float)) and importance >= MIN_IMPORTANCE:
            geography.append(feature)

    geography.sort(
        key=lambda feature: -float((feature.get("properties") or {}).get("importance") or 0)
    )
    geography = geography[:MAX_GEOGRAPHY]
    features = localities + geography

    out_dir = PACKAGES / region.slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "places.geojson"
    out.write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": features},
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    return out, len(localities), len(geography)


def _clip_shp(
    shp_path: Path,
    bbox_poly,
    filter_fn=None,
    simplify_tol: float = 0.00035,
):
    import shapefile  # type: ignore
    from shapely.geometry import mapping, shape  # type: ignore
    from shapely.ops import unary_union  # type: ignore

    reader = shapefile.Reader(str(shp_path))
    fields = [field[0] for field in reader.fields[1:]]
    parts = []
    for record in reader.iterShapeRecords():
        attrs = dict(zip(fields, record.record, strict=False))
        if filter_fn and not filter_fn(attrs):
            continue
        geom = shape(record.shape.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or not geom.intersects(bbox_poly):
            continue
        clipped = geom.intersection(bbox_poly)
        if not clipped.is_empty:
            parts.append(clipped)
    if not parts:
        return None
    merged = unary_union(parts).simplify(simplify_tol, preserve_topology=True)
    return mapping(merged)


def ensure_osm_land_shp() -> Path | None:
    if OSM_LAND_SHP.exists():
        return OSM_LAND_SHP
    RAW.mkdir(parents=True, exist_ok=True)
    if not OSM_LAND_ZIP.exists():
        print(f"Downloading island-aware land polygons…\n  {OSM_LAND_URL}")
        try:
            urllib.request.urlretrieve(OSM_LAND_URL, OSM_LAND_ZIP)
        except Exception as exc:  # noqa: BLE001
            print(f"  download failed: {exc}")
            return None
    print(f"Unpacking {OSM_LAND_ZIP.name}")
    shutil.unpack_archive(OSM_LAND_ZIP, RAW)
    return OSM_LAND_SHP if OSM_LAND_SHP.exists() else None


def _clip_osm_land_wgs84(region: Region):
    """Clip OSM simplified land (EPSG:3857) to region bbox → WGS84 mapping."""
    import shapefile  # type: ignore
    from pyproj import Transformer  # type: ignore
    from shapely.geometry import box, mapping, shape  # type: ignore
    from shapely.ops import transform, unary_union  # type: ignore

    shp = ensure_osm_land_shp()
    if shp is None:
        return None

    to_merc = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    to_wgs = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    west, south, east, north = region.bbox
    x0, y0 = to_merc.transform(west, south)
    x1, y1 = to_merc.transform(east, north)
    bbox_merc = box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))

    reader = shapefile.Reader(str(shp))
    parts = []
    for record in reader.iterShapes():
        geom = shape(record.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or not geom.intersects(bbox_merc):
            continue
        clipped = geom.intersection(bbox_merc)
        if not clipped.is_empty:
            parts.append(clipped)
    if not parts:
        return None

    merged = unary_union(parts).simplify(
        region.land_simplify_m, preserve_topology=True
    )
    wgs = transform(lambda x, y, z=None: to_wgs.transform(x, y), merged)
    wgs = wgs.simplify(region.land_simplify_deg, preserve_topology=True)
    # MapLibre + boat router need Polygon/MultiPolygon, not GeometryCollection.
    if wgs.geom_type == "GeometryCollection":
        polys = []
        for part in wgs.geoms:
            if part.geom_type == "Polygon":
                polys.append(part)
            elif part.geom_type == "MultiPolygon":
                polys.extend(list(part.geoms))
        if not polys:
            return None
        from shapely.geometry import MultiPolygon  # type: ignore

        wgs = MultiPolygon(polys) if len(polys) > 1 else polys[0]
    return mapping(wgs)


def clip_land(region: Region) -> tuple[Path, Path | None, str]:
    try:
        from shapely.geometry import box  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "Missing pyshp/shapely/pyproj. Activate marine-poc/.venv first."
        ) from exc

    bbox_poly = box(*region.bbox)
    land_source_name = "OpenStreetMap simplified land polygons (ODbL)"
    land_geom = _clip_osm_land_wgs84(region)
    if land_geom is None:
        print("  WARN: OSM land unavailable — falling back to Natural Earth 10m")
        print("  WARN: NE 10m omits many Greenland islands; towns may look offshore")
        if not NE_LAND.exists():
            raise SystemExit(f"Missing land source at {OSM_LAND_SHP} and {NE_LAND}")
        land_geom = _clip_shp(
            NE_LAND, bbox_poly, simplify_tol=region.land_simplify_deg
        )
        land_source_name = "Natural Earth 10m land (fallback — incomplete islands)"
    if land_geom is None:
        raise SystemExit(f"No land polygons for region {region.slug}")

    # Beaches add coastal texture; glaciers intentionally skipped.
    beach_geom = None
    if region.include_beaches and OSM_NATURAL.exists():
        beach_geom = _clip_shp(
            OSM_NATURAL,
            bbox_poly,
            filter_fn=lambda attrs: str(attrs.get("fclass") or "").lower()
            == "beach",
            simplify_tol=max(region.land_simplify_deg, 0.0002),
        )

    features = [
        {
            "type": "Feature",
            "properties": {
                "kind": "land",
                "source": land_source_name,
                "licence": "ODbL" if "OpenStreetMap" in land_source_name else "public domain",
                "safety": "not-for-navigation",
                "region": region.slug,
            },
            "geometry": land_geom,
        }
    ]
    if beach_geom is not None:
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "kind": "beach",
                    "source": "OpenStreetMap beaches (Geofabrik)",
                    "licence": "ODbL",
                    "safety": "not-for-navigation",
                    "region": region.slug,
                },
                "geometry": beach_geom,
            }
        )

    land_out = PACKAGES / region.slug / "land.geojson"
    land_out.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )

    water_out: Path | None = None
    if region.include_water and OSM_WATER.exists():
        water_geom = _clip_shp(
            OSM_WATER,
            bbox_poly,
            filter_fn=lambda attrs: str(attrs.get("fclass") or "").lower()
            in {
                "water",
                "riverbank",
                "reservoir",
                "wetland",
                "wetland_tidalflat",
                "wetland_marsh",
                "dock",
            },
            simplify_tol=region.water_simplify,
        )
        if water_geom is not None:
            water_out = PACKAGES / region.slug / "water.geojson"
            water_out.write_text(
                json.dumps(
                    {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "properties": {
                                    "kind": "water",
                                    "source": "OpenStreetMap water (Geofabrik)",
                                    "licence": "ODbL",
                                    "safety": "not-for-navigation",
                                },
                                "geometry": water_geom,
                            }
                        ],
                    },
                    separators=(",", ":"),
                ),
                encoding="utf-8",
            )

    parts = [land_source_name]
    if beach_geom is not None:
        parts.append("OpenStreetMap beaches")
    if water_out is not None:
        parts.append("OpenStreetMap water")
    source_label = " + ".join(parts)
    return land_out, water_out, source_label


def validate_localities_on_land(region: Region) -> None:
    """Fail the build if towns/villages sit far from the land fill."""
    from shapely.geometry import Point, shape  # type: ignore

    places_path = PACKAGES / region.slug / "places.geojson"
    land_path = PACKAGES / region.slug / "land.geojson"
    places = json.loads(places_path.read_text(encoding="utf-8"))
    land_fc = json.loads(land_path.read_text(encoding="utf-8"))
    land_parts = []
    for feature in land_fc.get("features", []):
        props = feature.get("properties") or {}
        if props.get("kind") != "land":
            continue
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        land_parts.append(geom)
    if not land_parts:
        raise SystemExit("Land validation failed: no land geometry")
    land = land_parts[0]
    for part in land_parts[1:]:
        land = land.union(part)

    offshore: list[str] = []
    checked = 0
    for feature in places.get("features", []):
        props = feature.get("properties") or {}
        if not is_locality(props):
            continue
        checked += 1
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        point = Point(float(coords[0]), float(coords[1]))
        if land.contains(point) or land.distance(point) <= LOCALITY_LAND_TOLERANCE_DEG:
            continue
        km = land.distance(point) * 111.0
        name = str(props.get("officialName") or props.get("name") or "?")
        offshore.append(f"{name} (~{km:.1f} km from land fill)")

    if offshore:
        preview = "\n  - ".join(offshore[:20])
        raise SystemExit(
            f"Land/locality mismatch for {region.slug}: "
            f"{len(offshore)}/{checked} localities off land fill.\n"
            f"  - {preview}\n"
            "Town coordinates are likely fine; rebuild land from OSM "
            "simplified land polygons (not Natural Earth 10m)."
        )
    print(f"  land check: {checked}/{checked} localities on/near land fill")


def write_ocean_bands(region: Region, land_path: Path) -> Path | None:
    """Context-only nearshore bands (distance-to-coast), not real bathymetry."""
    from shapely.geometry import box, mapping, shape  # type: ignore
    from shapely.ops import unary_union  # type: ignore

    land_fc = json.loads(land_path.read_text(encoding="utf-8"))
    parts = []
    for feature in land_fc.get("features", []):
        if (feature.get("properties") or {}).get("kind") != "land":
            continue
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        if not geom.is_empty:
            parts.append(geom)
    if not parts:
        return None
    land = unary_union(parts)
    bbox = box(*region.bbox)
    # Degrees ≈ km varies with latitude; bands are visual context only.
    near = land.buffer(0.04).difference(land).intersection(bbox)
    shelf = land.buffer(0.12).difference(land.buffer(0.04)).intersection(bbox)
    features = []
    for band, geom in (("nearshore", near), ("shelf", shelf)):
        if geom.is_empty:
            continue
        simplified = geom.simplify(0.002, preserve_topology=True)
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "kind": band,
                    "source": "derived land buffer — not GEBCO/IBCAO depth",
                    "safety": "not-for-navigation",
                },
                "geometry": mapping(simplified),
            }
        )
    if not features:
        return None
    out = PACKAGES / region.slug / "ocean-bands.geojson"
    out.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )
    return out


def write_style(
    region: Region,
    has_water: bool,
    has_ocean_bands: bool,
) -> Path:
    sources = {
        "land": {"type": "geojson", "data": "land.geojson"},
        "places": {"type": "geojson", "data": "places.geojson"},
    }
    layers: list[dict] = [
        {
            "id": "background",
            "type": "background",
            "paint": {"background-color": "#020c14"},
        },
        {
            "id": "land-fill",
            "type": "fill",
            "source": "land",
            "filter": ["==", ["get", "kind"], "land"],
            "paint": {
                "fill-color": "#243a2f",
                "fill-opacity": 0.98,
            },
        },
        {
            "id": "beach-fill",
            "type": "fill",
            "source": "land",
            "filter": ["==", ["get", "kind"], "beach"],
            "paint": {
                "fill-color": "#b8995a",
                "fill-opacity": 0.88,
            },
        },
        {
            "id": "land-outline",
            "type": "line",
            "source": "land",
            "filter": ["==", ["get", "kind"], "land"],
            "paint": {
                "line-color": "#8ec9a8",
                "line-width": 1.7,
            },
        },
    ]
    insert_at = 1
    if has_ocean_bands:
        sources["ocean-bands"] = {"type": "geojson", "data": "ocean-bands.geojson"}
        layers.insert(
            insert_at,
            {
                "id": "ocean-shelf",
                "type": "fill",
                "source": "ocean-bands",
                "filter": ["==", ["get", "kind"], "shelf"],
                "paint": {
                    "fill-color": "#071f2e",
                    "fill-opacity": 0.92,
                },
            },
        )
        layers.insert(
            insert_at + 1,
            {
                "id": "ocean-nearshore",
                "type": "fill",
                "source": "ocean-bands",
                "filter": ["==", ["get", "kind"], "nearshore"],
                "paint": {
                    "fill-color": "#0e3348",
                    "fill-opacity": 0.95,
                },
            },
        )
        insert_at += 2
    if has_water:
        sources["water"] = {"type": "geojson", "data": "water.geojson"}
        layers.insert(
            insert_at + 1,  # after land-fill
            {
                "id": "water-fill",
                "type": "fill",
                "source": "water",
                "paint": {
                    "fill-color": "#0b3144",
                    "fill-opacity": 0.82,
                },
            },
        )
    # Labels are added at runtime in MarineMap (with collision + scope filters).
    # Keep a tiny circle in the static style as a fallback.
    layers.append(
        {
            "id": "places-circle",
            "type": "circle",
            "source": "places",
            "paint": {
                "circle-radius": [
                    "case",
                    ["==", ["get", "isLocality"], True],
                    3,
                    2,
                ],
                "circle-color": [
                    "case",
                    ["==", ["get", "isLocality"], True],
                    "#f0c674",
                    "#9ec4d4",
                ],
                "circle-stroke-width": 1,
                "circle-stroke-color": "#041018",
            },
        }
    )
    style = {
        "version": 8,
        "name": f"greenland-{region.slug}",
        "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        "metadata": {
            "nunat:safety": "not-for-navigation",
            "nunat:region": region.package_id,
            "nunat:bathymetry": "context-placeholder-not-for-navigation",
        },
        "sources": sources,
        "layers": layers,
    }
    out = PACKAGES / region.slug / "style.json"
    out.write_text(json.dumps(style, indent=2) + "\n", encoding="utf-8")
    return out


def write_manifest(
    region: Region,
    land_source: str,
    locality_count: int,
    geography_count: int,
    has_water: bool,
    has_ocean_bands: bool,
) -> Path:
    out_dir = PACKAGES / region.slug
    names = ["places.geojson", "land.geojson", "style.json"]
    if has_ocean_bands:
        names.insert(2, "ocean-bands.geojson")
    if has_water:
        names.insert(2 if not has_ocean_bands else 3, "water.geojson")
    files = []
    for name in names:
        size, digest = sha256_file(out_dir / name)
        files.append({"path": name, "bytes": size, "sha256": digest})

    places_meta = next(item for item in files if item["path"] == "places.geojson")
    aggregate = hashlib.sha256()
    for item in sorted(files, key=lambda row: row["path"]):
        aggregate.update(item["path"].encode("utf-8"))
        aggregate.update(b":")
        aggregate.update(item["sha256"].encode("utf-8"))
        aggregate.update(b"\n")

    manifest = {
        "id": region.package_id,
        "slug": region.slug,
        "title": {
            "kl": region.title_kl,
            "da": region.title_da,
            "en": region.title_en,
        },
        "description": region.description_en,
        "bbox": list(region.bbox),
        "minZoom": 3,
        "maxZoom": 14,
        "bytes": sum(item["bytes"] for item in files),
        "sha256": aggregate.hexdigest(),
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "primaryFile": "places.geojson",
        "primaryBytes": places_meta["bytes"],
        "primarySha256": places_meta["sha256"],
        "files": files,
        "stats": {
            "localities": locality_count,
            "geography": geography_count,
        },
        "layers": [
            {
                "id": "places",
                "source": "NunaGIS/Oqaasileriffik via web placenames gazetteer",
                "licence": "written-confirmation-required-for-commercial-redistribution",
                "dataAsOf": "2026-08-01",
                "file": "places.geojson",
                "safety": "companion_only",
            },
            {
                "id": "land",
                "source": land_source,
                "licence": "ODbL" if "OpenStreetMap" in land_source else "public domain",
                "dataAsOf": "2026-08-04",
                "file": "land.geojson",
                "safety": "not-for-navigation",
            },
            {
                "id": "bathymetry-context",
                "source": (
                    "Derived nearshore/shelf bands from land buffer — "
                    "NOT GEBCO/IBCAO soundings; companion context only"
                ),
                "licence": "derived",
                "dataAsOf": "2026-08-04",
                "safety": "not-for-navigation",
                **(
                    {"file": "ocean-bands.geojson"} if has_ocean_bands else {}
                ),
            },
        ],
        "style": "style.json",
        "attributions": [
            "Place names: Nunat Aqqinik Aalajangiisartut / Oqaasileriffik via NunaGIS",
            land_source,
            "© OpenStreetMap contributors (ODbL) when OSM land is used",
            "Not an official nautical chart — companion context only",
        ],
        "warnings": [
            "Whole-Greenland companion package — context only.",
            "Not for navigation, depth clearance, or emergency decisions.",
            "Browser storage can be evicted; export important trips.",
        ],
    }
    out = out_dir / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return out


def write_catalog(summaries: list[dict]) -> None:
    catalog = {
        "version": 1,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "regions": summaries,
    }
    (PACKAGES / "catalog.json").write_text(
        json.dumps(catalog, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    # Unpack Geofabrik shapefiles if zip present but shp missing.
    zip_path = RAW / "greenland-latest-free.shp.zip"
    if zip_path.exists() and not OSM_NATURAL.exists():
        print("Unpacking", zip_path)
        shutil.unpack_archive(zip_path, RAW)

    keep = {region.slug for region in REGIONS}
    for child in PACKAGES.iterdir():
        if child.is_dir() and child.name not in keep and child.name != "data":
            print(f"Removing old package {child.name}")
            shutil.rmtree(child)

    summaries = []
    for region in REGIONS:
        print(f"== {region.slug} ==")
        places_path, locs, geos = clip_places(region)
        print(f"  places: {locs} localities + {geos} geography → {places_path}")
        land_path, water_path, land_source = clip_land(region)
        print(f"  land: {land_path.stat().st_size} bytes ({land_source})")
        if water_path:
            print(f"  water: {water_path.stat().st_size} bytes")
        validate_localities_on_land(region)
        ocean_path = write_ocean_bands(region, land_path)
        if ocean_path:
            print(f"  ocean bands: {ocean_path.stat().st_size} bytes (context only)")
        write_style(
            region,
            has_water=water_path is not None,
            has_ocean_bands=ocean_path is not None,
        )
        manifest_path = write_manifest(
            region,
            land_source,
            locs,
            geos,
            has_water=water_path is not None,
            has_ocean_bands=ocean_path is not None,
        )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        summaries.append(
            {
                "id": region.package_id,
                "slug": region.slug,
                "path": f"/packages/{region.slug}",
                "title": manifest["title"],
                "description": region.description_en,
                "bbox": list(region.bbox),
                "bytes": manifest["bytes"],
                "stats": manifest["stats"],
            }
        )
        print(f"  package {manifest['bytes']} bytes")

    write_catalog(summaries)
    print("Wrote", PACKAGES / "catalog.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
