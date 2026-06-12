"""Fingerprint template embedding and similarity (minutiae bytes — no images)."""

from __future__ import annotations

import hashlib
import math
import struct
import uuid

EMBEDDING_DIMS = 512
MIN_TEMPLATE_BYTES = 32
MAX_TEMPLATE_BYTES = 16_384

# ISO/IEC 19794-2:2005 (ANSI INCITS 378) — 8-byte magic then big-endian totalLength.
_ISO19794_2_MAGIC = b"FMR\x00 20\x00"
_ISO19794_2_TOTAL_LENGTH_OFFSET = 8


def is_iso19794_fmr_template(data: bytes) -> bool:
    """True for ANSI INCITS 378 / ISO 19794-2 FMR templates (SecuGen scanner output)."""
    return len(data) >= 8 and data[:8] == _ISO19794_2_MAGIC


def normalize_iso19794_template(data: bytes) -> bytes:
    """Patch totalLength to match buffer size (SecuGen often reports 3+ extra bytes)."""
    if len(data) < _ISO19794_2_TOTAL_LENGTH_OFFSET + 4:
        return data
    if data[:8] != _ISO19794_2_MAGIC:
        return data
    declared = int.from_bytes(data[_ISO19794_2_TOTAL_LENGTH_OFFSET : _ISO19794_2_TOTAL_LENGTH_OFFSET + 4], "big")
    actual = len(data)
    if declared == actual:
        return data
    buf = bytearray(data)
    buf[_ISO19794_2_TOTAL_LENGTH_OFFSET : _ISO19794_2_TOTAL_LENGTH_OFFSET + 4] = actual.to_bytes(4, "big")
    return bytes(buf)


def new_print_id() -> str:
    return str(uuid.uuid4())


def validate_template_bytes(data: bytes) -> None:
    if len(data) < MIN_TEMPLATE_BYTES:
        raise ValueError("template_too_small")
    if len(data) > MAX_TEMPLATE_BYTES:
        raise ValueError("template_too_large")


def calibrate_identify_display_score(raw_similarity: float) -> float:
    """
    Map minutiae overlap (typically 12–30% for genuine SecuGen re-capture) to a
    user-facing 0–1 confidence scale. Raw score is kept in logs for tuning.
    """
    if raw_similarity >= 0.99:
        return 1.0
    if raw_similarity < 0.08:
        return max(0.0, raw_similarity)
    # 10% overlap → ~60% display; 25% overlap → ~97% display
    clamped = max(0.10, min(raw_similarity, 0.35))
    return round(0.60 + ((clamped - 0.10) / 0.25) * 0.37, 4)


def identify_confidence_label(raw_similarity: float) -> str:
    if raw_similarity >= 0.20:
        return "strong"
    if raw_similarity >= 0.12:
        return "moderate"
    return "weak"


def template_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def template_to_embedding(template: bytes, *, dims: int = EMBEDDING_DIMS) -> list[float]:
    """Deterministic unit vector from ISO/minutiae template bytes for ES kNN."""
    validate_template_bytes(template)
    vec = [0.0] * dims
    for i in range(dims):
        digest = hashlib.sha256(template + i.to_bytes(4, "big")).digest()
        val = struct.unpack(">i", digest[:4])[0] / (2**31)
        vec[i] = val
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def normalize_embedding(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True))


def template_overlap_score(a: bytes, b: bytes) -> float:
    """Byte-level refinement when raw templates are available."""
    if not a or not b:
        return 0.0
    min_len = min(len(a), len(b))
    matches = sum(1 for i in range(min_len) if a[i] == b[i])
    return matches / max(len(a), len(b))
