import uuid
from typing import Optional, List, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from iip_core.errors import NotFoundError
from iam_svc.models.user import User

class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: str | uuid.UUID) -> Optional[User]:
        if isinstance(user_id, str):
            user_id = uuid.UUID(user_id)
        stmt = select(User).options(selectinload(User.roles)).where(User.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_or_error(self, user_id: str | uuid.UUID) -> User:
        user = await self.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", str(user_id))
        return user

    async def get_by_username(self, username: str) -> Optional[User]:
        stmt = select(User).options(selectinload(User.roles)).where(User.username == username)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_users(self, page: int = 1, page_size: int = 20) -> Tuple[List[User], int]:
        count_stmt = select(func.count()).select_from(User)
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar_one()

        stmt = (
            select(User)
            .options(selectinload(User.roles))
            .order_by(User.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.session.execute(stmt)
        users = list(result.scalars().all())
        
        return users, total

    async def create(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        # Ensure relationships are loaded
        return await self.get_by_id_or_error(user.id)

    async def assign_role(self, user: User, role: "Role", granted_by: Optional[str] = None, justification: Optional[str] = None) -> None:
        if role not in user.roles:
            user.roles.append(role)
            await self.session.flush()
