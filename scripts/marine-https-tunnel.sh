#!/usr/bin/env bash
# Quick HTTPS front for the Omarchy marine POC so phone GPS works.
# Avoids ~/.cloudflared/config.yml (named tunnels catch-all to HTTP 404).
set -euo pipefail

port="${OMARCHY_MARINE_PORT:-3459}"
local_port="${MARINE_TUNNEL_LOCAL_PORT:-13459}"
config="$(mktemp)"
trap 'rm -f "$config"' EXIT
: >"$config"

echo "1. SSH forward Omarchy :$port -> localhost:$local_port"
ssh -fN -o ExitOnForwardFailure=yes -L "$local_port:127.0.0.1:$port" omarchy
sleep 1
curl --fail --silent "http://127.0.0.1:$local_port/healthz" >/dev/null
echo "2. Origin OK"
echo "3. Starting Cloudflare quick tunnel (keep this running)"
echo "   Open the printed https://*.trycloudflare.com URL on the phone."
exec cloudflared tunnel --config "$config" --url "http://127.0.0.1:$local_port"