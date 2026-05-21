import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iip_core.errors import NotFoundError
from iam_svc.models.menu import Menu


class MenuRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(self, include_inactive: bool = False) -> list[Menu]:
        stmt = select(Menu).options(
            selectinload(Menu.privilege),
            selectinload(Menu.children).selectinload(Menu.privilege),
        ).order_by(Menu.section, Menu.sort_order)
        if not include_inactive:
            stmt = stmt.where(Menu.is_active.is_(True))
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())

    async def get_by_id(self, menu_id: str | uuid.UUID) -> Optional[Menu]:
        if isinstance(menu_id, str):
            menu_id = uuid.UUID(menu_id)
        stmt = (
            select(Menu)
            .options(selectinload(Menu.privilege), selectinload(Menu.children))
            .where(Menu.id == menu_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_or_error(self, menu_id: str | uuid.UUID) -> Menu:
        menu = await self.get_by_id(menu_id)
        if not menu:
            raise NotFoundError("Menu", str(menu_id))
        return menu

    async def get_by_key(self, menu_key: str) -> Optional[Menu]:
        stmt = select(Menu).where(Menu.menu_key == menu_key)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, menu: Menu) -> Menu:
        self.session.add(menu)
        await self.session.flush()
        return await self.get_by_id_or_error(menu.id)

    async def update(self, menu: Menu) -> Menu:
        await self.session.flush()
        return await self.get_by_id_or_error(menu.id)
