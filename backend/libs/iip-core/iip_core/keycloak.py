"""
Keycloak OIDC integration — token grants and JWT validation (JWKS).
"""

from __future__ import annotations

import time
from typing import Any, Literal

AuthClientType = Literal["web", "mobile"]

import httpx
from fastapi import HTTPException, status
from jose import jwt
from jose.exceptions import JWTError
from jose.utils import base64url_decode

from iip_core.settings import BaseServiceSettings

_JWKS_CACHE: dict[str, Any] = {"fetched_at": 0.0, "keys": None}
_JWKS_TTL_SECONDS = 300


class KeycloakAuthError(Exception):
    """Raised when Keycloak rejects credentials or token exchange fails."""


def normalize_auth_client_type(value: str | None) -> AuthClientType:
    if value and value.strip().lower() == "mobile":
        return "mobile"
    return "web"


def allowed_keycloak_client_ids(settings: BaseServiceSettings) -> frozenset[str]:
    return frozenset({settings.keycloak_client_id, settings.keycloak_mobile_client_id})


def keycloak_client_credentials(
    settings: BaseServiceSettings,
    client_type: AuthClientType,
) -> tuple[str, str]:
    if client_type == "mobile":
        return settings.keycloak_mobile_client_id, settings.keycloak_mobile_client_secret
    return settings.keycloak_client_id, settings.keycloak_client_secret


def _realm_base(settings: BaseServiceSettings) -> str:
    base = settings.keycloak_server_url.rstrip("/")
    return f"{base}/realms/{settings.keycloak_realm}"


def _token_url(settings: BaseServiceSettings) -> str:
    return f"{_realm_base(settings)}/protocol/openid-connect/token"


def _jwks_url(settings: BaseServiceSettings) -> str:
    return f"{_realm_base(settings)}/protocol/openid-connect/certs"


def _issuer(settings: BaseServiceSettings) -> str:
    return _realm_base(settings)


async def _fetch_jwks(settings: BaseServiceSettings) -> dict[str, Any]:
    now = time.time()
    if _JWKS_CACHE["keys"] is not None and now - _JWKS_CACHE["fetched_at"] < _JWKS_TTL_SECONDS:
        return _JWKS_CACHE["keys"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(_jwks_url(settings))
        response.raise_for_status()
        keys = response.json()

    _JWKS_CACHE["fetched_at"] = now
    _JWKS_CACHE["keys"] = keys
    return keys


def _rsa_public_key_from_jwk(jwk_dict: dict[str, Any]) -> str:
    """Build PEM public key from a JWK (RSA only)."""
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization

    n = int.from_bytes(base64url_decode(jwk_dict["n"].encode()), "big")
    e = int.from_bytes(base64url_decode(jwk_dict["e"].encode()), "big")
    public_numbers = RSAPublicNumbers(e, n)
    public_key = public_numbers.public_key(default_backend())
    return public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()


async def decode_keycloak_access_token(
    token: str,
    settings: BaseServiceSettings,
) -> dict[str, Any]:
    """Validate a Keycloak access token and return claims."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    kid = header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jwks = await _fetch_jwks(settings)
    jwk_dict = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not jwk_dict:
        _JWKS_CACHE["keys"] = None
        jwks = await _fetch_jwks(settings)
        jwk_dict = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not jwk_dict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    pem = _rsa_public_key_from_jwk(jwk_dict)
    try:
        claims = jwt.decode(
            token,
            pem,
            algorithms=[header.get("alg", "RS256")],
            issuer=_issuer(settings),
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    token_type = claims.get("typ")
    if token_type and str(token_type).upper() == "REFRESH":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh tokens cannot be used for API access.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    azp = claims.get("azp") or claims.get("client_id")
    if azp and azp not in allowed_keycloak_client_ids(settings):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return claims


async def keycloak_password_grant(
    username: str,
    password: str,
    settings: BaseServiceSettings,
    *,
    client_type: AuthClientType = "web",
) -> dict[str, Any]:
    """Exchange username/password for Keycloak tokens (direct access grant)."""
    client_id, client_secret = keycloak_client_credentials(settings, client_type)
    scope = "openid profile email"
    data = {
        "grant_type": "password",
        "client_id": client_id,
        "client_secret": client_secret,
        "username": username,
        "password": password,
        "scope": scope,
    }
    return await _token_request(data, settings)


async def keycloak_refresh_grant(
    refresh_token: str,
    settings: BaseServiceSettings,
    *,
    client_type: AuthClientType = "web",
) -> dict[str, Any]:
    """Rotate tokens using a Keycloak refresh token."""
    client_id, client_secret = keycloak_client_credentials(settings, client_type)
    data = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    }
    return await _token_request(data, settings)


async def _token_request(
    data: dict[str, str],
    settings: BaseServiceSettings,
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            _token_url(settings),
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        detail = "Invalid username or password."
        try:
            body = response.json()
            if body.get("error_description"):
                detail = str(body["error_description"])
            elif body.get("error"):
                detail = str(body["error"])
        except Exception:
            if response.text and "<html" not in response.text.lower()[:200]:
                detail = response.text[:200]
            elif response.status_code == 404:
                detail = (
                    f"Keycloak token endpoint not found at {_token_url(settings)}. "
                    "Check KEYCLOAK_SERVER_URL (use http://localhost:8081 if Keycloak runs via docker-compose)."
                )
        raise KeycloakAuthError(detail)

    payload = response.json()
    if not payload.get("access_token"):
        raise KeycloakAuthError("Keycloak did not return an access token.")
    return payload


def keycloak_token_response(payload: dict[str, Any]) -> dict[str, str | int]:
    """Normalize Keycloak token endpoint JSON for API responses."""
    return {
        "access_token": payload["access_token"],
        "refresh_token": payload.get("refresh_token", ""),
        "expires_in": int(payload.get("expires_in", 3600)),
    }
