#!/usr/bin/env python3
"""Backward-compatible entry — delegates to bridge.py in mock mode."""

import os

os.environ.setdefault("FINGERPRINT_BRIDGE_MOCK", "1")

from bridge import main

if __name__ == "__main__":
    main()
