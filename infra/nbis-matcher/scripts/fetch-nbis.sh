#!/usr/bin/env bash
# Download NBIS 5.0.0 on the HOST (Mac DNS). Docker build only COPYs vendor/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/nbis"
MARKER="$VENDOR/setup.sh"

if [[ -f "$MARKER" ]]; then
  echo "NBIS already present at $VENDOR"
  exit 0
fi

NBIS_URL="${NBIS_URL:-https://nigos.nist.gov/nist/nbis/nbis_v5_0_0.zip}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading NBIS from $NBIS_URL ..."
curl -fsSL -o "$TMP/nbis.zip" "$NBIS_URL"
unzip -q "$TMP/nbis.zip" -d "$TMP"

SRC="$TMP/Rel_5.0.0"
if [[ ! -f "$SRC/setup.sh" ]]; then
  echo "Unexpected NBIS archive layout (Rel_5.0.0/setup.sh missing)" >&2
  exit 1
fi

mkdir -p "$ROOT/vendor"
rm -rf "$VENDOR"
cp -R "$SRC" "$VENDOR"
echo "NBIS extracted to $VENDOR"
