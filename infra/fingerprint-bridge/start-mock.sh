#!/usr/bin/env bash
# Start mock fingerprint bridge for Mac / dev (no SecuGen SDK required).
set -euo pipefail
cd "$(dirname "$0")/../.."
export FINGERPRINT_BRIDGE_MOCK=1
exec python3 infra/fingerprint-bridge/bridge.py
