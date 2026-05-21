"""User persistence and office-scoped role assignments."""

from __future__ import annotations

import secrets
import uuid
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iip_core.errors import NotFoundError
from iam_svc.models.user import User
from iam_svc.models.user_office_role import UserOfficeRole


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: str | uuid.UUID) -> Optional[User]:
        if isinstance(user_id, str):
            user_id = uuid.UUID(user_id)
        stmt = (
            select(User)
            .options(
                selectinload(User.roles),
                selectinload(User.office_assignments).selectinload(UserOfficeRole.office),
                selectinload(User.office_assignments).selectinload(UserOfficeRole.role),
            )
            .where(User.id == user_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_or_error(self, user_id: str | uuid.UUID) -> User:
        user = await self.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", str(user_id))
        return user

    async def get_by_username(self, username: str) -> Optional[User]:
        stmt = select(User).where(User.username == username)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(func.lower(User.email) == email.lower())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_badge(self, badge_number: str) -> Optional[User]:
        stmt = select(User).where(User.badge_number == badge_number)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_users(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        q: str | None = None,
        active_only: bool | None = None,
    ) -> tuple[list[User], int]:
        filters = []
        if q and q.strip():
            term = f"%{q.strip()}%"
            filters.append(
                or_(
                    User.username.ilike(term),
                    User.full_name.ilike(term),
                    User.email.ilike(term),
                    User.badge_number.ilike(term),
                    User.department.ilike(term),
                )
            )
        if active_only is True:
            filters.append(User.is_active.is_(True))
        elif active_only is False:
            filters.append(User.is_active.is_(False))

        count_stmt = select(func.count()).select_from(User)
        if filters:
            count_stmt = count_stmt.where(*filters)
        total = int((await self.session.execute(count_stmt)).scalar_one())

        stmt = (
            select(User)
            .options(
                selectinload(User.roles),
                selectinload(User.office_assignments).selectinload(UserOfficeRole.office),
                selectinload(User.office_assignments).selectinload(UserOfficeRole.role),
            )
            .order_by(User.full_name.asc(), User.username.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        if filters:
            stmt = stmt.where(*filters)
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all()), total

    async def create(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        return await self.get_by_id_or_error(user.id)

    async def update(self, user: User) -> User:
        await self.session.flush()
        return await self.get_by_id_or_error(user.id)

    async def assign_role(
        self,
        user: User,
        role: "Role",
        granted_by: Optional[str] = None,
        justification: Optional[str] = None,
    ) -> None:
        if role not in user.roles:
            user.roles.append(role)
            await self.session.flush()

    async def replace_office_assignments(
        self,
        user_id: uuid.UUID,
        assignments: list[tuple[uuid.UUID, uuid.UUID]],
    ) -> list[UserOfficeRole]:
        seen_offices: set[uuid.UUID] = set()
        for office_id, _ in assignments:
            if office_id in seen_offices:
                raise ValueError("duplicate_office")
            seen_offices.add(office_id)

        user = await self.get_by_id_or_error(user_id)
        # Clear via ORM so in-memory state matches DB (bulk DELETE breaks cascade tracking).
        user.office_assignments.clear()
        await self.session.flush()

        for office_id, role_id in assignments:
            user.office_assignments.append(
                UserOfficeRole(office_id=office_id, role_id=role_id)
            )
        await self.session.flush()
        await self.session.refresh(user, attribute_names=["office_assignments"])

        stmt = (
            select(UserOfficeRole)
            .options(
                selectinload(UserOfficeRole.office),
                selectinload(UserOfficeRole.role),
            )
            .where(UserOfficeRole.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())

    @staticmethod
    def generate_temp_password() -> str:
        return secrets.token_urlsafe(10)
