"""Exact cosine similarity helpers for suspect face matching."""

from __future__ import annotations

import numpy as np

from ml_gateway_svc.services.face_pipeline import normalize_embedding


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity for two vectors in [-1, 1] (typically [0, 1] for face embeddings)."""
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = float(np.linalg.norm(va))
    nb = float(np.linalg.norm(vb))
    if na <= 1e-9 or nb <= 1e-9:
        return 0.0
    return float(np.dot(va / na, vb / nb))


def exact_match_score(query: list[float], document: list[float]) -> float:
    """Re-score a candidate with normalized exact cosine (0 = different, 1 = identical)."""
    return max(0.0, cosine_similarity(normalize_embedding(query), normalize_embedding(document)))


def apply_match_margin(
    scored: list[tuple[float, object]],
    *,
    min_gap: float,
    high_confidence: float,
) -> list[tuple[float, object]]:
    """
    Drop ambiguous top hits when the best and second-best scores are too close.
    Keeps a clear winner when similarity is very high.
    """
    if len(scored) < 2 or min_gap <= 0:
        return scored
    top, second = scored[0][0], scored[1][0]
    if top >= high_confidence:
        return scored
    if top - second < min_gap:
        return []
    return scored
