#!/usr/bin/env bash
# Ensure the land-peaks PMTiles exist locally (dev or deploy).
# Prefer existing files that match the manifest sha256; otherwise
# download from the GitHub Release for this package id.
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

package_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$manifest")"
tag="${LAND_PEAKS_ASSETS_TAG:-web-land-peaks-${package_id}}"
base_url="${LAND_PEAKS_ASSETS_BASE_URL:-https://github.com/${repo}/releases/download/${tag}}"

sha256_file() {
	local path="$1"
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$path" | awk '{print $1}'
	else
		shasum -a 256 "$path" | awk '{print $1}'
	fi
}

expected_sha() {
	local path="$1"
	python3 -c "
import json, sys
manifest = json.load(open(sys.argv[1]))
want = sys.argv[2]
for row in manifest.get('files', []):
    if row.get('path') == want:
        print(row['sha256'])
        raise SystemExit(0)
raise SystemExit(f'missing sha256 for {want} in manifest')
" "$manifest" "$path"
}

mkdir -p "$pkg_dir"

for name in "${files[@]}"; do
	dest="$pkg_dir/$name"
	want="$(expected_sha "$name")"
	if [[ -f "$dest" ]]; then
		have="$(sha256_file "$dest")"
		if [[ "$have" == "$want" ]]; then
			echo "ok $name (local, sha256 match)"
			continue
		fi
		echo "hash mismatch $name — re-fetching from $tag"
	else
		echo "missing $name — fetching from $tag"
	fi

	tmp="$dest.tmp.$$"
	rm -f "$tmp"
	url="$base_url/$name"
	if command -v aria2c >/dev/null 2>&1; then
		# Parallel + resumable: the peaks archive is tens of MB.
		if ! aria2c --file-allocation=none --allow-overwrite=true \
			--dir="$pkg_dir" --out="$(basename "$tmp")" \
			-x8 -s8 -k1M "$url" >/dev/null 2>&1; then
			rm -f "$tmp"
			echo "Failed to download $url (aria2c)" >&2
			echo "Build locally with: .venv/bin/python web/scripts/build-land-peaks.py" >&2
			echo "Or publish assets with: make web-publish-land-peaks" >&2
			exit 1
		fi
	elif ! curl --fail --location --retry 3 --retry-delay 2 \
		--output "$tmp" "$url"; then
		rm -f "$tmp"
		echo "Failed to download $url" >&2
		echo "Build locally with: .venv/bin/python web/scripts/build-land-peaks.py" >&2
		echo "Or publish assets with: make web-publish-land-peaks" >&2
		exit 1
	fi
	have="$(sha256_file "$tmp")"
	if [[ "$have" != "$want" ]]; then
		rm -f "$tmp"
		echo "Downloaded $name sha256 mismatch:" >&2
		echo "  expected $want" >&2
		echo "  got      $have" >&2
		exit 1
	fi
	mv "$tmp" "$dest"
	echo "ok $name (fetched, sha256 match)"
done
