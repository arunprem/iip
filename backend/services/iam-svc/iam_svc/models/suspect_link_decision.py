"""Link decision audit for suspect master/child merges."""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from iip_core.db import Base


class SuspectLinkDecision(Base):
    __tablename__ = "suspect_link_decisions"
    __table_args__ = {"schema": "intelligence"}

    dossier_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspect_dossiers.id", ondelete="SET NULL"),
        nullable=True,
    )
    dossier_draft_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    matched_master_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspect_masters.id"),
        nullable=True,
    )
    matched_dossier_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspect_dossiers.id"),
        nullable=True,
    )
    face_similarity: Mapped[float | None] = mapped_column(nullable=True)
    match_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    decided_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.users.id"),
        nullable=False,
    )
