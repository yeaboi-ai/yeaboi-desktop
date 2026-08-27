#!/usr/bin/env bash
# Print the host's primary outbound IPv4 — the address WebRTC peers will use
# to reach this machine. Falls back to 127.0.0.1 if detection fails.
set -e

case "$(uname -s)" in
  Darwin)
    iface=$(route -n get 1.1.1.1 2>/dev/null | awk '/interface:/ {print $2}')
    if [ -n "$iface" ]; then
      ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    fi
    ;;
  Linux)
    ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") print $(i+1)}')
    ;;
esac

if [ -z "$ip" ]; then
  ip="127.0.0.1"
fi

printf '%s' "$ip"
