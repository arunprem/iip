"""Helpers for suspect address collections (permanent + present)."""

from __future__ import annotations

from iam_svc.models.suspect_dossier import Suspect, SuspectAddress


def get_address_by_kind(
    addresses: list[SuspectAddress] | None, *, is_permanent: bool
) -> SuspectAddress | None:
    if not addresses:
        return None
    for addr in addresses:
        if addr.is_permanent is is_permanent:
            return addr
    return None


def get_primary_address(suspect: Suspect) -> SuspectAddress | None:
    """Permanent address if present, otherwise the first stored address."""
    addrs = list(suspect.addresses or [])
    return get_address_by_kind(addrs, is_permanent=True) or (addrs[0] if addrs else None)
