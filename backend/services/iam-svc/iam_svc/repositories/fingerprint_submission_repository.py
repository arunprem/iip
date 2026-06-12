"""Repository for mobile fingerprint submissions pending approval."""

from __future__ import annotations

import base64
import hashlib
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from iam_svc.models.suspect_dossier import (
    SuspectDossier,
    SuspectFingerprint,
    SuspectFingerprintSubmission,
)


def _decode_template_b64(value: str | None) -> bytes | None:
    if not value or not str(value).strip():
        return None
    try:
        return base64.b64decode(str(value).strip())
    except Exception:
        return None


class FingerprintSubmissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_dossier(self, dossier_id: uuid.UUID) -> SuspectDossier | None:
        return await self.session.get(SuspectDossier, dossier_id)

    async def create_submission(
        self,
        *,
        dossier: SuspectDossier,
        finger_position: str,
        template_bytes: bytes,
        template_format: str,
        captured_by: uuid.UUID,
        quality_score: float | None,
        device_model: str | None,
        print_id: uuid.UUID | None = None,
        image_bytes: bytes | None = None,
        image_width: int | None = None,
        image_height: int | None = None,
    ) -> SuspectFingerprintSubmission:
        template_id = uuid.uuid4()
        print_id = print_id or uuid.uuid4()
        suspect = dossier.suspect
        row = SuspectFingerprintSubmission(
            suspect_id=suspect.id,
            dossier_id=dossier.id,
            master_suspect_id=dossier.master_suspect_id,
            template_id=template_id,
            print_id=print_id,
            finger_position=finger_position.upper(),
            template_format=template_format.upper(),
            template_data=template_bytes,
            template_hash=hashlib.sha256(template_bytes).hexdigest(),
            quality_score=quality_score,
            device_model=device_model,
            image_data=image_bytes,
            image_width=image_width,
            image_height=image_height,
            source="MOBILE",
            status="PENDING",
            criminal_name=suspect.criminal_name,
            captured_by=captured_by,
            captured_at=datetime.now(UTC),
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def get_submission(self, submission_id: uuid.UUID) -> SuspectFingerprintSubmission | None:
        return await self.session.get(SuspectFingerprintSubmission, submission_id)

    async def list_submissions(
        self,
        *,
        status: str | None = "PENDING",
        page: int = 1,
        page_size: int = 50,
        office_id: uuid.UUID | None = None,
        cross_unit: bool = False,
    ) -> tuple[list[SuspectFingerprintSubmission], int]:
        stmt = select(SuspectFingerprintSubmission).join(
            SuspectDossier,
            SuspectFingerprintSubmission.dossier_id == SuspectDossier.id,
        )
        if status:
            stmt = stmt.where(SuspectFingerprintSubmission.status == status.upper())
        if office_id and not cross_unit:
            stmt = stmt.where(SuspectDossier.office_id == office_id)

        count_stmt = select(func.count(SuspectFingerprintSubmission.id)).select_from(
            SuspectFingerprintSubmission
        ).join(
            SuspectDossier,
            SuspectFingerprintSubmission.dossier_id == SuspectDossier.id,
        )
        if status:
            count_stmt = count_stmt.where(SuspectFingerprintSubmission.status == status.upper())
        if office_id and not cross_unit:
            count_stmt = count_stmt.where(SuspectDossier.office_id == office_id)
        total = int((await self.session.execute(count_stmt)).scalar_one())

        stmt = (
            stmt.order_by(SuspectFingerprintSubmission.captured_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = list((await self.session.execute(stmt)).scalars().all())
        return rows, total

    async def approve_submission(
        self,
        submission: SuspectFingerprintSubmission,
        *,
        reviewed_by: uuid.UUID,
        review_notes: str | None = None,
    ) -> SuspectFingerprint:
        if submission.status != "PENDING":
            raise ValueError("Submission is not pending")

        suspect = submission.suspect
        dossier_id = submission.dossier_id
        existing = next(
            (f for f in suspect.fingerprints if f.finger_position == submission.finger_position),
            None,
        )
        if existing:
            existing.template_id = submission.template_id
            existing.print_id = submission.print_id
            existing.template_format = submission.template_format
            existing.template_data = submission.template_data
            existing.template_hash = submission.template_hash
            existing.quality_score = submission.quality_score
            existing.device_model = submission.device_model
            fingerprint = existing
        else:
            fingerprint = SuspectFingerprint(
                suspect_id=submission.suspect_id,
                dossier_id=dossier_id,
                template_id=submission.template_id,
                print_id=submission.print_id,
                finger_position=submission.finger_position,
                template_format=submission.template_format,
                template_data=submission.template_data,
                template_hash=submission.template_hash,
                quality_score=submission.quality_score,
                device_model=submission.device_model,
                sort_order=len(suspect.fingerprints),
            )
            self.session.add(fingerprint)

        submission.status = "APPROVED"
        submission.reviewed_by = reviewed_by
        submission.reviewed_at = datetime.now(UTC)
        submission.review_notes = review_notes
        await self.session.flush()
        await self.session.refresh(fingerprint)
        submission.approved_fingerprint_id = fingerprint.id
        await self.session.flush()
        return fingerprint

    async def reject_submission(
        self,
        submission: SuspectFingerprintSubmission,
        *,
        reviewed_by: uuid.UUID,
        review_notes: str | None = None,
    ) -> SuspectFingerprintSubmission:
        if submission.status != "PENDING":
            raise ValueError("Submission is not pending")
        submission.status = "REJECTED"
        submission.reviewed_by = reviewed_by
        submission.reviewed_at = datetime.now(UTC)
        submission.review_notes = review_notes
        await self.session.flush()
        return submission
