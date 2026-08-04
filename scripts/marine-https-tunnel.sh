#!/usr/bin/env bash
# Quick HTTPS front for the Omarchy marine POC so phone GPS works.
# Requires cloudflared on this machine (DNS). Omarchy HTTP alone is not a secure context.
set -euo pipefail

host="${OMARCHY_HOST:-omarchy}"
port="${OMARCHY_MARINE_PORT:-3459}"
ip="$(ssh "$host" 'tailscale ip -4 | head -n1')"

echo "Tunneling https://*.trycloudflare.com -> http://$ip:$port"
exec cloudflared tunnel --url "http://$ip:$port"
