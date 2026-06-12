#!/usr/bin/env python3
"""NBIS mindtct + bozorth3 helpers for IIP fingerprint gallery (1:N)."""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def _run(cmd: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        check=False,
    )


def _raw_to_ihead(raw_path: Path, *, width: int, height: int, dpi: int = 500) -> Path:
    """Convert 8-bit grayscale raw to NIST IHEAD format (supported by mindtct)."""
    ihead_path = raw_path.with_suffix(".ihead")
    data = raw_path.read_bytes()
    
    def pad(s: str | bytes, size: int) -> bytes:
        b = s if isinstance(s, bytes) else str(s).encode("ascii")
        return b.ljust(size, b"\x00")

    header = (
        pad("288", 8) +
        pad("iip-fingerprint", 80) +
        pad("Fri Jun 12 12:00:00 2026", 26) +
        pad(str(width), 8) +
        pad(str(height), 8) +
        pad("8", 8) +
        pad(str(dpi), 8) +
        pad("0", 8) +
        pad("0", 8) +
        pad("8", 8) +
        pad("8", 8) +
        b"0" +
        b"0" +
        pad("0", 8) +
        pad("255", 8) +
        b"0" +
        b"0" +
        b"0" +
        b"0" +
        pad("", 80) +
        pad("0", 8) +
        pad("0", 8)
    )
    ihead_path.write_bytes(header + data)
    return ihead_path



def mindtct_raw(
    raw_path: Path,
    *,
    width: int,
    height: int,
    out_base: Path,
    dpi: int = 500,
) -> Path:
    """Extract minutiae (.xyt) from 8-bit grayscale raw image."""
    ihead_path = _raw_to_ihead(raw_path, width=width, height=height, dpi=dpi)
    cmd = [
        "mindtct",
        str(ihead_path),
        str(out_base),
    ]
    proc = _run(cmd)
    if proc.returncode != 0:
        raise RuntimeError(
            f"mindtct failed ({proc.returncode}): {(proc.stderr or proc.stdout or '').strip()}"
        )
    xyt = Path(f"{out_base}.xyt")
    if not xyt.is_file():
        raise RuntimeError("mindtct did not produce .xyt output")
    return xyt


def bozorth_score(probe_xyt: Path, gallery_xyt: Path) -> int:
    proc = _run(["bozorth3", str(probe_xyt), str(gallery_xyt)])
    if proc.returncode != 0:
        return 0
    line = (proc.stdout or "").strip().splitlines()
    if not line:
        return 0
    try:
        return int(line[-1].split()[-1])
    except (ValueError, IndexError):
        return 0


def _read_raw_image(args: argparse.Namespace) -> bytes:
    """Read raw image from --image-file or --image-b64."""
    if getattr(args, "image_file", None):
        return Path(args.image_file).read_bytes()
    return base64.b64decode(args.image_b64)


def cmd_enroll(args: argparse.Namespace) -> int:
    raw = _read_raw_image(args)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    xyt_path = out_dir / f"{args.print_id}.xyt"
    with tempfile.TemporaryDirectory(prefix="iip-nbis-enroll-") as tmp:
        tmp_path = Path(tmp)
        raw_path = tmp_path / "probe.raw"
        raw_path.write_bytes(raw)
        xyt = mindtct_raw(
            raw_path,
            width=args.width,
            height=args.height,
            out_base=tmp_path / "out",
            dpi=args.dpi,
        )
        xyt_path.write_bytes(xyt.read_bytes())
    print(json.dumps({"ok": True, "print_id": args.print_id, "xyt_path": str(xyt_path)}))
    return 0


def cmd_identify(args: argparse.Namespace) -> int:
    gallery_dir = Path(args.gallery_dir)
    min_score = int(args.min_score)
    with tempfile.TemporaryDirectory(prefix="iip-nbis-id-") as tmp:
        tmp_path = Path(tmp)
        raw_path = tmp_path / "probe.raw"
        raw_path.write_bytes(_read_raw_image(args))
        probe_xyt = mindtct_raw(
            raw_path,
            width=args.width,
            height=args.height,
            out_base=tmp_path / "probe",
            dpi=args.dpi,
        )
        hits: list[dict[str, object]] = []
        for xyt in sorted(gallery_dir.glob("*.xyt")):
            score = bozorth_score(probe_xyt, xyt)
            if score >= min_score:
                hits.append({"print_id": xyt.stem, "score": score})
        hits.sort(key=lambda h: int(h["score"]), reverse=True)
        if args.top_k > 0:
            hits = hits[: args.top_k]
        print(json.dumps({"ok": True, "hits": hits, "gallery_size": len(list(gallery_dir.glob("*.xyt")))}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="IIP NBIS fingerprint CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    enroll = sub.add_parser("enroll")
    enroll.add_argument("--print-id", required=True)
    img_enroll = enroll.add_mutually_exclusive_group(required=True)
    img_enroll.add_argument("--image-b64", default=None)
    img_enroll.add_argument("--image-file", default=None, help="Path to raw grayscale file (alternative to base64)")
    enroll.add_argument("--width", type=int, required=True)
    enroll.add_argument("--height", type=int, required=True)
    enroll.add_argument("--dpi", type=int, default=500)
    enroll.add_argument("--output-dir", required=True)
    enroll.set_defaults(func=cmd_enroll)

    identify = sub.add_parser("identify")
    img_id = identify.add_mutually_exclusive_group(required=True)
    img_id.add_argument("--image-b64", default=None)
    img_id.add_argument("--image-file", default=None, help="Path to raw grayscale file (alternative to base64)")
    identify.add_argument("--width", type=int, required=True)
    identify.add_argument("--height", type=int, required=True)
    identify.add_argument("--dpi", type=int, default=500)
    identify.add_argument("--gallery-dir", required=True)
    identify.add_argument("--min-score", type=int, default=35)
    identify.add_argument("--top-k", type=int, default=10)
    identify.set_defaults(func=cmd_identify)

    args = parser.parse_args()
    try:
        return int(args.func(args))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
