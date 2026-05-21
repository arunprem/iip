from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from iip_core.auth import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password
)
from iip_core.settings import BaseServiceSettings

@pytest.fixture
def test_settings():
    return BaseServiceSettings(
        environment="local",
        service_name="test",
        jwt_secret_key="supersecret",
        jwt_algorithm="HS256",
        jwt_access_token_expire_minutes=15,
        jwt_refresh_token_expire_days=7,
        db_dsn="sqlite+aiosqlite:///:memory:",
        opa_url="http://localhost:8181",
        runai_llm_url="http://localhost:8000"
    )

def test_password_hashing():
    password = "super-secret-password"
    hashed = hash_password(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password", hashed) is False

def test_jwt_creation_and_decoding(test_settings):
    payload = {
        "sub": "user-123",
        "username": "asha",
        "roles": ["SENIOR_ANALYST"],
        "jti": "random-uuid"
    }
    
    token = create_access_token(payload, test_settings)
    assert isinstance(token, str)
    
    decoded = decode_token(token, test_settings)
    assert decoded["sub"] == payload["sub"]
    assert decoded["username"] == payload["username"]
    assert "iat" in decoded
    assert "exp" in decoded

def test_jwt_decoding_failure(test_settings):
    with pytest.raises(HTTPException) as exc:
        decode_token("invalid-token", test_settings)
    assert exc.value.status_code == 401
