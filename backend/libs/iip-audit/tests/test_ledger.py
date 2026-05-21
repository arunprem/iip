import pytest
from iip_audit.ledger import AuditLogger, AuditAction

@pytest.mark.asyncio
async def test_ledger_chaining_and_verification():
    logger = AuditLogger(service_name="test-svc", signing_key="test-secret")
    
    event1 = await logger.log(
        action=AuditAction.USER_LOGIN,
        actor_id="user-1",
        actor_username="asha",
        resource="system",
        outcome="SUCCESS"
    )
    
    assert event1.previous_hash == "GENESIS"
    assert event1.current_hash is not None
    
    event2 = await logger.log(
        action=AuditAction.RECORD_READ,
        actor_id="user-1",
        actor_username="asha",
        resource="case:123",
        outcome="SUCCESS"
    )
    
    assert event2.previous_hash == event1.current_hash
    
    # Verification
    assert logger.verify_chain([event1, event2]) is True

@pytest.mark.asyncio
async def test_ledger_tampering_detection():
    logger = AuditLogger(service_name="test-svc", signing_key="test-secret")
    
    event1 = await logger.log(
        action=AuditAction.USER_LOGIN,
        actor_id="user-1",
        actor_username="asha",
        resource="system"
    )
    
    event2 = await logger.log(
        action=AuditAction.RECORD_READ,
        actor_id="user-1",
        actor_username="asha",
        resource="case:123"
    )
    
    # Tamper with event1
    event1.outcome = "FAILURE"
    
    # Verification should fail
    assert logger.verify_chain([event1, event2]) is False
