#!/usr/bin/env bash
# Upload the coastline-mask land artefacts to a GitHub Release.
# Does not commit the files — keep them local / fetched.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pkg_dir="${COASTLINE_MASK_PACKAGE_DIR:-$root_dir/web/public/packages/coastline-land}"
manifest="$pkg_dir/manifest.json"
repo="${COASTLINE_MASK_ASSETS_REPO:-Arko-93/nunat-aqqinik-nalunaarsuiffik}"
files=(land.geojson land.pmtiles)

if [[ ! -f "$manifest" ]]; then
	echo "Missing $manifest — run: .venv/bin/python web/scripts/build-coastline-mask.py" >&2
	exit 1
fi

for name in "${files[@]}"; do
	if [[ ! -f "$pkg_dir/$name" ]]; then
		echo "Missing $pkg_dir/$name — run build-coastline-mask.py first" >&2
		exit 1
	fi
done

# Verify local files match manifest before publishing.
bash "$root_dir/scripts/fetch-coastline-mask-assets.sh"

package_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$manifest")"
tag="${COASTLINE_MASK_ASSETS_TAG:-web-coastline-mask-${package_id}}"
title="Web coastline mask land assets (${package_id})"
notes="$(cat <<EOF
Fat coastline-mask land artefacts for the web product map \`${package_id}\`.

- Source: OpenStreetMap land polygons (full coastline, ODbL)
- One shared shoreline for the display mask and bathymetry clipping
- Not for navigation
- Fetch with: \`make web-fetch-coastline-mask\`
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
