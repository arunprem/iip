"""Build notification payloads for WebSocket delivery."""

from __future__ import annotations

from datetime import datetime, timezone


def mfa_policy_changed_event(*, force_mfa: bool, changed_by: str) -> dict:
    if force_mfa:
        return {
            "type": "system.security.mfa_policy",
            "notification_type": "alert",
            "title": "Two-factor authentication required",
            "message": (
                "Your organization now requires two-factor authentication for all users. "
                "Set up Google Authenticator (or compatible app) on your next sign-in or from My Profile."
            ),
            "force_mfa": True,
            "changed_by": changed_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    return {
        "type": "system.security.mfa_policy",
        "notification_type": "info",
        "title": "Two-factor authentication policy updated",
        "message": (
            "Mandatory two-factor authentication has been turned off. "
            "You may still enable 2FA voluntarily from My Profile."
        ),
        "force_mfa": False,
        "changed_by": changed_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
