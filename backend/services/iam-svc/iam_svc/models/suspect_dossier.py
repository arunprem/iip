"""Suspect dossier ORM models (intelligence schema)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from iip_core.db import Base

if TYPE_CHECKING:
    pass


class SuspectMaster(Base):
    """Parent profile — consolidated view across unit dossiers."""

    __tablename__ = "suspect_masters"
    __table_args__ = {"schema": "intelligence"}

    display_name: Mapped[str] = mapped_column(String(255), nullable=False)

    dossiers: Mapped[list["SuspectDossier"]] = relationship(
        "SuspectDossier",
        back_populates="master",
        foreign_keys="SuspectDossier.master_suspect_id",
        lazy="selectin",
    )


class Suspect(Base):
    __tablename__ = "suspects"
    __table_args__ = {"schema": "intelligence"}

    criminal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    alias_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fathers_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    year_of_birth: Mapped[int | None] = mapped_column(Integer, nullable=True)
    place_of_birth: Mapped[str | None] = mapped_column(String(255), nullable=True)
    religion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.users.id"),
        nullable=False,
    )
    office_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.offices.id"),
        nullable=True,
    )

    dossiers: Mapped[list["SuspectDossier"]] = relationship(
        "SuspectDossier", back_populates="suspect", lazy="selectin"
    )
    addresses: Mapped[list["SuspectAddress"]] = relationship(
        "SuspectAddress", back_populates="suspect", lazy="selectin"
    )
    contacts: Mapped[list["SuspectContact"]] = relationship(
        "SuspectContact", back_populates="suspect", lazy="selectin"
    )
    social_accounts: Mapped[list["SuspectSocialAccount"]] = relationship(
        "SuspectSocialAccount", back_populates="suspect", lazy="selectin"
    )
    relatives: Mapped[list["SuspectRelative"]] = relationship(
        "SuspectRelative", back_populates="suspect", lazy="selectin"
    )
    associates: Mapped[list["SuspectAssociate"]] = relationship(
        "SuspectAssociate",
        back_populates="suspect",
        foreign_keys="SuspectAssociate.suspect_id",
        lazy="selectin",
    )
    photos: Mapped[list["SuspectPhoto"]] = relationship(
        "SuspectPhoto", back_populates="suspect", lazy="selectin"
    )


class SuspectDossier(Base):
    __tablename__ = "suspect_dossiers"
    __table_args__ = {"schema": "intelligence"}

    master_suspect_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspect_masters.id", ondelete="RESTRICT"),
        nullable=False,
    )
    suspect_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspects.id", ondelete="CASCADE"),
        nullable=False,
    )
    dossier_draft_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="SUBMITTED", nullable=False)
    link_status: Mapped[str] = mapped_column(String(30), default="STANDALONE", nullable=False)
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.users.id"),
        nullable=False,
    )
    office_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.offices.id"),
        nullable=True,
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    suspect: Mapped["Suspect"] = relationship("Suspect", back_populates="dossiers", lazy="selectin")
    master: Mapped["SuspectMaster"] = relationship(
        "SuspectMaster",
        back_populates="dossiers",
        foreign_keys=[master_suspect_id],
        lazy="selectin",
    )
    photos: Mapped[list["SuspectPhoto"]] = relationship(
        "SuspectPhoto", back_populates="dossier", lazy="selectin"
    )
    associates: Mapped[list["SuspectAssociate"]] = relationship(
        "SuspectAssociate", back_populates="dossier", lazy="selectin"
    )


class SuspectAddress(Base):
    __tablename__ = "suspect_addresses"
    __table_args__ = {"schema": "intelligence"}

    suspect_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspects.id", ondelete="CASCADE"),
        nullable=False,
    )
    is_permanent: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    house_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    house_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    street_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    locality: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tehsil: Mapped[str | None] = mapped_column(String(255), nullable=True)
    village_town_city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    district: Mapped[str | None] = mapped_column(String(255), nullable=True)
    police_station: Mapped[str | None] = mapped_column(String(255), nullable=True)

    suspect: Mapped["Suspect"] = relationship("Suspect", back_populates="addresses", lazy="selectin")


class SuspectContact(Base):
    __tablename__ = "suspect_contacts"
    __table_args__ = {"schema": "intelligence"}

    suspect_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspects.id", ondelete="CASCADE"),
        nullable=False,
    )
    contact_type: Mapped[str] = mapped_column(String(20), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)

    suspect: Mapped["Suspect"] = relationship("Suspect", back_populates="contacts", lazy="selectin")


class SuspectSocialAccount(Base):
    __tablename__ = "suspect_social_accounts"
    __table_args__ = {"schema": "intelligence"}

    suspect_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspects.id", ondelete="CASCADE"),
        nullable=False,
    )
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)

    suspect: Mapped["Suspect"] = relationship(
        "Suspect", back_populates="social_accounts", lazy="selectin"
    )


class SuspectRelative(Base):
    __tablename__ = "suspect_relatives"
    __table_args__ = {"schema": "intelligence"}

    suspect_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspects.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    relation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(50), nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(255), nullable=True)

    suspect: Mapped["Suspect"] = relationship("Suspect", back_populates="relatives", lazy="selectin")


class SuspectAssociate(Base):
    """Operational associate linked to a suspect dossier (may reference another profile)."""

    __tablename__ = "suspect_associates"
    __table_args__ = {"schema": "intelligence"}

    suspect_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspects.id", ondelete="CASCADE"),
        nullable=False,
    )
    dossier_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspect_dossiers.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    association_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    linked_master_suspect_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspect_masters.id", ondelete="SET NULL"),
        nullable=True,
    )
    linked_suspect_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspects.id", ondelete="SET NULL"),
        nullable=True,
    )

    suspect: Mapped["Suspect"] = relationship(
        "Suspect",
        back_populates="associates",
        foreign_keys=[suspect_id],
        lazy="selectin",
    )
    dossier: Mapped["SuspectDossier"] = relationship(
        "SuspectDossier",
        back_populates="associates",
        lazy="selectin",
    )


class SuspectPhoto(Base):
    __tablename__ = "suspect_photos"
    __table_args__ = {"schema": "intelligence"}

    suspect_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspects.id", ondelete="CASCADE"),
        nullable=False,
    )
    dossier_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("intelligence.suspect_dossiers.id", ondelete="CASCADE"),
        nullable=False,
    )
    photo_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    pose_type: Mapped[str] = mapped_column(String(30), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    face_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    detected_pose: Mapped[str | None] = mapped_column(String(30), nullable=True)
    face_detected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    face_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    suspect: Mapped["Suspect"] = relationship("Suspect", back_populates="photos", lazy="selectin")
    dossier: Mapped["SuspectDossier"] = relationship(
        "SuspectDossier", back_populates="photos", lazy="selectin"
    )


class QuickSuspectCapture(Base):
    __tablename__ = "quick_suspect_captures"
    __table_args__ = {"schema": "intelligence"}

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    captured_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("iam.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

