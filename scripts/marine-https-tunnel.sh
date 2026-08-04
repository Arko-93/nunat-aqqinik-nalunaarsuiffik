#!/usr/bin/env bash
# Stable HTTPS for the Omarchy marine POC (phone GPS).
# Uses named tunnel host marine.sikumut.gl via SSH forward to Omarchy :3459.
set -euo pipefail

port="${OMARCHY_MARINE_PORT:-3459}"
local_port="${MARINE_TUNNEL_LOCAL_PORT:-13459}"
config="${HOME}/.cloudflared/config-marine.yml"

if [[ ! -f "$config" ]]; then
	mkdir -p "${HOME}/.cloudflared"
	cat >"$config" <<EOF
tunnel: 4eb05d0f-f4ec-4a07-9146-bb7b28e526a8
credentials-file: ${HOME}/.cloudflared/4eb05d0f-f4ec-4a07-9146-bb7b28e526a8.json

ingress:
  - hostname: marine.sikumut.gl
    service: http://127.0.0.1:${local_port}
  - hostname: nunat-marine.sikumut.gl
    service: http://127.0.0.1:${local_port}
  - service: http_status:404
EOF
fi

echo "1. SSH forward Omarchy :$port -> localhost:$local_port"
ssh -O exit omarchy 2>/dev/null || true
# Keepalives stop idle Tailscale/NAT drops that leave cloudflared on a dead :13459 (502).
ssh -fN \
	-o ExitOnForwardFailure=yes \
	-o ServerAliveInterval=30 \
	-o ServerAliveCountMax=3 \
	-o TCPKeepAlive=yes \
	-L "$local_port:127.0.0.1:$port" \
	omarchy
sleep 1
curl --fail --silent "http://127.0.0.1:$local_port/healthz" >/dev/null
echo "2. Origin OK"
echo "3. Named tunnel -> https://marine.sikumut.gl"
echo "   Keep this process running while testing phone GPS."

# If the SSH forward dies, revive it so the named hostname does not stick on 502.
(
	while true; do
		sleep 20
		if ! curl --fail --silent --max-time 3 "http://127.0.0.1:$local_port/healthz" >/dev/null; then
			echo "SSH forward lost — reconnecting…"
			ssh -O exit omarchy 2>/dev/null || true
			ssh -fN \
				-o ExitOnForwardFailure=yes \
				-o ServerAliveInterval=30 \
				-o ServerAliveCountMax=3 \
				-o TCPKeepAlive=yes \
				-L "$local_port:127.0.0.1:$port" \
				omarchy || true
		fi
	done
) &
watchdog_pid=$!
trap 'kill "$watchdog_pid" 2>/dev/null || true' EXIT

exec cloudflared tunnel --config "$config" run 4eb05d0f-f4ec-4a07-9146-bb7b28e526a8
