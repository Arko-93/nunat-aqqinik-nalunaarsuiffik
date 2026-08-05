#!/usr/bin/env bash
# Upload fat Greenland land artefacts to a GitHub Release.
# Does not commit the files — keep them local / fetched.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pkg_dir="${MARINE_PACKAGE_DIR:-$root_dir/marine-poc/public/packages/greenland}"
manifest="$pkg_dir/manifest.json"
repo="${MARINE_LAND_ASSETS_REPO:-Arko-93/nunat-aqqinik-nalunaarsuiffik}"
files=(land.geojson land.pmtiles)

if [[ ! -f "$manifest" ]]; then
	echo "Missing $manifest — run: pnpm --dir marine-poc prepare:regions" >&2
	exit 1
fi

for name in "${files[@]}"; do
	if [[ ! -f "$pkg_dir/$name" ]]; then
		echo "Missing $pkg_dir/$name — run prepare:regions first" >&2
		exit 1
	fi
done

# Verify local files match manifest before publishing.
bash "$root_dir/scripts/fetch-marine-land-assets.sh"

package_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$manifest")"
tag="${MARINE_LAND_ASSETS_TAG:-marine-${package_id}}"
title="Marine Greenland land assets (${package_id})"
notes="$(cat <<EOF
Fat land artefacts for the marine POC offline package \`${package_id}\`.

- Source: OpenStreetMap land polygons (full coastline, ODbL)
- Not for navigation
- Fetch with: \`make marine-fetch-land-assets\`
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
