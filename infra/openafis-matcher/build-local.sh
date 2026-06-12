#!/usr/bin/env bash
# Build iip-openafis-identify on macOS/Linux WITHOUT Docker (recommended when Docker DNS fails).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
BIN_DIR="$REPO_ROOT/bin"
VENDOR="$ROOT/vendor/openafis"
OUT="$BIN_DIR/iip-openafis-identify"

"$ROOT/scripts/fetch-openafis.sh"

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake not found. Install: brew install cmake"
  exit 1
fi
if ! command -v g++ >/dev/null 2>&1 && ! command -v c++ >/dev/null 2>&1; then
  echo "C++ compiler not found. Install Xcode command line tools: xcode-select --install"
  exit 1
fi

CXX="${CXX:-$(command -v g++ 2>/dev/null || command -v c++)}"

echo "Building OpenAFIS library..."
cd "$VENDOR"
cmake . -DCMAKE_BUILD_TYPE=Release
make -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

echo "Building iip-openafis-identify..."
mkdir -p "$BIN_DIR"
"$CXX" -std=c++17 -O3 \
  -I"$VENDOR/lib" \
  "$ROOT/iip_openafis_identify.cpp" \
  -L"$VENDOR/lib" -lopenafis -lpthread \
  -o "$OUT"

echo "Built: $OUT"
echo ""
echo "Use with ml-gateway:"
echo "  OPENAFIS_MATCHER_BIN=$OUT make ml-gateway-dev"
