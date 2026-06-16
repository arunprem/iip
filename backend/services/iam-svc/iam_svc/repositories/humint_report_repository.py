from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iam_svc.models.humint_report import HumintReport, HumintReportAttachment


class HumintReportRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_report(self, payload: dict[str, Any]) -> HumintReport:
        row = HumintReport(**payload)
        self.session.add(row)
        await self.session.flush()
        return row

    async def get_report(self, report_id: uuid.UUID) -> HumintReport | None:
        stmt = (
            select(HumintReport)
            .options(selectinload(HumintReport.attachments))
            .where(HumintReport.id == report_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_reports(
        self,
        *,
        office_id: uuid.UUID,
        cross_unit: bool,
        q: str | None = None,
        report_type: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[HumintReport], int]:
        stmt = select(HumintReport).options(selectinload(HumintReport.attachments)).order_by(HumintReport.created_at.desc())
        count_stmt = select(func.count()).select_from(HumintReport)

        if not cross_unit:
            stmt = stmt.where(HumintReport.office_id == office_id)
            count_stmt = count_stmt.where(HumintReport.office_id == office_id)

        if report_type:
            stmt = stmt.where(HumintReport.report_type == report_type)
            count_stmt = count_stmt.where(HumintReport.report_type == report_type)
        if status:
            stmt = stmt.where(HumintReport.status == status)
            count_stmt = count_stmt.where(HumintReport.status == status)
        if q and q.strip():
            term = f"%{q.strip().lower()}%"
            filters = or_(
                func.lower(HumintReport.title).like(term),
                func.lower(HumintReport.narrative).like(term),
                func.lower(func.coalesce(HumintReport.llm_summary, "")).like(term),
                func.lower(func.coalesce(HumintReport.location_text, "")).like(term),
                func.lower(func.coalesce(HumintReport.search_text, "")).like(term),
            )
            stmt = stmt.where(filters)
            count_stmt = count_stmt.where(filters)

        total = int((await self.session.execute(count_stmt)).scalar_one())
        offset = max(0, (page - 1) * page_size)
        rows = await self.session.execute(stmt.offset(offset).limit(page_size))
        return list(rows.scalars().unique().all()), total

    async def add_attachment(self, payload: dict[str, Any]) -> HumintReportAttachment:
        row = HumintReportAttachment(**payload)
        self.session.add(row)
        await self.session.flush()
        return row

    async def update_report_enrichment(
        self,
        report_id: uuid.UUID,
        *,
        llm_summary: str | None,
        llm_structured_report: str | None,
        llm_entities: dict[str, Any] | None,
        search_text: str | None,
    ) -> HumintReport | None:
        row = await self.get_report(report_id)
        if row is None:
            return None
        row.llm_summary = llm_summary
        row.llm_structured_report = llm_structured_report
        row.llm_entities = llm_entities
        row.search_text = search_text
        await self.session.flush()
        return row

    async def update_attachment_extraction(
        self,
        attachment_id: uuid.UUID,
        *,
        extracted_text: str | None,
        ocr_text: str | None,
        vision_caption: str | None,
        audio_transcript: str | None,
        vector_status: str,
    ) -> HumintReportAttachment | None:
        row = await self.session.get(HumintReportAttachment, attachment_id)
        if row is None:
            return None
        row.extracted_text = extracted_text
        row.ocr_text = ocr_text
        row.vision_caption = vision_caption
        row.audio_transcript = audio_transcript
        row.vector_status = vector_status
        await self.session.flush()
        return row
