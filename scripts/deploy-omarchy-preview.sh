#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="${OMARCHY_HOST:-omarchy}"
remote_dir="${OMARCHY_REMOTE_DIR:-/home/oolsvig/apps/nunat-aqqinik-nalunaarsuiffik-preview}"
preview_port="${OMARCHY_PREVIEW_PORT:-3457}"
container_name="nunat-aqqinik-nalunaarsuiffik-preview"
image_name="${container_name}:latest"

cd "$root_dir/web"

if [[ ! -f public/data/placenames.geojson ]]; then
	echo "Missing public/data/placenames.geojson; run: pnpm --dir web fetch:placenames" >&2
	exit 1
fi

if [[ ! -f public/data/reachability-graph.json ]]; then
	echo "Missing public/data/reachability-graph.json; run: python3 web/scripts/export-reachability-graph.py" >&2
	exit 1
fi

ssh "$remote_host" "mkdir -p '$remote_dir'"

rsync -az --delete \
	--exclude ".git/" \
	--exclude "node_modules/" \
	--exclude "dist/" \
	./ "$remote_host:$remote_dir/"

ssh "$remote_host" bash -s -- \
	"$remote_dir" \
	"$preview_port" \
	"$container_name" \
	"$image_name" <<'REMOTE'
set -euo pipefail

remote_dir="$1"
preview_port="$2"
container_name="$3"
image_name="$4"
tailscale_ip="$(tailscale ip -4 | head -n 1)"

if [[ ! -f "$remote_dir/public/data/placenames.geojson" ]]; then
	echo "Remote preview is missing public/data/placenames.geojson" >&2
	exit 1
fi

docker build --pull --tag "$image_name" "$remote_dir"

if docker container inspect "$container_name" >/dev/null 2>&1; then
	docker rm --force "$container_name" >/dev/null
fi

docker run --detach \
	--restart unless-stopped \
	--name "$container_name" \
	--publish "$tailscale_ip:$preview_port:3457" \
	"$image_name" >/dev/null

if command -v ufw >/dev/null 2>&1; then
	sudo -n ufw route allow \
		in on tailscale0 \
		out on docker0 \
		to any port 3457 \
		proto tcp \
		comment "Nunat Aqqinik Nalunaarsuiffik map" >/dev/null || true
fi

for _attempt in {1..40}; do
	if curl --fail --silent \
		"http://$tailscale_ip:$preview_port/healthz" \
		>/dev/null; then
		exit 0
	fi
	sleep 1
done

docker logs "$container_name"
exit 1
REMOTE

echo "Map: http://omarchy.tail189279.ts.net:$preview_port"
