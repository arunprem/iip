"""Nested-set tree operations for iam.offices."""

from __future__ import annotations

import uuid
from enum import StrEnum

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.errors import ErrorCode, IIPException
from iam_svc.models.office import Office


class InsertPosition(StrEnum):
    ROOT = "root"
    LAST_CHILD = "last_child"
    FIRST_CHILD = "first_child"
    BEFORE = "before"
    AFTER = "after"


class OfficeNestedSetService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, office_id: uuid.UUID) -> Office:
        office = await self.session.get(Office, office_id)
        if not office:
            raise IIPException(
                status_code=404,
                error_code=ErrorCode.NOT_FOUND,
                detail="Office not found.",
            )
        return office

    async def list_in_tree(self, root_id: uuid.UUID, include_inactive: bool = True) -> list[Office]:
        root = await self.get_by_id(root_id)
        stmt = (
            select(Office)
            .where(Office.root_id == root.root_id)
            .where(Office.lft >= root.lft, Office.rgt <= root.rgt)
            .order_by(Office.lft)
        )
        if not include_inactive:
            stmt = stmt.where(Office.is_active.is_(True))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_all_ordered(self, include_inactive: bool = True) -> list[Office]:
        stmt = select(Office).order_by(Office.root_id, Office.lft)
        if not include_inactive:
            stmt = stmt.where(Office.is_active.is_(True))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_node(
        self,
        *,
        office_code: str,
        office_name: str,
        parent_id: uuid.UUID | None = None,
        position: InsertPosition = InsertPosition.LAST_CHILD,
        reference_id: uuid.UUID | None = None,
        **fields,
    ) -> Office:
        if position == InsertPosition.ROOT or parent_id is None:
            return await self._create_root(
                office_code=office_code,
                office_name=office_name,
                **fields,
            )

        parent = await self.get_by_id(parent_id)
        if position == InsertPosition.FIRST_CHILD:
            insert_at = parent.lft + 1
        elif position == InsertPosition.LAST_CHILD:
            insert_at = parent.rgt
        elif position in (InsertPosition.BEFORE, InsertPosition.AFTER):
            if not reference_id:
                raise IIPException(
                    status_code=400,
                    error_code=ErrorCode.VALIDATION_ERROR,
                    detail="reference_id is required for before/after insertion.",
                )
            ref = await self.get_by_id(reference_id)
            if ref.root_id != parent.root_id:
                raise IIPException(
                    status_code=400,
                    error_code=ErrorCode.VALIDATION_ERROR,
                    detail="Reference node must belong to the same tree.",
                )
            insert_at = ref.lft if position == InsertPosition.BEFORE else ref.rgt + 1
        else:
            insert_at = parent.rgt

        await self._open_gap(parent.root_id, insert_at, width=2)
        office = Office(
            office_code=office_code,
            office_name=office_name,
            parent_id=parent.id,
            lft=insert_at,
            rgt=insert_at + 1,
            hlevel=parent.hlevel + 1,
            root_id=parent.root_id,
            **fields,
        )
        self.session.add(office)
        await self.session.flush()
        return office

    async def move_node(
        self,
        node_id: uuid.UUID,
        *,
        new_parent_id: uuid.UUID | None,
        position: InsertPosition = InsertPosition.LAST_CHILD,
        reference_id: uuid.UUID | None = None,
    ) -> Office:
        node = await self.get_by_id(node_id)
        width = node.rgt - node.lft + 1
        old_root_id = node.root_id
        old_lft = node.lft

        if new_parent_id == node.id:
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="Cannot move a node under itself.",
            )

        if new_parent_id:
            new_parent = await self.get_by_id(new_parent_id)
            if new_parent.root_id == old_root_id and new_parent.lft < node.lft < new_parent.rgt:
                raise IIPException(
                    status_code=400,
                    error_code=ErrorCode.VALIDATION_ERROR,
                    detail="Cannot move a node into its own descendant.",
                )

        # Mark subtree negative (extract from tree)
        await self.session.execute(
            update(Office)
            .where(
                Office.root_id == old_root_id,
                Office.lft >= old_lft,
                Office.rgt <= node.rgt,
            )
            .values(lft=-Office.lft, rgt=-Office.rgt)
        )
        await self._close_gap(old_root_id, old_lft, width)

        if new_parent_id is None:
            max_rgt = await self._max_rgt()
            insert_at = max_rgt + 1
            target_root_id = node.id
            new_parent_level = -1
            new_parent_uuid = None
            use_global_gap = True
        else:
            use_global_gap = False
            new_parent = await self.get_by_id(new_parent_id)
            target_root_id = new_parent.root_id
            new_parent_uuid = new_parent.id
            new_parent_level = new_parent.hlevel
            if position == InsertPosition.FIRST_CHILD:
                insert_at = new_parent.lft + 1
            elif position == InsertPosition.LAST_CHILD:
                insert_at = new_parent.rgt
            elif position in (InsertPosition.BEFORE, InsertPosition.AFTER):
                if not reference_id:
                    raise IIPException(
                        status_code=400,
                        error_code=ErrorCode.VALIDATION_ERROR,
                        detail="reference_id is required for before/after move.",
                    )
                ref = await self.get_by_id(reference_id)
                insert_at = ref.lft if position == InsertPosition.BEFORE else ref.rgt + 1
            else:
                insert_at = new_parent.rgt

        if use_global_gap:
            await self._open_gap_global(insert_at, width)
        else:
            await self._open_gap(target_root_id, insert_at, width)
        await self.session.execute(
            update(Office)
            .where(Office.lft < 0)
            .values(
                lft=-Office.lft + insert_at - old_lft,
                rgt=-Office.rgt + insert_at - old_lft,
                root_id=target_root_id,
            )
        )
        moved = await self.get_by_id(node_id)
        moved.parent_id = new_parent_uuid
        moved.hlevel = new_parent_level + 1
        if new_parent_id is None:
            moved.root_id = moved.id
            moved.hlevel = 0
        await self._relevel_subtree(moved)
        await self.session.flush()
        return await self.get_by_id(node_id)

    async def delete_subtree(self, office_id: uuid.UUID) -> None:
        node = await self.get_by_id(office_id)
        width = node.rgt - node.lft + 1
        await self.session.execute(
            Office.__table__.delete().where(
                Office.lft >= node.lft,
                Office.rgt <= node.rgt,
                Office.root_id == node.root_id,
            )
        )
        await self._close_gap(node.root_id, node.lft, width)

    async def count_descendants(self, office_id: uuid.UUID) -> int:
        node = await self.get_by_id(office_id)
        return (node.rgt - node.lft - 1) // 2

    async def rebuild_forest(self) -> int:
        """Rebuild nested-set values from parent_id links (maintenance)."""
        roots_result = await self.session.execute(
            select(Office).where(Office.parent_id.is_(None)).order_by(Office.office_name)
        )
        roots = list(roots_result.scalars().all())
        cursor = 1
        for root in roots:
            cursor = await self._assign_subtree(root.id, root.id, cursor, 0, None)
        return cursor - 1

    async def _create_root(self, *, office_code: str, office_name: str, **fields) -> Office:
        max_rgt = await self._max_rgt()
        lft = max_rgt + 1
        office = Office(
            office_code=office_code,
            office_name=office_name,
            parent_id=None,
            lft=lft,
            rgt=lft + 1,
            hlevel=0,
            **fields,
        )
        self.session.add(office)
        await self.session.flush()
        office.root_id = office.id
        await self.session.flush()
        return office

    async def _open_gap_global(self, at: int, width: int) -> None:
        await self.session.execute(
            update(Office).where(Office.rgt >= at).values(rgt=Office.rgt + width)
        )
        await self.session.execute(
            update(Office).where(Office.lft > at).values(lft=Office.lft + width)
        )

    async def _open_gap(self, root_id: uuid.UUID, at: int, width: int) -> None:
        await self.session.execute(
            update(Office)
            .where(Office.root_id == root_id, Office.rgt >= at)
            .values(rgt=Office.rgt + width)
        )
        await self.session.execute(
            update(Office)
            .where(Office.root_id == root_id, Office.lft > at)
            .values(lft=Office.lft + width)
        )

    async def _close_gap(self, root_id: uuid.UUID, at: int, width: int) -> None:
        await self.session.execute(
            update(Office)
            .where(Office.root_id == root_id, Office.lft > at)
            .values(lft=Office.lft - width)
        )
        await self.session.execute(
            update(Office)
            .where(Office.root_id == root_id, Office.rgt > at)
            .values(rgt=Office.rgt - width)
        )

    async def _max_rgt(self) -> int:
        from sqlalchemy import func

        result = await self.session.execute(select(func.coalesce(func.max(Office.rgt), 0)))
        return int(result.scalar_one())

    async def _relevel_subtree(self, root_node: Office) -> None:
        """Recalculate hlevel for all descendants from parent links."""
        nodes_result = await self.session.execute(
            select(Office)
            .where(Office.root_id == root_node.root_id)
            .order_by(Office.lft)
        )
        nodes = list(nodes_result.scalars().all())
        by_id = {n.id: n for n in nodes}
        for n in nodes:
            if n.id == root_node.id:
                continue
            parent = by_id.get(n.parent_id) if n.parent_id else None
            n.hlevel = (parent.hlevel + 1) if parent else 0

    async def _assign_subtree(
        self,
        node_id: uuid.UUID,
        root_id: uuid.UUID,
        cursor: int,
        level: int,
        parent_id: uuid.UUID | None,
    ) -> int:
        node = await self.get_by_id(node_id)
        node.lft = cursor
        node.rgt = cursor + 1
        node.hlevel = level
        node.root_id = root_id
        node.parent_id = parent_id
        cursor += 1
        children_result = await self.session.execute(
            select(Office)
            .where(Office.parent_id == node_id)
            .order_by(Office.list_order.nulls_last(), Office.office_name)
        )
        for child in children_result.scalars().all():
            cursor = await self._assign_subtree(child.id, root_id, cursor, level + 1, node_id)
        node.rgt = cursor + 1
        cursor = node.rgt + 1
        await self.session.flush()
        return cursor
