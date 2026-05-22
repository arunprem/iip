"""Keycloak Admin REST API — keep Postgres users in sync with Keycloak credentials."""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from iip_core.settings import BaseServiceSettings

logger = structlog.get_logger(__name__)


class KeycloakAdminService:
    def __init__(self, settings: BaseServiceSettings) -> None:
        self._settings = settings
        self._admin_base = (
            f"{settings.keycloak_server_url.rstrip('/')}/admin/realms/{settings.keycloak_realm}"
        )

    async def _admin_token(self) -> str:
        url = (
            f"{self._settings.keycloak_server_url.rstrip('/')}"
            "/realms/master/protocol/openid-connect/token"
        )
        data = {
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": self._settings.keycloak_admin_username,
            "password": self._settings.keycloak_admin_password,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, data=data)
        response.raise_for_status()
        return response.json()["access_token"]

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any | None = None,
        params: dict[str, str] | None = None,
        expected_status: tuple[int, ...] = (200, 201, 204),
    ) -> httpx.Response:
        token = await self._admin_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.request(
                method,
                f"{self._admin_base}{path}",
                headers=headers,
                json=json,
                params=params,
            )
        if response.status_code not in expected_status:
            logger.warning(
                "keycloak_admin_request_failed",
                method=method,
                path=path,
                status=response.status_code,
                body=response.text[:500],
            )
            response.raise_for_status()
        return response

    async def find_user_id(self, username: str) -> str | None:
        response = await self._request(
            "GET",
            "/users",
            params={"username": username, "exact": "true"},
            expected_status=(200,),
        )
        users = response.json()
        for user in users:
            if user.get("username") == username:
                return user["id"]
        return None

    async def upsert_user(
        self,
        *,
        username: str,
        email: str,
        full_name: str,
        password: str,
        enabled: bool = True,
    ) -> None:
        """Create or update a Keycloak user and set password."""
        parts = full_name.strip().split(None, 1)
        first_name = parts[0] if parts else username
        last_name = parts[1] if len(parts) > 1 else "-"

        user_id = await self.find_user_id(username)
        body = {
            "username": username,
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "enabled": enabled,
            "emailVerified": True,
        }

        if user_id is None:
            await self._request("POST", "/users", json=body, expected_status=(201,))
            user_id = await self.find_user_id(username)
            if not user_id:
                raise RuntimeError(f"Keycloak user '{username}' was not created.")
            logger.info("keycloak_user_created", username=username)
        else:
            await self._request("PUT", f"/users/{user_id}", json=body, expected_status=(204,))
            logger.info("keycloak_user_updated", username=username)

        await self.set_password(username, password)
        if not enabled:
            await self.set_enabled(username, False)

    async def set_password(self, username: str, password: str) -> None:
        user_id = await self.find_user_id(username)
        if not user_id:
            raise RuntimeError(f"Keycloak user '{username}' not found.")
        await self._request(
            "PUT",
            f"/users/{user_id}/reset-password",
            json={"type": "password", "value": password, "temporary": False},
            expected_status=(204,),
        )

    async def set_enabled(self, username: str, enabled: bool) -> None:
        user_id = await self.find_user_id(username)
        if not user_id:
            raise RuntimeError(f"Keycloak user '{username}' not found.")
        await self._request(
            "PUT",
            f"/users/{user_id}",
            json={"enabled": enabled},
            expected_status=(204,),
        )
