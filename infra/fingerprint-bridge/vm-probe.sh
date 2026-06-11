#!/usr/bin/env bash
# Run INSIDE the UTM VM after: ssh master@192.168.64.6
set -euo pipefail

echo "=== IIP fingerprint VM probe ==="
echo "host: $(hostname)  ip: $(hostname -I 2>/dev/null | awk '{print $1}')"
echo "arch: $(uname -m)"
echo "os: $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || echo unknown)"
echo "python: $(python3 --version 2>/dev/null || echo MISSING)"
echo
echo "=== USB (SecuGen vendor 1162) ==="
if command -v lsusb >/dev/null; then
  lsusb | grep -i 1162 || { echo "No SecuGen device — attach HU20 in UTM USB settings"; lsusb | head -8; }
else
  echo "lsusb not installed: sudo apt install usbutils"
fi
echo
echo "=== SecuGen SDK ==="
ldconfig -p 2>/dev/null | grep libsgfplib || true
ls /usr/local/lib/libsgfplib* 2>/dev/null || echo "libsgfplib not installed"
ls -d /opt/secugen/* 2>/dev/null || echo "No /opt/secugen — download FDx SDK Pro for Linux"
echo
echo "=== IIP repo / bridge ==="
for p in ~/kp-inteligence /opt/kp-inteligence /home/master/kp-inteligence; do
  [[ -f "$p/infra/fingerprint-bridge/bridge.py" ]] && echo "found: $p" && REPO="$p"
done
REPO="${REPO:-}"
[[ -z "$REPO" ]] && echo "Repo not found — git clone or copy kp-inteligence into VM"
echo
echo "=== Bridge port 17890 ==="
curl -sf http://127.0.0.1:17890/status && echo || echo "Bridge not running locally"
echo
echo "=== Ready? ==="
echo "1. SecuGen demo works in VM"
echo "2. Start bridge:"
echo "   export FINGERPRINT_BRIDGE_HOST=0.0.0.0"
echo "   python3 \$REPO/infra/fingerprint-bridge/bridge.py"
echo "3. On iMac portal .env.local:"
echo "   VITE_FINGERPRINT_BRIDGE_URL=http://$(hostname -I 2>/dev/null | awk '{print $1}'):17890"
