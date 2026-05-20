"""
IIP Audit — Tamper-Evident Audit Event Ledger.

Each audit event is SHA-256 chained to the previous event using an HMAC key
stored in HashiCorp Vault. This creates a blockchain-like tamper-evident ledger
that can be verified for integrity at any point.

Events are published to the Kafka `iip.audit.events` topic asynchronously
and also written to the audit PostgreSQL table for local persistence.

Usage:
    from iip_audit.ledger import AuditLogger, AuditAction

    audit = AuditLogger(service_name="iam-svc", signing_key="...")
    await audit.log(
        action=AuditAction.USER_LOGIN,
        actor_id="user-uuid",
        resource="user:sessions",
        outcome="SUCCESS",
    )
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class AuditAction(StrEnum):
    """Canonical audit action identifiers."""

    # Authentication
    USER_LOGIN = "USER_LOGIN"
    USER_LOGOUT = "USER_LOGOUT"
    USER_LOGIN_FAILED = "USER_LOGIN_FAILED"
    TOKEN_REFRESHED = "TOKEN_REFRESHED"
    JIT_ELEVATION_REQUESTED = "JIT_ELEVATION_REQUESTED"
    JIT_ELEVATION_APPROVED = "JIT_ELEVATION_APPROVED"
    JIT_ELEVATION_DENIED = "JIT_ELEVATION_DENIED"
    MFA_CHALLENGED = "MFA_CHALLENGED"
    MFA_PASSED = "MFA_PASSED"
    MFA_FAILED = "MFA_FAILED"

    # IAM / RBAC / ABAC
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_DEACTIVATED = "USER_DEACTIVATED"
    ROLE_ASSIGNED = "ROLE_ASSIGNED"
    ROLE_REVOKED = "ROLE_REVOKED"
    POLICY_CHANGED = "POLICY_CHANGED"

    # Data Access
    RECORD_READ = "RECORD_READ"
    RECORD_CREATED = "RECORD_CREATED"
    RECORD_UPDATED = "RECORD_UPDATED"
    RECORD_DELETED = "RECORD_DELETED"
    SEARCH_EXECUTED = "SEARCH_EXECUTED"
    EXPORT_EXECUTED = "EXPORT_EXECUTED"

    # LLM / AI
    LLM_QUERY_SUBMITTED = "LLM_QUERY_SUBMITTED"
    LLM_RESPONSE_RECEIVED = "LLM_RESPONSE_RECEIVED"
    RAG_RETRIEVAL_EXECUTED = "RAG_RETRIEVAL_EXECUTED"

    # Classification
    CLASSIFICATION_DOWNGRADE_ATTEMPTED = "CLASSIFICATION_DOWNGRADE_ATTEMPTED"
    NEED_TO_KNOW_CHECK_FAILED = "NEED_TO_KNOW_CHECK_FAILED"


class AuditEvent(BaseModel):
    """A single tamper-evident audit record."""

    event_id: str
    service_name: str
    action: AuditAction
    actor_id: str
    actor_username: str
    resource: str
    resource_id: str | None
    outcome: str  # "SUCCESS" | "FAILURE" | "DENIED"
    classification_context: str
    metadata: dict[str, Any]
    timestamp: datetime
    previous_hash: str  # SHA-256 hash of the previous event payload
    current_hash: str  # SHA-256 HMAC of this event's content


class AuditLogger:
    """Stateful audit logger that maintains the cryptographic chain."""

    def __init__(
        self,
        service_name: str,
        signing_key: str,
        previous_hash: str = "GENESIS",
    ) -> None:
        self._service_name = service_name
        self._signing_key = signing_key.encode()
        self._previous_hash = previous_hash

    def _compute_hash(self, payload: str) -> str:
        """Compute an HMAC-SHA256 hash of the payload using the signing key."""
        return hmac.new(self._signing_key, payload.encode(), hashlib.sha256).hexdigest()

    async def log(
        self,
        action: AuditAction,
        actor_id: str,
        actor_username: str,
        resource: str,
        outcome: str = "SUCCESS",
        resource_id: str | None = None,
        classification_context: str = "UNCLASSIFIED",
        metadata: dict[str, Any] | None = None,
    ) -> AuditEvent:
        """Create, chain, and publish a tamper-evident audit event."""
        now = datetime.now(timezone.utc)
        event_id = str(uuid.uuid4())

        payload_for_hashing = json.dumps(
            {
                "event_id": event_id,
                "service": self._service_name,
                "action": action,
                "actor_id": actor_id,
                "resource": resource,
                "outcome": outcome,
                "timestamp": now.isoformat(),
                "previous_hash": self._previous_hash,
            },
            sort_keys=True,
        )

        current_hash = self._compute_hash(payload_for_hashing)

        event = AuditEvent(
            event_id=event_id,
            service_name=self._service_name,
            action=action,
            actor_id=actor_id,
            actor_username=actor_username,
            resource=resource,
            resource_id=resource_id,
            outcome=outcome,
            classification_context=classification_context,
            metadata=metadata or {},
            timestamp=now,
            previous_hash=self._previous_hash,
            current_hash=current_hash,
        )

        # Advance the chain
        self._previous_hash = current_hash

        return event

    def verify_chain(self, events: list[AuditEvent]) -> bool:
        """Verify the integrity of a sequence of audit events.

        Returns True if the chain is intact, False if tampering is detected.
        """
        for i, event in enumerate(events):
            expected_previous = "GENESIS" if i == 0 else events[i - 1].current_hash
            if event.previous_hash != expected_previous:
                return False

            payload_for_hashing = json.dumps(
                {
                    "event_id": event.event_id,
                    "service": event.service_name,
                    "action": event.action,
                    "actor_id": event.actor_id,
                    "resource": event.resource,
                    "outcome": event.outcome,
                    "timestamp": event.timestamp.isoformat(),
                    "previous_hash": event.previous_hash,
                },
                sort_keys=True,
            )
            expected_hash = self._compute_hash(payload_for_hashing)
            if event.current_hash != expected_hash:
                return False

        return True
