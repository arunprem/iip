#!/usr/bin/env bash
# Download OpenAFIS sources on the HOST (uses your Mac DNS, not Docker build DNS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/openafis"

if [[ -d "$VENDOR/.git" ]] || [[ -f "$VENDOR/lib/OpenAFIS.h" ]]; then
  echo "OpenAFIS already present at $VENDOR"
  exit 0
fi

mkdir -p "$ROOT/vendor"
echo "Cloning OpenAFIS into $VENDOR ..."
git clone --depth 1 https://github.com/neilharan/openafis.git "$VENDOR"
echo "Done."
