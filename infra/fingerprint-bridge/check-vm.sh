#!/usr/bin/env bash
# Check fingerprint bridge readiness on a UTM/Linux VM from the iMac.
# Usage: ./infra/fingerprint-bridge/check-vm.sh 192.168.64.6 [ssh-user]
set -euo pipefail

VM_IP="${1:-192.168.64.6}"
SSH_USER="${2:-master}"

echo "=== Fingerprint VM check: $VM_IP ==="
echo

echo "-- Network --"
if ping -c 1 -W 2 "$VM_IP" >/dev/null 2>&1; then
  echo "  ping: OK"
else
  echo "  ping: FAILED (VM off or wrong IP?)"
fi

if curl -sf --connect-timeout 3 "http://${VM_IP}:17890/status" >/dev/null 2>&1; then
  echo "  bridge /status: OK"
  curl -s "http://${VM_IP}:17890/status" | python3 -m json.tool 2>/dev/null || curl -s "http://${VM_IP}:17890/status"
else
  echo "  bridge /status: not running (start bridge on VM)"
fi

echo
echo "-- Ports --"
for port in 22 17890 8010 8020; do
  if nc -z -w 2 "$VM_IP" "$port" 2>/dev/null; then
    echo "  $port: open"
  else
    echo "  $port: closed"
  fi
done

if [[ -n "$SSH_USER" ]]; then
  echo
  echo "-- SSH remote probe ($SSH_USER@$VM_IP) --"
  ssh -o ConnectTimeout=5 "${SSH_USER}@${VM_IP}" bash -s <<'REMOTE'
set -e
echo "  arch: $(uname -m)"
echo "  os: $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || echo unknown)"
echo "  python: $(python3 --version 2>/dev/null || echo missing)"
echo "  lsusb (SecuGen 1162):"
lsusb 2>/dev/null | grep -i 1162 || lsusb 2>/dev/null | head -5 || echo "    (lsusb not available)"
echo "  libsgfplib:"
ldconfig -p 2>/dev/null | grep libsgfplib || ls /usr/local/lib/libsgfplib* 2>/dev/null || echo "    not installed"
echo "  repo bridge:"
ls ~/kp-inteligence/infra/fingerprint-bridge/bridge.py 2>/dev/null || \
ls /opt/kp-inteligence/infra/fingerprint-bridge/bridge.py 2>/dev/null || \
echo "    copy infra/fingerprint-bridge into VM"
REMOTE
fi

echo
echo "=== Portal config (on iMac) ==="
echo "  frontend/apps/iip-portal/.env.local:"
echo "    VITE_FINGERPRINT_BRIDGE_URL=http://${VM_IP}:17890"
echo
echo "=== Start bridge on VM ==="
echo "  export FINGERPRINT_BRIDGE_HOST=0.0.0.0"
echo "  export FINGERPRINT_BRIDGE_PORT=17890"
echo "  python3 infra/fingerprint-bridge/bridge.py"
