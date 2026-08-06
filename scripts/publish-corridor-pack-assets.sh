#!/usr/bin/env bash
# Upload the full corridor-pack PMTiles to a GitHub Release.
# Does not commit the files — keep them local / fetched.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pkg_dir="${CORRIDOR_PACKAGE_DIR:-$root_dir/web/public/packages/qaarsut-kullorsuaq}"
manifest="$pkg_dir/manifest.json"
repo="${CORRIDOR_PACK_ASSETS_REPO:-Arko-93/nunat-aqqinik-nalunaarsuiffik}"
files=(land-relief.pmtiles ocean-depth-vector.pmtiles ocean-depth-dem.pmtiles coastline-land/land.pmtiles)

if [[ ! -f "$manifest" ]]; then
	echo "Missing $manifest — run: .venv/bin/python web/scripts/build-corridor-pack.py" >&2
	exit 1
fi

for name in "${files[@]}"; do
	if [[ ! -f "$pkg_dir/$name" ]]; then
		echo "Missing $pkg_dir/$name — run build-corridor-pack.py first" >&2
		exit 1
	fi
done

# Verify local files match manifest before publishing.
bash "$root_dir/scripts/fetch-corridor-pack-assets.sh"

package_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$manifest")"
tag="${CORRIDOR_PACK_ASSETS_TAG:-web-corridor-pack-${package_id}}"
title="Web Qaarsut–Kullorsuaq corridor pack (${package_id})"
notes="$(cat <<EOF
Full Qaarsut→Kullorsuaq corridor offline pack \`${package_id}\`.

- land-relief.pmtiles: Mapterhorn DEM (Klimadatastyrelsen, CC BY 4.0), z0–z10, 256 px re-encoded
- ocean-depth.pmtiles: Open Waters Seascape open-grid MVT (interim), z0–z12
- coastline-land/land.pmtiles: shared coastline mask (OSM ∪ DEM, ODbL + CC BY 4.0), z0–z13
- Manifest: \`web/public/packages/qaarsut-kullorsuaq/manifest.json\` (kind=full)
- Not for navigation
- Fetch with: \`make web-fetch-corridor-pack\`
- Keep local while developing; do not commit these files
EOF
)"

assets=()
for name in "${files[@]}"; do
	# gh uploads by local basename — the nested mask archive becomes the
	# release asset `land.pmtiles`; fetch-corridor-pack-assets.sh maps it
	# back into coastline-land/land.pmtiles.
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
