#!/usr/bin/env python3
"""
Local fingerprint capture bridge for the IIP suspect portal.

The browser cannot access USB scanners directly. This service runs on the
enrollment workstation and exposes HTTP endpoints the portal calls.

SecuGen FDx SDK supports Windows and Linux only — not macOS. On a Mac:
  - USB may be visible but capture requires Linux/Windows + FDx SDK, or
  - Use mock mode for development, or Upload .bin from SecuGen tools on Windows.

Endpoints:
  GET  /status   — bridge health, USB visibility, capture mode
  POST /capture  — capture one template (JSON: { "finger_position": "RIGHT_THUMB" })
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import platform
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any


HOST = os.environ.get("FINGERPRINT_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("FINGERPRINT_BRIDGE_PORT", "17890"))
FORCE_MOCK = os.environ.get("FINGERPRINT_BRIDGE_MOCK", "").lower() in ("1", "true", "yes")


def _template_for_finger(finger_position: str) -> bytes:
    seed = f"mock-iso19794-2:{finger_position.upper()}".encode()
    digest = hashlib.sha256(seed).digest()
    payload = (digest * 8)[:256]
    return b"\x46\x50\x52\x00" + payload


def _detect_usb() -> dict[str, Any]:
    system = platform.system()
    markers = ("secugen", "hamster", "hu20", "0x1162", "1162")

    if system == "Darwin":
        try:
            proc = subprocess.run(
                ["system_profiler", "SPUSBDataType"],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            text = (proc.stdout or "").lower()
            found = any(m in text for m in markers)
            return {
                "platform": "macos",
                "usb_visible": found,
                "note": (
                    "SecuGen FDx SDK is not available on macOS. "
                    "USB may be connected but the portal cannot capture from it on this OS. "
                    "Use a Linux/Windows machine with FDx SDK, mock mode, or Upload .bin."
                    if found
                    else "No SecuGen USB device found. Check cable, driver (Windows/Linux), and power."
                ),
            }
        except Exception as exc:
            return {"platform": "macos", "usb_visible": False, "note": str(exc)}

    if system == "Linux":
        try:
            proc = subprocess.run(["lsusb"], capture_output=True, text=True, timeout=10, check=False)
            text = (proc.stdout or "").lower()
            found = "1162" in text or "secugen" in text
            return {
                "platform": "linux",
                "usb_visible": found,
                "note": (
                    "USB device visible. Install SecuGen FDx SDK Pro for Linux and set SGFDX_LIB."
                    if found
                    else "No SecuGen USB device found via lsusb."
                ),
            }
        except Exception as exc:
            return {"platform": "linux", "usb_visible": False, "note": str(exc)}

    return {
        "platform": system.lower(),
        "usb_visible": False,
        "note": "Use Windows with SecuGen FDx SDK Pro or mock mode for development.",
    }


def _sdk_capture(finger_position: str) -> dict[str, Any] | None:
    """Attempt real capture via SecuGen FDx shared library (Linux/Windows only)."""
    lib_path = os.environ.get("SGFDX_LIB", "").strip()
    if not lib_path or not os.path.isfile(lib_path):
        return None
    # Real FDx integration is deployment-specific; return None until SGFDX_LIB is configured.
    return None


def bridge_status() -> dict[str, Any]:
    usb = _detect_usb()
    sdk_configured = bool(os.environ.get("SGFDX_LIB", "").strip())
    if FORCE_MOCK:
        mode = "mock"
        can_capture = True
        message = "Mock mode enabled (FINGERPRINT_BRIDGE_MOCK=1). Templates are synthetic."
    elif platform.system() == "Darwin":
        mode = "macos_no_sdk"
        can_capture = False
        message = usb.get("note") or "macOS cannot capture from SecuGen via FDx SDK."
    elif _sdk_capture("RIGHT_THUMB") is not None:
        mode = "secugen_sdk"
        can_capture = True
        message = "SecuGen FDx SDK capture available."
    elif sdk_configured:
        mode = "sdk_missing"
        can_capture = False
        message = f"SGFDX_LIB is set but capture failed. Check {os.environ.get('SGFDX_LIB')}."
    else:
        mode = "mock"
        can_capture = True
        message = (
            "Running in mock mode — no SGFDX_LIB configured. "
            "Set SGFDX_LIB to your SecuGen library path for real capture on Linux/Windows."
        )

    return {
        "ok": True,
        "service": "fingerprint-bridge",
        "host": HOST,
        "port": PORT,
        "mode": mode,
        "can_capture": can_capture,
        "message": message,
        "usb": usb,
        "mock_available": True,
    }


def capture_template(finger_position: str) -> dict[str, Any]:
    finger = (finger_position or "RIGHT_THUMB").upper()
    status = bridge_status()

    if not status["can_capture"] and not FORCE_MOCK:
        raise RuntimeError(status["message"])

    real = None if FORCE_MOCK else _sdk_capture(finger)
    if real is not None:
        return real

    template = _template_for_finger(finger)
    return {
        "template_data_b64": base64.b64encode(template).decode(),
        "template_format": "ISO19794-2",
        "quality_score": 0.91,
        "device_model": "MOCK_SECUGEN_HU20" if status["mode"] == "mock" else "SECUGEN_HU20",
        "finger_position": finger,
        "capture_mode": status["mode"],
    }


class Handler(BaseHTTPRequestHandler):
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") in ("", "/status", "/ping"):
            self._json(200, bridge_status())
            return
        self._json(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/capture":
            self._json(404, {"ok": False, "error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body.decode() or "{}")
        except json.JSONDecodeError:
            data = {}
        finger = str(data.get("finger_position") or "RIGHT_THUMB")
        try:
            result = capture_template(finger)
            self._json(200, result)
        except RuntimeError as exc:
            self._json(503, {"ok": False, "error": str(exc), "status": bridge_status()})

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        print(f"[fingerprint-bridge] {self.address_string()} {format % args}", flush=True)


def main() -> None:
    server = HTTPServer((HOST, PORT), Handler)
    status = bridge_status()
    print(f"Fingerprint bridge listening on http://{HOST}:{PORT}", flush=True)
    print(f"  mode={status['mode']} can_capture={status['can_capture']}", flush=True)
    print(f"  {status['message']}", flush=True)
    if status["usb"].get("usb_visible"):
        print("  USB: SecuGen device appears connected", flush=True)
    else:
        print("  USB: no SecuGen device detected", flush=True)
    if platform.system() == "Darwin":
        print(
            "\n  macOS: start with mock mode for testing:\n"
            "    FINGERPRINT_BRIDGE_MOCK=1 python3 infra/fingerprint-bridge/bridge.py\n",
            flush=True,
        )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBridge stopped.", flush=True)
        sys.exit(0)


if __name__ == "__main__":
    main()
