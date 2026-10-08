#!/bin/bash
# ==============================================================================
# Block INTERNET access to the Myon tenant Postgres on :5435 (rootful Docker),
# while keeping host-local access (the rootless-Podman OxenGL backend reaches it
# via the host IP through slirp4netns, i.e. as locally generated traffic).
#
# Why a firewall and not `127.0.0.1:5435`:  a loopback-only publish would also cut
# off the rootless backend (slirp4netns runs with --disable-host-loopback, and
# Docker only DNATs 127.0.0.1 for a loopback-bound port).
#
# Why DOCKER-USER: Docker-published ports are DNAT'ed in PREROUTING and bypass
# INPUT/UFW; DOCKER-USER is the chain Docker reserves for user rules and never flushes.
#
# Usage (root):
#   sudo bash secure_port_5435.sh install   # apply now + persist across reboots (systemd)
#   sudo bash secure_port_5435.sh verify    # show rules
#   sudo bash secure_port_5435.sh remove    # undo everything
# Env: IFACE (default: interface of the default route), PORT (default 5435)
# ==============================================================================
set -euo pipefail
PORT="${PORT:-5435}"
IFACE="${IFACE:-$(ip -4 route show default | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')}"
UNIT=/etc/systemd/system/oxengl-block-${PORT}.service
BIN=/usr/local/sbin/oxengl-block-${PORT}.sh

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }
[ -n "$IFACE" ] || { echo "could not detect external interface; set IFACE=..."; exit 1; }

rule() {  # rule <iptables|ip6tables> <-I|-D> <chain> <args...>
  local tool=$1 op=$2 chain=$3; shift 3
  $tool -n -L "$chain" >/dev/null 2>&1 || return 0          # chain absent (e.g. no Docker IPv6) -> skip
  if [ "$op" = "-I" ]; then
    $tool -C "$chain" "$@" 2>/dev/null || $tool -I "$chain" 1 "$@"
  else
    while $tool -C "$chain" "$@" 2>/dev/null; do $tool -D "$chain" "$@"; done
  fi
}

apply_rules() {
  local op=$1
  for tool in iptables ip6tables; do
    # Docker DNAT path (match the ORIGINAL destination port, before DNAT to the container port)
    rule $tool "$op" DOCKER-USER -i "$IFACE" -p tcp -m conntrack --ctorigdstport "$PORT" -j DROP
    # userland-proxy / dockerd listener path
    rule $tool "$op" INPUT -i "$IFACE" -p tcp --dport "$PORT" -j DROP
  done
}

case "${1:-}" in
  apply)  apply_rules -I; echo "rules applied on $IFACE for port $PORT" ;;
  install)
    install -m 0755 "$(readlink -f "$0")" "$BIN"
    cat > "$UNIT" <<EOF
[Unit]
Description=OxenGL: block external access to port ${PORT} (Myon tenant DB)
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=IFACE=${IFACE} PORT=${PORT}
ExecStart=${BIN} apply
ExecStop=${BIN} unapply

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable --now "$(basename "$UNIT")"
    "$BIN" verify ;;
  unapply) apply_rules -D; echo "rules removed" ;;
  remove)
    systemctl disable --now "$(basename "$UNIT")" 2>/dev/null || true
    apply_rules -D; rm -f "$UNIT" "$BIN"; systemctl daemon-reload; echo "removed" ;;
  verify)
    echo "iface=$IFACE port=$PORT"
    for tool in iptables ip6tables; do
      for chain in DOCKER-USER INPUT; do
        $tool -n -L "$chain" >/dev/null 2>&1 && $tool -S "$chain" | grep -E -- "$PORT" | sed "s/^/[$tool] /" || true
      done
    done
    systemctl is-enabled "$(basename "$UNIT")" 2>/dev/null | sed 's/^/unit: /' || true ;;
  *) echo "usage: $0 install|apply|verify|unapply|remove"; exit 2 ;;
esac
