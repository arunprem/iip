"""Fingerprint template embedding and similarity (minutiae bytes — no images)."""

from __future__ import annotations

import hashlib
import math
import struct
import uuid

EMBEDDING_DIMS = 512
MIN_TEMPLATE_BYTES = 32
MAX_TEMPLATE_BYTES = 16_384


def new_print_id() -> str:
    return str(uuid.uuid4())


def validate_template_bytes(data: bytes) -> None:
    if len(data) < MIN_TEMPLATE_BYTES:
        raise ValueError("template_too_small")
    if len(data) > MAX_TEMPLATE_BYTES:
        raise ValueError("template_too_large")


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
