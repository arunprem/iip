"""Suspect & dossier CRUD — master/child intelligence domain."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field

from iip_core.auth import CurrentUser
from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger
from iam_svc.dependencies import (
    can_read_cross_unit,
    can_read_master,
    get_current_user_db,
    get_office_id,
    require_suspect_dossier_create,
    require_suspect_dossier_read,
    require_suspect_dossier_update,
    require_suspect_master_read,
)
from iam_svc.models.role import Role
from iam_svc.models.suspect_dossier import SuspectDossier
from iam_svc.repositories.suspect_dossier_repository import SuspectDossierRepository
from iam_svc.services.permission_service import PermissionService
from iam_svc.services.suspect_master_profile import build_dossier_detail, build_master_profile
from iam_svc.services.suspect_match_scoring import (
    MatchCandidateInput,
    STRONG_MATCH_THRESHOLD,
    merge_candidate_records,
    score_match_candidates,
)

router = APIRouter()
logger = get_logger(__name__)

VALID_CONTACT_TYPES = frozenset({"MOBILE", "LANDLINE", "EMAILID"})
VALID_POSE_TYPES = frozenset(
    {"FRONT", "LEFT_PROFILE", "RIGHT_PROFILE", "LEFT", "RIGHT", "OTHER"}
)


class SuspectAddressInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    is_permanent: bool = Field(default=True, alias="isPermanent")
    house_no: str = Field(default="", alias="houseNo")
    house_name: str = Field(default="", alias="houseName")
    street_name: str = Field(default="", alias="streetName")
    locality: str = ""
    tehsil: str = ""
    village_town_city: str = Field(default="", alias="villageTownCity")
    pincode: str = ""
    latitude: str = ""
    longitude: str = ""
    country: str = "INDIA"
    state: str = ""
    district: str = ""
    police_station: str = Field(default="", alias="policeStation")


class SuspectContactInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: str = "MOBILE"
    value: str = ""


class SuspectSocialInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    platform: str = "OTHER"
    details: str = ""


class SuspectRelativeInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str = ""
    relation: str = ""
    gender: str = ""
    occupation: str = ""


class SuspectPhotoInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    pose_type: str = Field(alias="poseType")
    storage_key: str | None = Field(None, alias="storageKey")
    face_id: str | None = Field(None, alias="faceId")
    detected_pose: str | None = Field(None, alias="detectedPose")
    face_count: int | None = Field(None, alias="faceCount")
    status: str = "empty"


class FaceMatchInput(BaseModel):
    suspect_id: str | None = None
    master_suspect_id: str | None = Field(None, alias="masterSuspectId")
    dossier_id: str | None = Field(None, alias="dossierId")
    storage_key: str | None = Field(None, alias="storageKey")
    photo_id: str | None = Field(None, alias="photoId")
    criminal_name: str | None = Field(None, alias="criminalName")
    similarity_score: float = Field(0.0, alias="similarityScore")


class LinkDecisionInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    master_suspect_id: str | None = Field(None, alias="masterSuspectId")
    matched_dossier_id: str | None = Field(None, alias="matchedDossierId")
    face_similarity: float | None = Field(None, alias="faceSimilarity")
    match_score: int | None = Field(None, alias="matchScore")
    decision: str = "REJECTED_LINK"  # CONFIRMED_LINK | REJECTED_LINK


class UpdateSuspectDossierRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    criminal_name: str = Field(min_length=1, max_length=255, alias="criminalName")
    alias_name: str = Field(default="", alias="aliasName")
    gender: str = ""
    fathers_name: str = Field(default="", alias="fathersName")
    date_of_birth: str = Field(default="", alias="dateOfBirth")
    age: str = ""
    year_of_birth: str = Field(default="", alias="yearOfBirth")
    place_of_birth: str = Field(default="", alias="placeOfBirth")
    religion: str = ""
    category: str = ""
    address: SuspectAddressInput = Field(default_factory=SuspectAddressInput)
    present_address: SuspectAddressInput | None = Field(None, alias="presentAddress")
    has_different_present_address: bool = Field(False, alias="hasDifferentPresentAddress")
    contacts: list[SuspectContactInput] = Field(default_factory=list)
    social_accounts: list[SuspectSocialInput] = Field(default_factory=list, alias="socialAccounts")
    relatives: list[SuspectRelativeInput] = Field(default_factory=list)


class CreateSuspectDossierRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dossier_draft_id: str = Field(alias="dossierDraftId")
    criminal_name: str = Field(min_length=1, max_length=255, alias="criminalName")
    alias_name: str = Field(default="", alias="aliasName")
    gender: str = ""
    fathers_name: str = Field(default="", alias="fathersName")
    date_of_birth: str = Field(default="", alias="dateOfBirth")
    age: str = ""
    year_of_birth: str = Field(default="", alias="yearOfBirth")
    place_of_birth: str = Field(default="", alias="placeOfBirth")
    religion: str = ""
    category: str = ""
    address: SuspectAddressInput = Field(default_factory=SuspectAddressInput)
    present_address: SuspectAddressInput | None = Field(None, alias="presentAddress")
    has_different_present_address: bool = Field(False, alias="hasDifferentPresentAddress")
    contacts: list[SuspectContactInput] = Field(default_factory=list)
    social_accounts: list[SuspectSocialInput] = Field(default_factory=list, alias="socialAccounts")
    relatives: list[SuspectRelativeInput] = Field(default_factory=list)
    photos: list[SuspectPhotoInput] = Field(default_factory=list)
    link_master_id: str | None = Field(None, alias="linkMasterId")
    link_decision: LinkDecisionInput | None = Field(None, alias="linkDecision")


class ScoreMatchesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    criminal_name: str = Field(alias="criminalName")
    alias_name: str = Field(default="", alias="aliasName")
    fathers_name: str = Field(default="", alias="fathersName")
    date_of_birth: str = Field(default="", alias="dateOfBirth")
    year_of_birth: str = Field(default="", alias="yearOfBirth")
    address: SuspectAddressInput = Field(default_factory=SuspectAddressInput)
    face_matches: list[FaceMatchInput] = Field(default_factory=list, alias="faceMatches")
    exclude_master_id: str | None = Field(None, alias="excludeMasterId")
    exclude_dossier_id: str | None = Field(None, alias="excludeDossierId")


class ScoredMatchResponse(BaseModel):
    master_suspect_id: str
    dossier_id: str | None = None
    dossier_draft_id: str | None = None
    criminal_name: str
    alias_name: str | None = None
    office_name: str | None = None
    face_similarity: float
    match_score: int
    tier: str
    storage_key: str | None = None
    photo_id: str | None = None


class SuspectPhotoResponse(BaseModel):
    photo_id: str
    pose_type: str
    storage_key: str
    face_id: str | None = None
    detected_pose: str | None = None
    face_detected: bool = False
    face_count: int | None = None
    sort_order: int = 0


class SuspectDossierSummary(BaseModel):
    dossier_id: str
    suspect_id: str
    master_suspect_id: str
    criminal_name: str
    alias_name: str | None = None
    status: str
    link_status: str
    office_name: str | None = None
    submitted_at: str
    dossier_draft_id: str | None = None
    front_photo_id: str | None = None
    front_photo_storage_key: str | None = None
    front_face_id: str | None = None
    child_dossier_count: int = 1


class SuspectDossierListResponse(BaseModel):
    dossiers: list[SuspectDossierSummary]
    total: int
    page: int
    page_size: int


class CreateSuspectDossierResponse(BaseModel):
    message: str
    dossier_id: str
    suspect_id: str
    master_suspect_id: str
    criminal_name: str
    dossier_draft_id: str
    link_status: str
    front_photo: SuspectPhotoResponse | None = None


def _parse_date(value: str) -> Any:
    from datetime import date

    if not value or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _parse_int(value: str) -> int | None:
    if not value or not value.strip():
        return None
    try:
        return int(value.strip())
    except ValueError:
        return None


def _match_input_to_draft(body: ScoreMatchesRequest) -> MatchCandidateInput:
    addr = body.address
    return MatchCandidateInput(
        criminal_name=body.criminal_name.strip(),
        alias_name=body.alias_name.strip() or None,
        fathers_name=body.fathers_name.strip() or None,
        date_of_birth=_parse_date(body.date_of_birth),
        year_of_birth=_parse_int(body.year_of_birth),
        address_district=addr.district.strip() or None,
        address_pincode=addr.pincode.strip() or None,
        address_village=addr.village_town_city.strip() or None,
    )


def _dossier_to_summary(dossier: SuspectDossier, office_name: str | None) -> SuspectDossierSummary:
    suspect = dossier.suspect
    front = next((p for p in suspect.photos if p.pose_type == "FRONT"), None)
    child_count = len(dossier.master.dossiers) if dossier.master and dossier.master.dossiers else 1
    return SuspectDossierSummary(
        dossier_id=str(dossier.id),
        suspect_id=str(suspect.id),
        master_suspect_id=str(dossier.master_suspect_id),
        criminal_name=suspect.criminal_name,
        alias_name=suspect.alias_name,
        status=dossier.status,
        link_status=dossier.link_status,
        office_name=office_name,
        submitted_at=dossier.submitted_at.isoformat(),
        dossier_draft_id=str(dossier.dossier_draft_id) if dossier.dossier_draft_id else None,
        front_photo_id=str(front.photo_id) if front else None,
        front_photo_storage_key=front.storage_key if front else None,
        front_face_id=str(front.face_id) if front and front.face_id else None,
        child_dossier_count=child_count,
    )


def _validate_create_request(body: CreateSuspectDossierRequest) -> None:
    try:
        uuid.UUID(body.dossier_draft_id)
    except ValueError as exc:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="dossierDraftId must be a valid UUID",
            meta={"field": "dossierDraftId"},
        ) from exc

    if body.link_master_id:
        try:
            uuid.UUID(body.link_master_id)
        except ValueError as exc:
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="linkMasterId must be a valid UUID",
                meta={"field": "linkMasterId"},
            ) from exc

    front = next((p for p in body.photos if p.pose_type.upper() == "FRONT"), None)
    if not front:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="A front-facing photo slot is required",
            meta={"field": "photos"},
        )
    if front.status.lower() not in ("validated", "duplicate") or not front.storage_key:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Front photo must be validated before submit",
            meta={"field": "photos"},
        )
    if not front.face_id:
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Front photo is missing face recognition metadata",
            meta={"field": "photos"},
        )

    for contact in body.contacts:
        if contact.value.strip() and contact.type.upper() not in VALID_CONTACT_TYPES:
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"Invalid contact type: {contact.type}",
                meta={"field": "contacts"},
            )


def _address_input_to_repo_dict(addr: SuspectAddressInput, *, is_permanent: bool) -> dict[str, Any]:
    return {
        "is_permanent": is_permanent,
        "house_no": addr.house_no,
        "house_name": addr.house_name,
        "street_name": addr.street_name,
        "locality": addr.locality,
        "tehsil": addr.tehsil,
        "village_town_city": addr.village_town_city,
        "pincode": addr.pincode,
        "latitude": addr.latitude,
        "longitude": addr.longitude,
        "country": addr.country,
        "state": addr.state,
        "district": addr.district,
        "police_station": addr.police_station,
    }


def _addresses_from_request(
    body: UpdateSuspectDossierRequest | CreateSuspectDossierRequest,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    permanent = _address_input_to_repo_dict(body.address, is_permanent=True)
    present: dict[str, Any] | None = None
    if body.has_different_present_address and body.present_address:
        present = _address_input_to_repo_dict(body.present_address, is_permanent=False)
    return permanent, present


def _update_request_to_repo_payload(body: UpdateSuspectDossierRequest) -> dict[str, Any]:
    permanent, present = _addresses_from_request(body)
    return {
        "criminal_name": body.criminal_name,
        "alias_name": body.alias_name,
        "gender": body.gender,
        "fathers_name": body.fathers_name,
        "date_of_birth": body.date_of_birth,
        "age": body.age,
        "year_of_birth": body.year_of_birth,
        "place_of_birth": body.place_of_birth,
        "religion": body.religion,
        "category": body.category,
        "address": permanent,
        "present_address": present,
        "contacts": [
            {"contact_type": c.type.upper(), "value": c.value}
            for c in body.contacts
            if c.value.strip()
        ],
        "social_accounts": [
            {"platform": s.platform.upper(), "details": s.details}
            for s in body.social_accounts
            if s.details.strip()
        ],
        "relatives": [
            {
                "name": r.name,
                "relation": r.relation,
                "gender": r.gender,
                "occupation": r.occupation,
            }
            for r in body.relatives
            if r.name.strip()
        ],
    }


def _request_to_repo_payload(body: CreateSuspectDossierRequest) -> dict[str, Any]:
    permanent, present = _addresses_from_request(body)
    return {
        "dossier_draft_id": uuid.UUID(body.dossier_draft_id),
        "criminal_name": body.criminal_name,
        "alias_name": body.alias_name,
        "gender": body.gender,
        "fathers_name": body.fathers_name,
        "date_of_birth": body.date_of_birth,
        "age": body.age,
        "year_of_birth": body.year_of_birth,
        "place_of_birth": body.place_of_birth,
        "religion": body.religion,
        "category": body.category,
        "address": permanent,
        "present_address": present,
        "contacts": [
            {"contact_type": c.type.upper(), "value": c.value}
            for c in body.contacts
            if c.value.strip()
        ],
        "social_accounts": [
            {"platform": s.platform.upper(), "details": s.details}
            for s in body.social_accounts
            if s.details.strip()
        ],
        "relatives": [
            {
                "name": r.name,
                "relation": r.relation,
                "gender": r.gender,
                "occupation": r.occupation,
            }
            for r in body.relatives
            if r.name.strip()
        ],
        "photos": [
            {
                "photo_id": uuid.UUID(p.id),
                "pose_type": p.pose_type.upper(),
                "storage_key": p.storage_key,
                "face_id": uuid.UUID(p.face_id) if p.face_id else None,
                "detected_pose": p.detected_pose,
                "face_detected": p.pose_type.upper()
                in {"FRONT", "LEFT_PROFILE", "RIGHT_PROFILE"},
                "face_count": p.face_count,
            }
            for p in body.photos
            if p.storage_key
        ],
    }


@router.post("/score-matches", response_model=list[ScoredMatchResponse])
async def score_suspect_matches(
    body: ScoreMatchesRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScoredMatchResponse]:
    """Score face and identity overlap against existing suspect profiles."""
    _ = current_user
    repo = SuspectDossierRepository(db)
    draft = _match_input_to_draft(body)
    cross_unit = await can_read_cross_unit(role, db)

    exclude_master: uuid.UUID | None = None
    exclude_dossier: uuid.UUID | None = None
    try:
        if body.exclude_master_id:
            exclude_master = uuid.UUID(body.exclude_master_id)
        if body.exclude_dossier_id:
            exclude_dossier = uuid.UUID(body.exclude_dossier_id)
    except ValueError:
        pass

    face_match_payload = [
        {
            "suspect_id": m.suspect_id or m.master_suspect_id,
            "similarity_score": m.similarity_score,
        }
        for m in body.face_matches
    ]
    face_records = await repo.records_for_face_matches(face_match_payload)
    identity_records = await repo.search_identity_match_candidates(
        draft=draft,
        office_id=office_id,
        cross_unit=cross_unit,
        exclude_master_id=exclude_master,
        exclude_dossier_id=exclude_dossier,
    )
    merged = merge_candidate_records(face_records, identity_records)
    scored = score_match_candidates(draft, merged)
    if exclude_master:
        exclude_master_str = str(exclude_master)
        scored = [s for s in scored if s.master_suspect_id != exclude_master_str]

    photo_by_master: dict[str, FaceMatchInput] = {}
    for m in body.face_matches:
        key = str(m.suspect_id or m.master_suspect_id or "")
        if key and key not in photo_by_master:
            photo_by_master[key] = m

    return [
        ScoredMatchResponse(
            master_suspect_id=s.master_suspect_id,
            dossier_id=s.dossier_id,
            dossier_draft_id=s.dossier_draft_id,
            criminal_name=s.criminal_name,
            alias_name=s.alias_name,
            office_name=s.office_name,
            face_similarity=round(s.face_similarity, 4),
            match_score=s.match_score,
            tier=s.tier,
            storage_key=s.storage_key or photo_by_master.get(s.master_suspect_id, FaceMatchInput()).storage_key,
            photo_id=s.photo_id or photo_by_master.get(s.master_suspect_id, FaceMatchInput()).photo_id,
        )
        for s in scored
    ]


@router.post("", response_model=CreateSuspectDossierResponse, status_code=status.HTTP_201_CREATED)
async def create_suspect_dossier(
    body: CreateSuspectDossierRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    _role: Annotated[Role, Depends(require_suspect_dossier_create)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CreateSuspectDossierResponse:
    """Persist a unit dossier; link to an existing master when analyst confirmed a match."""
    _validate_create_request(body)
    repo = SuspectDossierRepository(db)

    link_master_id: uuid.UUID | None = None
    link_status = "STANDALONE"
    face_similarity = None
    match_score = None
    matched_dossier_id = None

    if body.link_decision and body.link_decision.decision == "CONFIRMED_LINK":
        if not body.link_decision.master_suspect_id:
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="masterSuspectId is required when confirming a link",
            )
        link_master_id = uuid.UUID(body.link_decision.master_suspect_id)
        face_similarity = body.link_decision.face_similarity
        match_score = body.link_decision.match_score
        if body.link_decision.matched_dossier_id:
            matched_dossier_id = uuid.UUID(body.link_decision.matched_dossier_id)
    elif body.link_decision and body.link_decision.decision == "REJECTED_LINK":
        face_similarity = body.link_decision.face_similarity
        match_score = body.link_decision.match_score
        if body.link_decision.matched_dossier_id:
            matched_dossier_id = uuid.UUID(body.link_decision.matched_dossier_id)

    try:
        master, suspect, dossier = await repo.create_dossier(
            payload=_request_to_repo_payload(body),
            created_by=uuid.UUID(current_user.user_id),
            office_id=office_id,
            link_master_id=link_master_id,
            link_status=link_status,
            face_similarity=face_similarity,
            match_score=match_score,
            matched_dossier_id=matched_dossier_id,
            dossier_draft_id=uuid.UUID(body.dossier_draft_id),
        )
    except ValueError as exc:
        if str(exc) == "master_not_found":
            raise IIPException(
                status_code=status.HTTP_404_NOT_FOUND,
                error_code=ErrorCode.NOT_FOUND,
                detail="Master suspect profile not found",
            ) from exc
        raise

    if body.link_decision and body.link_decision.decision == "REJECTED_LINK":
        rejected_master = (
            uuid.UUID(body.link_decision.master_suspect_id)
            if body.link_decision.master_suspect_id
            else None
        )
        await repo.record_link_decision(
            dossier_id=dossier.id,
            dossier_draft_id=uuid.UUID(body.dossier_draft_id),
            matched_master_id=rejected_master,
            matched_dossier_id=matched_dossier_id,
            face_similarity=face_similarity,
            match_score=match_score,
            decision="REJECTED_LINK",
            decided_by=uuid.UUID(current_user.user_id),
        )

    front_input = next(p for p in body.photos if p.pose_type.upper() == "FRONT")
    front_photo = SuspectPhotoResponse(
        photo_id=front_input.id,
        pose_type="FRONT",
        storage_key=front_input.storage_key or "",
        face_id=front_input.face_id,
        detected_pose=front_input.detected_pose,
        face_detected=True,
        face_count=front_input.face_count,
        sort_order=0,
    )

    msg = (
        f"Dossier linked to master profile for {suspect.criminal_name}."
        if dossier.link_status == "LINKED" and link_master_id
        else f"Dossier saved for {suspect.criminal_name}."
    )

    logger.info(
        "suspect_dossier_created",
        dossier_id=str(dossier.id),
        suspect_id=str(suspect.id),
        master_suspect_id=str(master.id),
        link_status=dossier.link_status,
        user_id=current_user.user_id,
        office_id=str(office_id),
    )

    return CreateSuspectDossierResponse(
        message=msg,
        dossier_id=str(dossier.id),
        suspect_id=str(suspect.id),
        master_suspect_id=str(master.id),
        criminal_name=suspect.criminal_name,
        dossier_draft_id=body.dossier_draft_id,
        link_status=dossier.link_status,
        front_photo=front_photo,
    )


@router.get("", response_model=SuspectDossierListResponse)
async def list_suspect_dossiers(
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: str | None = Query(None, max_length=200),
) -> SuspectDossierListResponse:
    _ = current_user
    repo = SuspectDossierRepository(db)
    cross_unit = await can_read_cross_unit(role, db)
    rows, total = await repo.list_dossiers(
        page=page,
        page_size=page_size,
        q=q,
        office_id=office_id,
        cross_unit=cross_unit,
    )
    summaries = []
    for row in rows:
        office_name = await repo.get_office_name(row.office_id)
        summaries.append(_dossier_to_summary(row, office_name))
    return SuspectDossierListResponse(
        dossiers=summaries,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/masters/{master_id}")
async def get_master_suspect_profile(
    master_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_master_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _ = current_user
    repo = SuspectDossierRepository(db)
    master = await repo.get_master_with_dossiers(master_id)
    if not master:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Master suspect profile not found",
        )

    cross_unit = await can_read_cross_unit(role, db)
    dossiers = master.dossiers
    if not cross_unit:
        dossiers = [d for d in dossiers if d.office_id == office_id]
        if not dossiers:
            raise IIPException(
                status_code=status.HTTP_403_FORBIDDEN,
                error_code=ErrorCode.FORBIDDEN,
                detail="You do not have permission to view this master profile",
            )

    office_names: dict[str, str | None] = {}
    for d in dossiers:
        if d.office_id:
            office_names[str(d.office_id)] = await repo.get_office_name(d.office_id)

    profile = build_master_profile(master, dossiers, office_names)
    profile["can_view_cross_unit"] = cross_unit
    return profile


@router.put("/{dossier_id}")
async def update_suspect_dossier(
    dossier_id: uuid.UUID,
    body: UpdateSuspectDossierRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_update)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _ = role
    if not body.criminal_name.strip():
        raise IIPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="Criminal name is required",
            meta={"field": "criminalName"},
        )
    for contact in body.contacts:
        if contact.value.strip() and contact.type.upper() not in VALID_CONTACT_TYPES:
            raise IIPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"Invalid contact type: {contact.type}",
                meta={"field": "contacts"},
            )

    repo = SuspectDossierRepository(db)
    existing = await repo.get_dossier(dossier_id)
    if not existing:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Dossier not found",
        )

    cross_unit = await can_read_cross_unit(role, db)
    if not cross_unit and existing.office_id != office_id:
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="You do not have permission to update this dossier",
        )

    dossier = await repo.update_dossier(
        dossier_id,
        _update_request_to_repo_payload(body),
    )
    if not dossier:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Dossier not found",
        )

    office_name = await repo.get_office_name(dossier.office_id)
    detail = build_dossier_detail(dossier, office_name)
    detail["message"] = f"Dossier updated for {dossier.suspect.criminal_name}."
    detail["can_view_master"] = await can_read_master(role, db)
    detail["can_edit"] = True
    logger.info(
        "suspect_dossier_updated",
        dossier_id=str(dossier.id),
        user_id=current_user.user_id,
    )
    return detail


@router.get("/{dossier_id}")
async def get_suspect_dossier_detail(
    dossier_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    role: Annotated[Role, Depends(require_suspect_dossier_read)],
    office_id: Annotated[uuid.UUID, Depends(get_office_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _ = current_user
    repo = SuspectDossierRepository(db)
    dossier = await repo.get_dossier(dossier_id)
    if not dossier:
        raise IIPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.NOT_FOUND,
            detail="Dossier not found",
        )

    cross_unit = await can_read_cross_unit(role, db)
    if not cross_unit and dossier.office_id != office_id:
        raise IIPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.FORBIDDEN,
            detail="You do not have permission to view this dossier",
        )

    office_name = await repo.get_office_name(dossier.office_id)
    detail = build_dossier_detail(dossier, office_name)
    detail["can_view_master"] = await can_read_master(role, db)
    perm = PermissionService(db)
    detail["can_edit"] = await perm.role_has_action(role, "data:suspect-dossier", "UPDATE")
    return detail
