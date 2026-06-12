"""Template quality checks for SecuGen ISO/FMR enrollments and live capture."""

from __future__ import annotations

from ml_gateway_svc.services.fingerprint_index import parse_fmr_minutiae
from ml_gateway_svc.services.fingerprint_pipeline import normalize_iso19794_template

# Empirical thresholds from SecuGen HU20 field captures in this project.
MIN_ENROLL_BYTES = 250
MIN_ENROLL_MINUTIAE = 38
MIN_IDENTIFY_MINUTIAE = 35
MIN_IDENTIFY_BYTES = 220


def assess_template_quality(template_bytes: bytes) -> dict[str, int | str | bool]:
    normalized = normalize_iso19794_template(template_bytes)
    minutiae = parse_fmr_minutiae(normalized)
    high_q = [m for m in minutiae if m[4] >= 30]
    byte_len = len(normalized)
    count = len(minutiae)

    if count >= MIN_ENROLL_MINUTIAE and byte_len >= MIN_ENROLL_BYTES:
        grade = "good"
        ok = True
        message = "Template quality is good for enrollment and matching."
    elif count >= MIN_IDENTIFY_MINUTIAE and byte_len >= MIN_IDENTIFY_BYTES:
        grade = "fair"
        ok = True
        message = "Acceptable for search; re-capture with full finger contact for best results."
    else:
        grade = "poor"
        ok = False
        message = (
            f"Low quality ({count} minutiae, {byte_len} bytes). "
            "Press finger flat, cover the full sensor, and hold still."
        )

    return {
        "ok": ok,
        "grade": grade,
        "message": message,
        "bytes": byte_len,
        "minutiae_count": count,
        "high_quality_minutiae": len(high_q),
    }


def filter_minutiae_for_match(
    minutiae: list[tuple[int, int, int, int, int]],
    *,
    min_quality: int = 25,
) -> list[tuple[int, int, int, int, int]]:
    return [m for m in minutiae if m[4] >= min_quality]
