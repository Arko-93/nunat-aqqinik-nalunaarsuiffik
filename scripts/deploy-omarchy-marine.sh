#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="${OMARCHY_HOST:-omarchy}"
remote_dir="${OMARCHY_MARINE_REMOTE_DIR:-/home/oolsvig/apps/nunat-marine-poc}"
preview_port="${OMARCHY_MARINE_PORT:-3459}"
container_name="nunat-marine-poc"
image_name="${container_name}:latest"

cd "$root_dir/marine-poc"

if [[ ! -f public/packages/catalog.json ]]; then
	echo "Missing region catalog; run: pnpm --dir marine-poc prepare:regions" >&2
	exit 1
fi

if [[ ! -f public/packages/greenland/manifest.json ]]; then
	echo "Missing Greenland package; run: pnpm --dir marine-poc prepare:regions" >&2
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

docker build --pull --tag "$image_name" "$remote_dir"

if docker container inspect "$container_name" >/dev/null 2>&1; then
	docker rm --force "$container_name" >/dev/null
fi

docker run --detach \
	--restart unless-stopped \
	--name "$container_name" \
	--publish "$tailscale_ip:$preview_port:3459" \
	--publish "127.0.0.1:$preview_port:3459" \
	"$image_name" >/dev/null

if command -v ufw >/dev/null 2>&1; then
	sudo -n ufw route allow \
		in on tailscale0 \
		out on docker0 \
		to any port 3459 \
		proto tcp \
		comment "Nunat Marine POC" >/dev/null || true
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

echo "Marine POC (HTTP, demo GPS only): http://omarchy.tail189279.ts.net:$preview_port"
echo "Real phone GPS needs HTTPS. From a machine with DNS, tunnel with:"
echo "  cloudflared tunnel --url http://\$(tailscale ip -4 | head -n1):$preview_port"
