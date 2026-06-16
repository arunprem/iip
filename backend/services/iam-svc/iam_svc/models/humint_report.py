from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from iip_core.db import Base


class HumintReport(Base):
    __tablename__ = "humint_reports"
    __table_args__ = {"schema": "intelligence"}

    office_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.offices.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    reported_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    report_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="DRAFT", index=True)
    narrative: Mapped[str] = mapped_column(Text, nullable=False)
    event_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    location_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[str | None] = mapped_column(String(30), nullable=True)
    longitude: Mapped[str | None] = mapped_column(String(30), nullable=True)
    urgency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    supervisor_cross_unit_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linked_suspect_dossier_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("intelligence.suspect_dossiers.id", ondelete="SET NULL"), nullable=True
    )
    linked_case_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    linked_hotspot_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    linked_graph_node_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    llm_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_structured_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_entities: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    search_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    attachments: Mapped[list["HumintReportAttachment"]] = relationship(
        "HumintReportAttachment", back_populates="report", cascade="all, delete-orphan", lazy="selectin"
    )


class HumintReportAttachment(Base):
    __tablename__ = "humint_report_attachments"
    __table_args__ = {"schema": "intelligence"}

    report_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("intelligence.humint_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("iam.users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    attachment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    vision_caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    vector_status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")

    report: Mapped[HumintReport] = relationship("HumintReport", back_populates="attachments", lazy="selectin")
