"""
One-off sync: provision all active IAM users into Keycloak.

Uses KEYCLOAK_SYNC_PASSWORD for users that need a password set in Keycloak
(admin should distribute new passwords or run per-user updates via User Management).

Usage:
  cd backend/services/iam-svc
  KEYCLOAK_SYNC_PASSWORD='ChangeMe@IIP2026!' uv run python -m iam_svc.scripts.sync_users_to_keycloak
"""

from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import select

from iip_core.db import get_db_context, init_db
from iip_core.settings import BaseServiceSettings
from iam_svc.models.user import User
from iam_svc.services.keycloak_admin import KeycloakAdminService


async def main() -> None:
    sync_password = os.environ.get("KEYCLOAK_SYNC_PASSWORD")
    if not sync_password:
        print("Set KEYCLOAK_SYNC_PASSWORD to the password to apply in Keycloak.", file=sys.stderr)
        sys.exit(1)

    settings = BaseServiceSettings(service_name="iam-svc")
    init_db(settings)

    kc = KeycloakAdminService(settings)
    async with get_db_context() as session:
        result = await session.execute(select(User).where(User.is_active.is_(True)))
        users = list(result.scalars().all())

    for user in users:
        await kc.upsert_user(
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            password=sync_password,
            enabled=True,
        )
        print(f"Synced {user.username}")

    print(f"Done. {len(users)} user(s) synced to Keycloak realm '{settings.keycloak_realm}'.")


if __name__ == "__main__":
    asyncio.run(main())
