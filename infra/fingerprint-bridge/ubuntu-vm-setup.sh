#!/usr/bin/env bash
# Run INSIDE Ubuntu VM (UTM) after SecuGen FDx SDK is extracted to SGFDX_ROOT.
set -euo pipefail

SGFDX_ROOT="${SGFDX_ROOT:-/opt/secugen/FDxSDK_Pro_Linux}"
BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$BRIDGE_DIR/../.." && pwd)"

echo "==> SecuGen HU20 Ubuntu VM setup"
echo "    SDK path: $SGFDX_ROOT"

if [[ ! -d "$SGFDX_ROOT/lib/linux" ]]; then
  echo "ERROR: SGFDX_ROOT not found. Download FDx SDK Pro for Linux from secugen.com"
  echo "       Then: export SGFDX_ROOT=/path/to/FDxSDK_Pro_Linux"
  exit 1
fi

sudo apt-get update
sudo apt-get install -y build-essential libusb-0.1-4 libgtk2.0-dev python3 curl

echo "==> Installing SecuGen USB drivers"
(cd "$SGFDX_ROOT/lib/linux" && sudo make install && sudo ldconfig)

if [[ -f "$SGFDX_ROOT/lib/linux3/libjnisgfplib.so.3.8.0.fdu05_rename" ]]; then
  echo "==> Configuring SDK for Hamster Pro 20 (HU20)"
  (cd "$SGFDX_ROOT/lib/linux3" && sudo cp libjnisgfplib.so.3.8.0.fdu05_rename libjnisgfplib.so && sudo make uninstall install)
fi

echo "==> udev rules for SecuGen (vendor 1162)"
sudo groupadd -f SecuGen
sudo usermod -aG SecuGen "$USER" || true
sudo tee /etc/udev/rules.d/99-secugen.rules >/dev/null <<'EOF'
SUBSYSTEM=="usb", ATTR{idVendor}=="1162", MODE="0660", GROUP="SecuGen"
EOF
sudo udevadm control --reload-rules
sudo udevadm trigger

echo ""
echo "==> USB check"
if lsusb 2>/dev/null | grep -qi 1162; then
  echo "    SecuGen device visible"
else
  echo "    WARNING: no SecuGen (1162) in lsusb — attach USB in UTM settings"
fi

LIB="$(ldconfig -p 2>/dev/null | grep libsgfplib | awk '{print $NF}' | head -1)"
if [[ -n "$LIB" ]]; then
  echo "    libsgfplib: $LIB"
else
  LIB="/usr/local/lib/libsgfplib.so"
  echo "    libsgfplib not in cache — try $LIB after reboot"
fi

echo ""
echo "==> Done. Next steps:"
echo "  1. Reboot VM: sudo reboot"
echo "  2. Test SDK demo: cd $SGFDX_ROOT/bin/linux && ./FDxSDKPro_Sample"
echo "  3. Start bridge for iMac portal:"
echo "       export FINGERPRINT_BRIDGE_HOST=0.0.0.0"
echo "       export SGFDX_LIB=$LIB"
echo "       python3 $REPO_ROOT/infra/fingerprint-bridge/bridge.py"
echo "  4. On iMac, set portal .env.local:"
echo "       VITE_FINGERPRINT_BRIDGE_URL=http://<VM-IP>:17890"
