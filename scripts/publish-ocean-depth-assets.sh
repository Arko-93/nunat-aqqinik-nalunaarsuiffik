#!/usr/bin/env bash
# Upload the ocean-depth PMTiles archives to a GitHub Release.
# Does not commit the files — keep them local / fetched.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pkg_dir="${OCEAN_DEPTH_PACKAGE_DIR:-$root_dir/web/public/packages/ocean-depth}"
manifest="$pkg_dir/manifest.json"
repo="${OCEAN_DEPTH_ASSETS_REPO:-Arko-93/nunat-aqqinik-nalunaarsuiffik}"
files=(ocean-depth-dem.pmtiles ocean-depth-vector.pmtiles)

if [[ ! -f "$manifest" ]]; then
	echo "Missing $manifest — run: .venv/bin/python web/scripts/build-ocean-depth.py" >&2
	exit 1
fi

for name in "${files[@]}"; do
	if [[ ! -f "$pkg_dir/$name" ]]; then
		echo "Missing $pkg_dir/$name — run build-ocean-depth.py first" >&2
		exit 1
	fi
done

# Verify local files match manifest before publishing.
bash "$root_dir/scripts/fetch-ocean-depth-assets.sh"

package_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$manifest")"
tag="${OCEAN_DEPTH_ASSETS_TAG:-web-ocean-depth-${package_id}}"
title="Web ocean depth assets (${package_id})"
notes="$(
	cat <<EOF
Fat ocean-depth artefacts for the web product map \`${package_id}\`.

- Self-tiled bathymetry: IBCAO v5.2 (2026) 400 m primary, GEBCO_2026 fallback
- Depth bands + contours clipped to the shared coastline (OSM ∪ DEM land)
  before tiling — the display mask and the tiles cannot drift (issue #23)
- Not for navigation
- Fetch with: \`make web-fetch-ocean-depth\`
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
