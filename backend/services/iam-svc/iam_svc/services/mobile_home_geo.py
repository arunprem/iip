"""Geospatial helpers for mobile home (nearby suspects)."""

from __future__ import annotations

import math
from decimal import Decimal


def haversine_distance_m(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Great-circle distance in metres between two WGS84 points."""
    r = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def bounding_box(
    latitude: float,
    longitude: float,
    radius_m: float,
) -> tuple[float, float, float, float]:
    """Return (min_lat, max_lat, min_lon, max_lon) for a coarse SQL pre-filter."""
    lat_delta = radius_m / 111_320.0
    cos_lat = math.cos(math.radians(latitude)) or 1e-9
    lon_delta = radius_m / (111_320.0 * cos_lat)
    return (
        latitude - lat_delta,
        latitude + lat_delta,
        longitude - lon_delta,
        longitude + lon_delta,
    )


def coord_to_float(value: Decimal | float | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
