#!/usr/bin/env bash
# Mount the selected data release into web/public/releases for the map product.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CURRENT_FILE="$ROOT/data/releases/CURRENT"
WEB_RELEASES="$ROOT/web/public/releases"

if [[ ! -f "$CURRENT_FILE" ]]; then
  echo "Missing $CURRENT_FILE — run: make -C data release" >&2
  exit 1
fi

RELEASE_ID="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['release_id'])" "$CURRENT_FILE")"
SRC="$ROOT/data/releases/$RELEASE_ID"
if [[ ! -d "$SRC" ]]; then
  echo "Missing release directory: $SRC" >&2
  exit 1
fi

DEST="$WEB_RELEASES/$RELEASE_ID"
mkdir -p "$DEST"

cp -f "$CURRENT_FILE" "$WEB_RELEASES/CURRENT"
cp -f "$SRC/manifest.json" "$DEST/manifest.json"
cp -f "$SRC/source-health.json" "$DEST/source-health.json"
cp -f "$SRC/release.json" "$DEST/release.json"

if [[ -f "$SRC/placenames.geojson" ]]; then
  cp -f "$SRC/placenames.geojson" "$DEST/placenames.geojson"
else
  echo "Missing $SRC/placenames.geojson — rebuild release with gazetteer snapshot" >&2
  exit 1
fi

# Product overlays built from canonical source (not live upstream)
python3 "$ROOT/web/scripts/build-identity-crosswalk.py"
python3 "$ROOT/web/scripts/export-reachability-graph.py"
cp -f "$ROOT/web/public/data/identity-crosswalk.json" "$DEST/identity-crosswalk.json"
cp -f "$ROOT/web/public/data/reachability-graph.json" "$DEST/reachability-graph.json"

echo "Synced release $RELEASE_ID → $DEST (includes placenames.geojson)"
