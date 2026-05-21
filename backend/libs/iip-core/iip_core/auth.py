"""
IIP Core — JWT Authentication Dependencies.

Provides:
  - JWT token creation (access & refresh tokens)
  - Current user extraction FastAPI dependency
  - Password hashing utilities
  - Session identity and claims models
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel

from iip_core.settings import BaseServiceSettings, ClassificationLevel, get_settings

# ─── Password Hashing ─────────────────────────────────────────────────────────
# Handled directly via bcrypt

# ─── HTTP Bearer extraction ────────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=True)


# ─── Pydantic Claims Models ────────────────────────────────────────────────────


class TokenClaims(BaseModel):
    """Parsed JWT token claims for an authenticated IIP session."""

    sub: str  # User ID
    username: str
    roles: list[str]
    groups: list[str]
    clearance_level: ClassificationLevel
    jit_elevated: bool = False
    jti: str  # JWT ID for revocation tracking
    exp: datetime
    iat: datetime


class CurrentUser(BaseModel):
    """Resolved identity for use across request handlers."""

    user_id: str
    username: str
    roles: list[str]
    groups: list[str]
    clearance_level: ClassificationLevel
    jit_elevated: bool
    token_jti: str


# ─── Token Utilities ──────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the given password."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(
    payload: dict[str, Any],
    settings: BaseServiceSettings,
) -> str:
    """Create a signed JWT access token."""
    data = payload.copy()
    now = datetime.now(timezone.utc)
    data["iat"] = now
    data["exp"] = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    return jwt.encode(data, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    user_id: str,
    jti: str,
    settings: BaseServiceSettings,
) -> str:
    """Create a signed JWT refresh token. Stored server-side in Redis."""
    now = datetime.now(timezone.utc)
    data = {
        "sub": user_id,
        "jti": jti,
        "type": "refresh",
        "iat": now,
        "exp": now + timedelta(days=settings.jwt_refresh_token_expire_days),
    }
    return jwt.encode(data, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, settings: BaseServiceSettings) -> dict[str, Any]:
    """Decode and verify a JWT token, raising HTTPException on failure."""
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ─── FastAPI Dependency ────────────────────────────────────────────────────────


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> CurrentUser:
    """FastAPI dependency: extract and validate the current authenticated user."""
    raw = decode_token(credentials.credentials, settings)

    if raw.get("type") == "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh tokens cannot be used for API access.",
        )

    return CurrentUser(
        user_id=raw["sub"],
        username=raw["username"],
        roles=raw.get("roles", []),
        groups=raw.get("groups", []),
        clearance_level=ClassificationLevel(raw.get("clearance_level", "UNCLASSIFIED")),
        jit_elevated=raw.get("jit_elevated", False),
        token_jti=raw["jti"],
    )


def require_role(role: str):
    """FastAPI dependency factory: assert that the current user holds a specific role."""

    def _checker(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if role not in user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is required to access this resource.",
            )
        return user

    return _checker


def require_any_role(*roles: str):
    """FastAPI dependency factory: assert the user holds at least one of the given roles."""

    allowed = set(roles)

    def _checker(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if not allowed.intersection(user.roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of roles {sorted(allowed)} is required to access this resource.",
            )
        return user

    return _checker


def require_clearance(level: ClassificationLevel):
    """FastAPI dependency factory: assert that the current user has sufficient clearance."""

    order = list(ClassificationLevel)

    def _checker(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        user_idx = order.index(user.clearance_level)
        required_idx = order.index(level)
        if user_idx < required_idx:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Clearance level '{level}' is required.",
            )
        return user

    return _checker
