#!/usr/bin/env bash
# Upload the land-peaks PMTiles archive to a GitHub Release.
# Does not commit the files — keep them local / fetched.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pkg_dir="${LAND_PEAKS_PACKAGE_DIR:-$root_dir/web/public/packages/land-peaks}"
manifest="$pkg_dir/manifest.json"
repo="${LAND_PEAKS_ASSETS_REPO:-Arko-93/nunat-aqqinik-nalunaarsuiffik}"
files=(land-peaks.pmtiles)

if [[ ! -f "$manifest" ]]; then
	echo "Missing $manifest — run: .venv/bin/python web/scripts/build-land-peaks.py" >&2
	exit 1
fi

for name in "${files[@]}"; do
	if [[ ! -f "$pkg_dir/$name" ]]; then
		echo "Missing $pkg_dir/$name — run build-land-peaks.py first" >&2
		exit 1
	fi
done

# Verify local files match manifest before publishing.
bash "$root_dir/scripts/fetch-land-peaks-assets.sh"

package_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$manifest")"
tag="${LAND_PEAKS_ASSETS_TAG:-web-land-peaks-${package_id}}"
title="Web land peak color bands (${package_id})"
notes="$(
	cat <<EOF
Peaks-only land color-relief for the web product map \`${package_id}\` (issue #24).

- Derived from the same Mapterhorn DEM tiles the land hillshade serves
  (Klimadatastyrelsen, CC BY 4.0) — the bands cannot drift from the relief
- Transparent below 500 m; discrete bands at 500/1000/2000 m
  (landPeakBandColor, web/src/map/meter-bands.ts) — never a full land wash
- z0–z10, 256 px lossless webp; z11+ renders overzoomed
- Not for navigation
- Fetch with: \`make web-fetch-land-peaks\`
- Keep local while developing; do not commit these files
EOF
)"

assets=()
for name in "${files[@]}"; do
	assets+=("$pkg_dir/$name")
done

if gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
	echo "Updating existing release $tag"
	gh release upload "$tag" --repo "$repo" --clobber "${assets[@]}"
else
	echo "Creating release $tag"
	gh release create "$tag" \
		--repo "$repo" \
		--title "$title" \
		--notes "$notes" \
		"${assets[@]}"
fi

echo "Published $tag"
echo "  https://github.com/${repo}/releases/tag/${tag}"
