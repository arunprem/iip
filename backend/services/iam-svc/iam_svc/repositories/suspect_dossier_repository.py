"""Persist suspect dossiers, masters, and link decisions."""

from __future__ import annotations

import base64
import hashlib
import re
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import String, and_, cast, delete, exists, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from iam_svc.models.office import Office
from iam_svc.models.suspect_link_decision import SuspectLinkDecision
from iam_svc.models.suspect_dossier import (
    Suspect,
    SuspectAddress,
    SuspectAssociate,
    SuspectContact,
    SuspectDossier,
    SuspectMaster,
    SuspectFingerprint,
    SuspectPhoto,
    SuspectRelative,
    SuspectSocialAccount,
)
from iam_svc.services.suspect_address_utils import get_address_by_kind, get_primary_address
from iam_svc.services.suspect_match_scoring import (
    MatchCandidateInput,
    MatchCandidateRecord,
    _fuzzy_ratio,
    score_match_candidates,
)


def _digits_only(value: str) -> str:
    return re.sub(r"\D", "", value)


SEARCH_STOP_WORDS = frozenset({
    "any", "who", "whom", "has", "have", "had", "the", "area", "near", "from", "with",
    "that", "this", "lives", "live", "living", "located", "address", "locality",
    "suspect", "suspects", "person", "people", "find", "search", "tell", "about",
    "please", "give", "need", "name", "names", "linked", "registered", "database",
    "dossier", "record", "records", "in", "at", "for",
})


def _search_tokens(q: str) -> list[str]:
    q_clean = q.strip().lower()
    if not q_clean:
        return []
    digits = _digits_only(q_clean)
    if digits and len(digits) >= 8 and len(digits) == len(re.sub(r"\s", "", q_clean)):
        return [digits]
    tokens = [t for t in re.split(r"[\s,]+", q_clean) if len(t) >= 3 and t not in SEARCH_STOP_WORDS]
    if tokens:
        return tokens
    return [q_clean] if len(q_clean) >= 3 else []


def _filters_for_token(token: str) -> tuple[list, bool]:
    term = f"%{token.lower()}%"
    digits = _digits_only(token)

    addr_fields = (
        SuspectAddress.house_no,
        SuspectAddress.house_name,
        SuspectAddress.street_name,
        SuspectAddress.locality,
        SuspectAddress.tehsil,
        SuspectAddress.village_town_city,
        SuspectAddress.district,
        SuspectAddress.state,
        SuspectAddress.police_station,
        SuspectAddress.pincode,
    )
    address_match = exists(
        select(1).where(
            SuspectAddress.suspect_id == Suspect.id,
            or_(*[func.lower(func.coalesce(col, "")).like(term) for col in addr_fields]),
        )
    )

    contact_match = exists(
        select(1).where(
            SuspectContact.suspect_id == Suspect.id,
            func.lower(SuspectContact.value).like(term),
        )
    )

    social_match = exists(
        select(1).where(
            SuspectSocialAccount.suspect_id == Suspect.id,
            func.lower(func.coalesce(SuspectSocialAccount.details, "")).like(term),
        )
    )

    relative_match = exists(
        select(1).where(
            SuspectRelative.suspect_id == Suspect.id,
            or_(
                func.lower(SuspectRelative.name).like(term),
                func.lower(func.coalesce(SuspectRelative.relation, "")).like(term),
            ),
        )
    )

    filters = [
        func.lower(Suspect.criminal_name).like(term),
        func.lower(func.coalesce(Suspect.alias_name, "")).like(term),
        func.lower(func.coalesce(Suspect.fathers_name, "")).like(term),
        func.lower(func.coalesce(Suspect.place_of_birth, "")).like(term),
        address_match,
        contact_match,
        social_match,
        relative_match,
    ]

    used_digit_contact = False
    if len(digits) >= 6:
        digit_term = f"%{digits}%"
        compact_contact = func.replace(
            func.replace(
                func.replace(func.coalesce(SuspectContact.value, ""), " ", ""),
                "-",
                "",
            ),
            "+",
            "",
        )
        filters.append(
            exists(
                select(1).where(
                    SuspectContact.suspect_id == Suspect.id,
                    or_(
                        compact_contact.like(digit_term),
                        SuspectContact.value.like(digit_term),
                    ),
                )
            )
        )
        used_digit_contact = True

    return filters, used_digit_contact


def _dossier_search_filters(q: str) -> tuple[list, bool]:
    """Build OR filters for dossier text search; returns (filters, used_digit_contact)."""
    tokens = _search_tokens(q)
    if not tokens:
        return [], False

    groups: list = []
    used_digit_contact = False
    for token in tokens:
        filters, used = _filters_for_token(token)
        groups.append(or_(*filters))
        used_digit_contact = used_digit_contact or used

    return [or_(*groups)], used_digit_contact


def _parse_date(value: str | None) -> date | None:
    if not value or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _parse_int(value: str | int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = value.strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _parse_decimal(value: str | None) -> Decimal | None:
    if not value or not value.strip():
        return None
    try:
        return Decimal(value.strip())
    except (InvalidOperation, ValueError):
        return None


def _decode_template_b64(value: object | None) -> bytes | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return base64.b64decode(value)
    except Exception:
        return None


def _optional_str(value: object | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _norm_pin(value: str | None) -> str:
    if not value:
        return ""
    return value.strip()


def _apply_address_fields(addr: SuspectAddress, data: dict) -> None:
    addr.is_permanent = bool(data.get("is_permanent", addr.is_permanent))
    addr.house_no = _optional_str(data.get("house_no"))
    addr.house_name = _optional_str(data.get("house_name"))
    addr.street_name = _optional_str(data.get("street_name"))
    addr.locality = _optional_str(data.get("locality"))
    addr.tehsil = _optional_str(data.get("tehsil"))
    addr.village_town_city = _optional_str(data.get("village_town_city"))
    addr.pincode = _optional_str(data.get("pincode"))
    addr.latitude = _parse_decimal(data.get("latitude"))
    addr.longitude = _parse_decimal(data.get("longitude"))
    addr.country = _optional_str(data.get("country"))
    addr.state = _optional_str(data.get("state"))
    addr.district = _optional_str(data.get("district"))
    addr.police_station = _optional_str(data.get("police_station"))


def _new_address_row(suspect_id: uuid.UUID, data: dict, *, is_permanent: bool) -> SuspectAddress:
    return SuspectAddress(
        suspect_id=suspect_id,
        is_permanent=is_permanent,
        house_no=_optional_str(data.get("house_no")),
        house_name=_optional_str(data.get("house_name")),
        street_name=_optional_str(data.get("street_name")),
        locality=_optional_str(data.get("locality")),
        tehsil=_optional_str(data.get("tehsil")),
        village_town_city=_optional_str(data.get("village_town_city")),
        pincode=_optional_str(data.get("pincode")),
        latitude=_parse_decimal(data.get("latitude")),
        longitude=_parse_decimal(data.get("longitude")),
        country=_optional_str(data.get("country")),
        state=_optional_str(data.get("state")),
        district=_optional_str(data.get("district")),
        police_station=_optional_str(data.get("police_station")),
    )


class SuspectDossierRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_dossier(
        self,
        *,
        payload: dict,
        created_by: uuid.UUID,
        office_id: uuid.UUID | None,
        link_master_id: uuid.UUID | None = None,
        link_status: str = "STANDALONE",
        face_similarity: float | None = None,
        match_score: int | None = None,
        matched_dossier_id: uuid.UUID | None = None,
        dossier_draft_id: uuid.UUID | None = None,
    ) -> tuple[SuspectMaster, Suspect, SuspectDossier]:
        if link_master_id:
            master = await self.get_master(link_master_id)
            if not master:
                raise ValueError("master_not_found")
            final_link_status = "LINKED"
        else:
            master = SuspectMaster(display_name=payload["criminal_name"].strip())
            self.session.add(master)
            await self.session.flush()
            final_link_status = link_status

        suspect = Suspect(
            criminal_name=payload["criminal_name"].strip(),
            alias_name=_optional_str(payload.get("alias_name")),
            gender=_optional_str(payload.get("gender")),
            fathers_name=_optional_str(payload.get("fathers_name")),
            date_of_birth=_parse_date(payload.get("date_of_birth")),
            age=_parse_int(payload.get("age")),
            year_of_birth=_parse_int(payload.get("year_of_birth")),
            place_of_birth=_optional_str(payload.get("place_of_birth")),
            religion=_optional_str(payload.get("religion")),
            category=_optional_str(payload.get("category")),
            created_by=created_by,
            office_id=office_id,
        )
        self.session.add(suspect)
        await self.session.flush()

        dossier = SuspectDossier(
            master_suspect_id=master.id,
            suspect_id=suspect.id,
            dossier_draft_id=payload.get("dossier_draft_id"),
            status="SUBMITTED",
            link_status=final_link_status,
            submitted_by=created_by,
            office_id=office_id,
            submitted_at=datetime.now(UTC),
        )
        self.session.add(dossier)
        await self.session.flush()

        if link_master_id:
            self.session.add(
                SuspectLinkDecision(
                    dossier_id=dossier.id,
                    dossier_draft_id=dossier_draft_id or payload.get("dossier_draft_id"),
                    matched_master_id=link_master_id,
                    matched_dossier_id=matched_dossier_id,
                    face_similarity=face_similarity,
                    match_score=match_score,
                    decision="CONFIRMED_LINK",
                    decided_by=created_by,
                )
            )

        self._add_related_records(suspect.id, dossier.id, payload)
        await self._sync_associates(
            suspect_id=suspect.id,
            dossier_id=dossier.id,
            source_master_id=master.id,
            associates=payload.get("associates") or [],
            created_by=created_by,
            office_id=office_id,
        )
        await self.session.flush()
        return master, suspect, dossier

    async def record_link_decision(
        self,
        *,
        dossier_id: uuid.UUID,
        dossier_draft_id: uuid.UUID | None,
        matched_master_id: uuid.UUID | None,
        matched_dossier_id: uuid.UUID | None,
        face_similarity: float | None,
        match_score: int | None,
        decision: str,
        decided_by: uuid.UUID,
    ) -> None:
        self.session.add(
            SuspectLinkDecision(
                dossier_id=dossier_id,
                dossier_draft_id=dossier_draft_id,
                matched_master_id=matched_master_id,
                matched_dossier_id=matched_dossier_id,
                face_similarity=face_similarity,
                match_score=match_score,
                decision=decision,
                decided_by=decided_by,
            )
        )
        await self.session.flush()

    async def _sync_suspect_addresses(
        self,
        suspect: Suspect,
        *,
        permanent: dict | None,
        present: dict | None,
    ) -> None:
        if permanent and isinstance(permanent, dict):
            perm_row = get_address_by_kind(suspect.addresses, is_permanent=True)
            perm_data = {**permanent, "is_permanent": True}
            if perm_row:
                _apply_address_fields(perm_row, perm_data)
            else:
                self.session.add(_new_address_row(suspect.id, perm_data, is_permanent=True))

        present_row = get_address_by_kind(suspect.addresses, is_permanent=False)
        if present and isinstance(present, dict):
            present_data = {**present, "is_permanent": False}
            if present_row:
                _apply_address_fields(present_row, present_data)
            else:
                self.session.add(_new_address_row(suspect.id, present_data, is_permanent=False))
        elif present_row:
            await self.session.delete(present_row)

    def _add_related_records(
        self, suspect_id: uuid.UUID, dossier_id: uuid.UUID, payload: dict
    ) -> None:
        address_data = payload.get("address") or {}
        if isinstance(address_data, dict):
            self.session.add(
                _new_address_row(
                    suspect_id,
                    {**address_data, "is_permanent": True},
                    is_permanent=True,
                )
            )
        present_data = payload.get("present_address")
        if isinstance(present_data, dict):
            self.session.add(
                _new_address_row(
                    suspect_id,
                    {**present_data, "is_permanent": False},
                    is_permanent=False,
                )
            )

        for contact in payload.get("contacts") or []:
            value = _optional_str(contact.get("value"))
            if not value:
                continue
            self.session.add(
                SuspectContact(
                    suspect_id=suspect_id,
                    contact_type=str(contact.get("contact_type") or "MOBILE").upper(),
                    value=value,
                )
            )

        for social in payload.get("social_accounts") or []:
            details = _optional_str(social.get("details"))
            if not details:
                continue
            self.session.add(
                SuspectSocialAccount(
                    suspect_id=suspect_id,
                    platform=str(social.get("platform") or "OTHER").upper(),
                    details=details,
                )
            )

        for relative in payload.get("relatives") or []:
            name = _optional_str(relative.get("name"))
            if not name:
                continue
            self.session.add(
                SuspectRelative(
                    suspect_id=suspect_id,
                    name=name,
                    relation=_optional_str(relative.get("relation")),
                    gender=_optional_str(relative.get("gender")),
                    occupation=_optional_str(relative.get("occupation")),
                )
            )

        for sort_order, photo in enumerate(payload.get("photos") or []):
            storage_key = _optional_str(photo.get("storage_key"))
            if not storage_key:
                continue
            photo_id = photo.get("photo_id")
            if not isinstance(photo_id, uuid.UUID):
                photo_id = uuid.UUID(str(photo_id))
            face_id_raw = photo.get("face_id")
            face_id = uuid.UUID(str(face_id_raw)) if face_id_raw else None
            self.session.add(
                SuspectPhoto(
                    suspect_id=suspect_id,
                    dossier_id=dossier_id,
                    photo_id=photo_id,
                    pose_type=str(photo.get("pose_type") or "OTHER").upper(),
                    storage_key=storage_key,
                    face_id=face_id,
                    detected_pose=_optional_str(photo.get("detected_pose")),
                    face_detected=bool(photo.get("face_detected")),
                    face_count=photo.get("face_count"),
                    sort_order=sort_order,
                )
            )

        for sort_order, fp in enumerate(payload.get("fingerprints") or []):
            template_bytes = _decode_template_b64(fp.get("template_data_b64"))
            if not template_bytes:
                continue
            template_id = fp.get("template_id")
            if not isinstance(template_id, uuid.UUID):
                template_id = uuid.UUID(str(template_id))
            print_id_raw = fp.get("print_id")
            print_id = uuid.UUID(str(print_id_raw)) if print_id_raw else None
            self.session.add(
                SuspectFingerprint(
                    suspect_id=suspect_id,
                    dossier_id=dossier_id,
                    template_id=template_id,
                    print_id=print_id,
                    finger_position=str(fp.get("finger_position") or "RIGHT_THUMB").upper(),
                    template_format=str(fp.get("template_format") or "ISO19794-2").upper(),
                    template_data=template_bytes,
                    template_hash=hashlib.sha256(template_bytes).hexdigest(),
                    quality_score=fp.get("quality_score"),
                    device_model=_optional_str(fp.get("device_model")),
                    sort_order=sort_order,
                )
            )

    async def update_dossier(
        self,
        dossier_id: uuid.UUID,
        payload: dict,
    ) -> SuspectDossier | None:
        dossier = await self.get_dossier(dossier_id)
        if not dossier:
            return None

        if payload.get("dossier_draft_id") and dossier.dossier_draft_id is None:
            dossier.dossier_draft_id = payload["dossier_draft_id"]

        suspect = dossier.suspect
        suspect.criminal_name = payload["criminal_name"].strip()
        suspect.alias_name = _optional_str(payload.get("alias_name"))
        suspect.gender = _optional_str(payload.get("gender"))
        suspect.fathers_name = _optional_str(payload.get("fathers_name"))
        suspect.date_of_birth = _parse_date(payload.get("date_of_birth"))
        suspect.age = _parse_int(payload.get("age"))
        suspect.year_of_birth = _parse_int(payload.get("year_of_birth"))
        suspect.place_of_birth = _optional_str(payload.get("place_of_birth"))
        suspect.religion = _optional_str(payload.get("religion"))
        suspect.category = _optional_str(payload.get("category"))

        master = await self.get_master(dossier.master_suspect_id)
        if master and dossier.link_status == "STANDALONE":
            master.display_name = suspect.criminal_name

        permanent_data = payload.get("address") if isinstance(payload.get("address"), dict) else None
        present_data = (
            payload.get("present_address")
            if isinstance(payload.get("present_address"), dict)
            else None
        )
        await self._sync_suspect_addresses(
            suspect,
            permanent=permanent_data,
            present=present_data,
        )

        await self.session.execute(
            delete(SuspectContact).where(SuspectContact.suspect_id == suspect.id)
        )
        await self.session.execute(
            delete(SuspectSocialAccount).where(SuspectSocialAccount.suspect_id == suspect.id)
        )
        await self.session.execute(
            delete(SuspectRelative).where(SuspectRelative.suspect_id == suspect.id)
        )
        await self.session.execute(
            delete(SuspectAssociate).where(SuspectAssociate.suspect_id == suspect.id)
        )

        for contact in payload.get("contacts") or []:
            value = _optional_str(contact.get("value"))
            if not value:
                continue
            self.session.add(
                SuspectContact(
                    suspect_id=suspect.id,
                    contact_type=str(contact.get("contact_type") or "MOBILE").upper(),
                    value=value,
                )
            )

        for social in payload.get("social_accounts") or []:
            details = _optional_str(social.get("details"))
            if not details:
                continue
            self.session.add(
                SuspectSocialAccount(
                    suspect_id=suspect.id,
                    platform=str(social.get("platform") or "OTHER").upper(),
                    details=details,
                )
            )

        for relative in payload.get("relatives") or []:
            name = _optional_str(relative.get("name"))
            if not name:
                continue
            self.session.add(
                SuspectRelative(
                    suspect_id=suspect.id,
                    name=name,
                    relation=_optional_str(relative.get("relation")),
                    gender=_optional_str(relative.get("gender")),
                    occupation=_optional_str(relative.get("occupation")),
                )
            )

        await self._sync_associates(
            suspect_id=suspect.id,
            dossier_id=dossier.id,
            source_master_id=dossier.master_suspect_id,
            associates=payload.get("associates") or [],
            created_by=suspect.created_by,
            office_id=dossier.office_id,
        )

        # Sync photos
        if "photos" in payload:
            existing_photos = {p.photo_id: p for p in suspect.photos}
            new_photos = {uuid.UUID(str(p["photo_id"])): p for p in payload["photos"] if p.get("storage_key")}
            
            # Delete photos that are no longer present
            for pid, photo in list(existing_photos.items()):
                if pid not in new_photos:
                    await self.session.delete(photo)
            
            # Add or update new photos
            for sort_order, (pid, photo_data) in enumerate(new_photos.items()):
                face_id_raw = photo_data.get("face_id")
                face_id = uuid.UUID(str(face_id_raw)) if face_id_raw else None
                
                if pid in existing_photos:
                    # Update existing photo fields if changed
                    photo = existing_photos[pid]
                    photo.pose_type = str(photo_data.get("pose_type") or "OTHER").upper()
                    photo.storage_key = str(photo_data["storage_key"])
                    photo.face_id = face_id
                    photo.detected_pose = _optional_str(photo_data.get("detected_pose"))
                    photo.face_detected = bool(photo_data.get("face_detected"))
                    photo.face_count = photo_data.get("face_count")
                    photo.sort_order = sort_order
                else:
                    # Insert new photo
                    self.session.add(
                        SuspectPhoto(
                            suspect_id=suspect.id,
                            dossier_id=dossier.id,
                            photo_id=pid,
                            pose_type=str(photo_data.get("pose_type") or "OTHER").upper(),
                            storage_key=str(photo_data["storage_key"]),
                            face_id=face_id,
                            detected_pose=_optional_str(photo_data.get("detected_pose")),
                            face_detected=bool(photo_data.get("face_detected")),
                            face_count=photo_data.get("face_count"),
                            sort_order=sort_order,
                        )
                    )

        if "fingerprints" in payload:
            existing_fps = {f.template_id: f for f in suspect.fingerprints}
            new_fps: dict[uuid.UUID, dict] = {}
            for fp in payload["fingerprints"]:
                template_bytes = _decode_template_b64(fp.get("template_data_b64"))
                if not template_bytes:
                    continue
                tid = fp.get("template_id")
                if not isinstance(tid, uuid.UUID):
                    tid = uuid.UUID(str(tid))
                new_fps[tid] = {**fp, "template_data": template_bytes}

            for tid, row in list(existing_fps.items()):
                if tid not in new_fps:
                    await self.session.delete(row)

            for sort_order, (tid, fp_data) in enumerate(new_fps.items()):
                print_id_raw = fp_data.get("print_id")
                print_id = uuid.UUID(str(print_id_raw)) if print_id_raw else None
                if tid in existing_fps:
                    row = existing_fps[tid]
                    row.finger_position = str(fp_data.get("finger_position") or "RIGHT_THUMB").upper()
                    row.template_format = str(fp_data.get("template_format") or "ISO19794-2").upper()
                    row.template_data = fp_data["template_data"]
                    row.template_hash = hashlib.sha256(fp_data["template_data"]).hexdigest()
                    row.quality_score = fp_data.get("quality_score")
                    row.device_model = _optional_str(fp_data.get("device_model"))
                    row.print_id = print_id
                    row.sort_order = sort_order
                else:
                    self.session.add(
                        SuspectFingerprint(
                            suspect_id=suspect.id,
                            dossier_id=dossier.id,
                            template_id=tid,
                            print_id=print_id,
                            finger_position=str(fp_data.get("finger_position") or "RIGHT_THUMB").upper(),
                            template_format=str(fp_data.get("template_format") or "ISO19794-2").upper(),
                            template_data=fp_data["template_data"],
                            template_hash=hashlib.sha256(fp_data["template_data"]).hexdigest(),
                            quality_score=fp_data.get("quality_score"),
                            device_model=_optional_str(fp_data.get("device_model")),
                            sort_order=sort_order,
                        )
                    )

        await self.session.flush()
        return dossier

    async def find_master_by_name(self, name: str) -> SuspectMaster | None:
        needle = name.strip().lower()
        if not needle:
            return None
        stmt = (
            select(SuspectMaster)
            .where(func.lower(SuspectMaster.display_name) == needle)
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    def _profile_search_name_match(self, needle: str):
        return or_(
            func.lower(SuspectMaster.display_name).contains(needle),
            func.lower(Suspect.criminal_name).contains(needle),
            func.lower(func.coalesce(Suspect.alias_name, "")).contains(needle),
        )

    def _profile_search_detail_filters(
        self,
        *,
        alias: str | None,
        gender: str | None,
        fathers_name: str | None,
        age: int | None,
        has_photo: bool | None,
        exclude_master_id: uuid.UUID | None,
    ) -> list:
        filters: list = []
        if alias and alias.strip():
            filters.append(
                func.lower(func.coalesce(Suspect.alias_name, "")).contains(alias.strip().lower())
            )
        if gender and gender.strip():
            filters.append(func.lower(func.coalesce(Suspect.gender, "")) == gender.strip().lower())
        if fathers_name and fathers_name.strip():
            filters.append(
                func.lower(func.coalesce(Suspect.fathers_name, "")).contains(
                    fathers_name.strip().lower()
                )
            )
        if age is not None:
            filters.append(Suspect.age == age)
        if has_photo:
            filters.append(
                exists(
                    select(SuspectPhoto.id).where(
                        SuspectPhoto.suspect_id == Suspect.id,
                        SuspectPhoto.storage_key != "",
                    )
                )
            )
        if exclude_master_id:
            filters.append(SuspectMaster.id != exclude_master_id)
        return filters

    def _front_photo(self, suspect: Suspect) -> SuspectPhoto | None:
        front = next(
            (p for p in suspect.photos if p.pose_type == "FRONT" and p.storage_key),
            None,
        )
        if front is None:
            front = next((p for p in suspect.photos if p.storage_key), None)
        return front

    def _profile_hit_dict(
        self,
        *,
        master: SuspectMaster,
        suspect: Suspect,
        dossier: SuspectDossier | None,
        office_name: str | None,
        profile_kind: str,
    ) -> dict:
        front = self._front_photo(suspect)
        return {
            "master_suspect_id": str(master.id),
            "display_name": master.display_name,
            "criminal_name": suspect.criminal_name,
            "alias_name": suspect.alias_name,
            "dossier_id": str(dossier.id) if dossier else None,
            "gender": suspect.gender,
            "fathers_name": suspect.fathers_name,
            "age": suspect.age,
            "photo_id": str(front.photo_id) if front else None,
            "dossier_draft_id": (
                str(dossier.dossier_draft_id)
                if dossier and dossier.dossier_draft_id
                else None
            ),
            "storage_key": front.storage_key if front else None,
            "office_name": office_name,
            "profile_kind": profile_kind,
            "link_status": dossier.link_status if dossier else None,
        }

    async def _profile_hits_for_master_ids(
        self,
        master_ids: list[uuid.UUID],
    ) -> dict[str, dict]:
        """Resolve latest dossier or associate-stub identity per master."""
        if not master_ids:
            return {}

        latest_sq = (
            select(
                SuspectDossier.master_suspect_id.label("master_id"),
                func.max(SuspectDossier.submitted_at).label("max_submitted"),
            )
            .where(SuspectDossier.master_suspect_id.in_(master_ids))
            .group_by(SuspectDossier.master_suspect_id)
            .subquery("latest_dossier_per_master")
        )
        dossier_stmt = (
            select(SuspectMaster, Suspect, SuspectDossier, Office)
            .join(SuspectDossier, SuspectDossier.master_suspect_id == SuspectMaster.id)
            .join(
                latest_sq,
                and_(
                    SuspectDossier.master_suspect_id == latest_sq.c.master_id,
                    SuspectDossier.submitted_at == latest_sq.c.max_submitted,
                ),
            )
            .join(Suspect, Suspect.id == SuspectDossier.suspect_id)
            .outerjoin(Office, Office.id == SuspectDossier.office_id)
            .options(selectinload(Suspect.photos))
            .where(SuspectMaster.id.in_(master_ids))
        )
        hits: dict[str, dict] = {}
        dossier_rows = (await self.session.execute(dossier_stmt)).all()
        for master, suspect, dossier, office in dossier_rows:
            hits[str(master.id)] = self._profile_hit_dict(
                master=master,
                suspect=suspect,
                dossier=dossier,
                office_name=office.office_name if office else None,
                profile_kind="dossier",
            )

        missing = [mid for mid in master_ids if str(mid) not in hits]
        if not missing:
            return hits

        stub_stmt = (
            select(SuspectMaster, Suspect, Office)
            .join(
                SuspectAssociate,
                SuspectAssociate.linked_master_suspect_id == SuspectMaster.id,
            )
            .join(Suspect, Suspect.id == SuspectAssociate.linked_suspect_id)
            .outerjoin(SuspectDossier, SuspectDossier.master_suspect_id == SuspectMaster.id)
            .outerjoin(Office, Office.id == Suspect.office_id)
            .options(selectinload(Suspect.photos))
            .where(SuspectMaster.id.in_(missing))
            .where(SuspectDossier.id.is_(None))
        )
        stub_rows = (await self.session.execute(stub_stmt)).all()
        seen_stub: set[uuid.UUID] = set()
        for master, suspect, office in stub_rows:
            if master.id in seen_stub:
                continue
            seen_stub.add(master.id)
            hits[str(master.id)] = self._profile_hit_dict(
                master=master,
                suspect=suspect,
                dossier=None,
                office_name=office.office_name if office else None,
                profile_kind="stub",
            )
        return hits

    async def _profile_hit_for_dossier_id(self, dossier_id: uuid.UUID) -> dict | None:
        stmt = (
            select(SuspectMaster, Suspect, SuspectDossier, Office)
            .join(SuspectDossier, SuspectDossier.master_suspect_id == SuspectMaster.id)
            .join(Suspect, Suspect.id == SuspectDossier.suspect_id)
            .outerjoin(Office, Office.id == SuspectDossier.office_id)
            .options(selectinload(Suspect.photos))
            .where(SuspectDossier.id == dossier_id)
        )
        row = (await self.session.execute(stmt)).first()
        if row is None:
            return None
        master, suspect, dossier, office = row
        return self._profile_hit_dict(
            master=master,
            suspect=suspect,
            dossier=dossier,
            office_name=office.office_name if office else None,
            profile_kind="dossier",
        )

    async def _profile_hit_for_stub_master_id(self, master_id: uuid.UUID) -> dict | None:
        stmt = (
            select(SuspectMaster, Suspect, Office)
            .join(
                SuspectAssociate,
                SuspectAssociate.linked_master_suspect_id == SuspectMaster.id,
            )
            .join(Suspect, Suspect.id == SuspectAssociate.linked_suspect_id)
            .outerjoin(SuspectDossier, SuspectDossier.master_suspect_id == SuspectMaster.id)
            .outerjoin(Office, Office.id == Suspect.office_id)
            .options(selectinload(Suspect.photos))
            .where(SuspectMaster.id == master_id)
            .where(SuspectDossier.id.is_(None))
        )
        row = (await self.session.execute(stmt)).first()
        if row is None:
            return None
        master, suspect, office = row
        return self._profile_hit_dict(
            master=master,
            suspect=suspect,
            dossier=None,
            office_name=office.office_name if office else None,
            profile_kind="stub",
        )

    async def search_suspect_profiles(
        self,
        query: str,
        *,
        limit: int = 20,
        offset: int = 0,
        alias: str | None = None,
        gender: str | None = None,
        fathers_name: str | None = None,
        age: int | None = None,
        has_photo: bool | None = None,
        exclude_master_id: uuid.UUID | None = None,
    ) -> tuple[list[dict], bool]:
        """Search dossier identities and associate stubs (one row per matching submission)."""
        needle = query.strip().lower()
        if len(needle) < 2:
            return [], False

        name_match = self._profile_search_name_match(needle)
        detail_filters = self._profile_search_detail_filters(
            alias=alias,
            gender=gender,
            fathers_name=fathers_name,
            age=age,
            has_photo=has_photo,
            exclude_master_id=exclude_master_id,
        )

        dossier_candidates = (
            select(
                cast(SuspectDossier.id, String).label("hit_key"),
                SuspectDossier.submitted_at.label("sort_key"),
                literal("dossier").label("hit_kind"),
            )
            .join(SuspectMaster, SuspectMaster.id == SuspectDossier.master_suspect_id)
            .join(Suspect, Suspect.id == SuspectDossier.suspect_id)
            .where(name_match, *detail_filters)
        )
        stub_candidates = (
            select(
                cast(SuspectMaster.id, String).label("hit_key"),
                SuspectMaster.created_at.label("sort_key"),
                literal("stub").label("hit_kind"),
            )
            .join(
                SuspectAssociate,
                SuspectAssociate.linked_master_suspect_id == SuspectMaster.id,
            )
            .join(Suspect, Suspect.id == SuspectAssociate.linked_suspect_id)
            .outerjoin(SuspectDossier, SuspectDossier.master_suspect_id == SuspectMaster.id)
            .where(SuspectDossier.id.is_(None))
            .where(name_match, *detail_filters)
            .group_by(SuspectMaster.id, SuspectMaster.created_at)
        )

        combined = union_all(dossier_candidates, stub_candidates).subquery("profile_hits")
        page_stmt = (
            select(combined.c.hit_key, combined.c.hit_kind)
            .order_by(combined.c.sort_key.desc())
            .offset(offset)
            .limit(limit + 1)
        )
        rows = (await self.session.execute(page_stmt)).all()
        has_more = len(rows) > limit
        page_rows = rows[:limit]

        page: list[dict] = []
        for hit_key, hit_kind in page_rows:
            hit_id = uuid.UUID(str(hit_key))
            if hit_kind == "dossier":
                hit = await self._profile_hit_for_dossier_id(hit_id)
            else:
                hit = await self._profile_hit_for_stub_master_id(hit_id)
            if hit:
                page.append(hit)
        return self._group_search_hits_by_master(page), has_more

    @staticmethod
    def _group_search_hits_by_master(hits: list[dict]) -> list[dict]:
        """One row per master; linked/sub-profile names surface as match tags."""
        grouped: dict[str, dict] = {}
        order: list[str] = []
        for hit in hits:
            mid = str(hit["master_suspect_id"])
            criminal = (hit.get("criminal_name") or "").strip()
            display = (hit.get("display_name") or "").strip()

            if mid not in grouped:
                row = dict(hit)
                row["match_tags"] = []
                if criminal and criminal.lower() != display.lower():
                    row["match_tags"].append(criminal)
                grouped[mid] = row
                order.append(mid)
                continue

            row = grouped[mid]
            if criminal and criminal.lower() != display.lower() and criminal not in row["match_tags"]:
                row["match_tags"].append(criminal)
            alias = (hit.get("alias_name") or "").strip()
            if alias and alias.lower() != display.lower() and alias not in row["match_tags"]:
                row["match_tags"].append(alias)
            if not row.get("storage_key") and hit.get("storage_key"):
                row["photo_id"] = hit.get("photo_id")
                row["dossier_draft_id"] = hit.get("dossier_draft_id")
                row["storage_key"] = hit.get("storage_key")

        return [grouped[mid] for mid in order]

    async def _resolve_associate_master(
        self,
        *,
        name: str,
        linked_master_id: uuid.UUID | None,
        created_by: uuid.UUID,
        office_id: uuid.UUID | None,
    ) -> tuple[uuid.UUID, uuid.UUID | None, str]:
        """Return (master_id, linked_suspect_id, display_name) for an associate."""
        clean_name = name.strip()
        if linked_master_id:
            master = await self.get_master(linked_master_id)
            if master:
                stmt = (
                    select(Suspect)
                    .join(SuspectDossier, SuspectDossier.suspect_id == Suspect.id)
                    .where(SuspectDossier.master_suspect_id == master.id)
                    .order_by(SuspectDossier.submitted_at.desc())
                    .limit(1)
                )
                row = (await self.session.execute(stmt)).scalar_one_or_none()
                return master.id, row.id if row else None, master.display_name

        master = SuspectMaster(display_name=clean_name)
        self.session.add(master)
        await self.session.flush()
        stub = Suspect(
            criminal_name=clean_name,
            created_by=created_by,
            office_id=office_id,
        )
        self.session.add(stub)
        await self.session.flush()
        return master.id, stub.id, clean_name

    async def _sync_associates(
        self,
        *,
        suspect_id: uuid.UUID,
        dossier_id: uuid.UUID,
        source_master_id: uuid.UUID,
        associates: list[dict],
        created_by: uuid.UUID,
        office_id: uuid.UUID | None,
    ) -> list[dict]:
        """Persist associates and return resolved rows for Neo4j sync."""
        resolved: list[dict] = []
        for item in associates:
            name = _optional_str(item.get("name"))
            if not name:
                continue
            linked_raw = item.get("linked_master_suspect_id")
            linked_master_id: uuid.UUID | None = None
            if linked_raw:
                try:
                    linked_master_id = uuid.UUID(str(linked_raw))
                except ValueError:
                    linked_master_id = None

            master_id, linked_suspect_id, display_name = await self._resolve_associate_master(
                name=name,
                linked_master_id=linked_master_id,
                created_by=created_by,
                office_id=office_id,
            )
            if str(master_id) == str(source_master_id):
                continue

            self.session.add(
                SuspectAssociate(
                    suspect_id=suspect_id,
                    dossier_id=dossier_id,
                    name=display_name,
                    association_type=_optional_str(item.get("association_type")),
                    occupation=_optional_str(item.get("occupation")),
                    notes=_optional_str(item.get("notes")),
                    linked_master_suspect_id=master_id,
                    linked_suspect_id=linked_suspect_id,
                )
            )
            resolved.append(
                {
                    "master_id": str(master_id),
                    "display_name": display_name,
                    "association_type": _optional_str(item.get("association_type")) or "ASSOCIATE",
                    "dossier_id": str(dossier_id),
                }
            )
        return resolved

    async def relatives_for_graph(self, master_id: uuid.UUID) -> list[dict]:
        """Family relatives from all dossiers under this master profile."""
        stmt = (
            select(SuspectRelative, SuspectDossier)
            .join(Suspect, Suspect.id == SuspectRelative.suspect_id)
            .join(SuspectDossier, SuspectDossier.suspect_id == Suspect.id)
            .where(SuspectDossier.master_suspect_id == master_id)
            .order_by(SuspectDossier.submitted_at.desc())
        )
        rows = (await self.session.execute(stmt)).all()
        seen: set[str] = set()
        relatives: list[dict] = []
        for relative, dossier in rows:
            rel_id = str(relative.id)
            if rel_id in seen:
                continue
            seen.add(rel_id)
            relatives.append(
                {
                    "id": rel_id,
                    "name": relative.name,
                    "relation": relative.relation or "Relative",
                    "gender": relative.gender,
                    "dossier_id": str(dossier.id),
                }
            )
        return relatives

    async def associates_for_graph_sync(self, dossier_id: uuid.UUID) -> list[dict]:
        stmt = select(SuspectAssociate).where(SuspectAssociate.dossier_id == dossier_id)
        rows = (await self.session.execute(stmt)).scalars().all()
        return [
            {
                "master_id": str(row.linked_master_suspect_id),
                "display_name": row.name,
                "association_type": row.association_type or "ASSOCIATE",
                "dossier_id": str(row.dossier_id),
            }
            for row in rows
            if row.linked_master_suspect_id
        ]

    async def get_master_graph_profiles(
        self,
        master_ids: list[uuid.UUID],
    ) -> dict[str, dict]:
        """Latest dossier identity + front photo per master (for knowledge-graph nodes)."""
        if not master_ids:
            return {}

        stmt = (
            select(SuspectDossier, Suspect)
            .join(Suspect, Suspect.id == SuspectDossier.suspect_id)
            .options(selectinload(Suspect.photos))
            .where(SuspectDossier.master_suspect_id.in_(master_ids))
            .order_by(SuspectDossier.submitted_at.desc())
        )
        rows = (await self.session.execute(stmt)).all()
        profiles: dict[str, dict] = {}
        for dossier, suspect in rows:
            key = str(dossier.master_suspect_id)
            if key in profiles:
                continue
            front = self._front_photo(suspect)
            profiles[key] = {
                "criminal_name": suspect.criminal_name,
                "gender": suspect.gender,
                "photo_id": str(front.photo_id) if front else None,
                "dossier_draft_id": (
                    str(dossier.dossier_draft_id) if dossier.dossier_draft_id else None
                ),
                "storage_key": front.storage_key if front else None,
            }

        missing = [mid for mid in master_ids if str(mid) not in profiles]
        if missing:
            stub_stmt = (
                select(SuspectMaster, Suspect)
                .join(
                    SuspectAssociate,
                    SuspectAssociate.linked_master_suspect_id == SuspectMaster.id,
                )
                .join(Suspect, Suspect.id == SuspectAssociate.linked_suspect_id)
                .outerjoin(SuspectDossier, SuspectDossier.master_suspect_id == SuspectMaster.id)
                .options(selectinload(Suspect.photos))
                .where(SuspectMaster.id.in_(missing))
                .where(SuspectDossier.id.is_(None))
            )
            stub_rows = (await self.session.execute(stub_stmt)).all()
            seen_stub: set[uuid.UUID] = set()
            for master, suspect in stub_rows:
                if master.id in seen_stub:
                    continue
                seen_stub.add(master.id)
                key = str(master.id)
                if key in profiles:
                    continue
                front = self._front_photo(suspect)
                profiles[key] = {
                    "criminal_name": suspect.criminal_name,
                    "gender": suspect.gender,
                    "photo_id": str(front.photo_id) if front else None,
                    "dossier_draft_id": None,
                    "storage_key": front.storage_key if front else None,
                }
        return profiles

    async def get_master(self, master_id: uuid.UUID) -> SuspectMaster | None:
        result = await self.session.execute(
            select(SuspectMaster).where(SuspectMaster.id == master_id)
        )
        return result.scalar_one_or_none()

    async def get_master_with_dossiers(self, master_id: uuid.UUID) -> SuspectMaster | None:
        stmt = (
            select(SuspectMaster)
            .options(
                selectinload(SuspectMaster.dossiers)
                .selectinload(SuspectDossier.suspect)
                .selectinload(Suspect.addresses),
                selectinload(SuspectMaster.dossiers)
                .selectinload(SuspectDossier.suspect)
                .selectinload(Suspect.contacts),
                selectinload(SuspectMaster.dossiers)
                .selectinload(SuspectDossier.suspect)
                .selectinload(Suspect.social_accounts),
                selectinload(SuspectMaster.dossiers)
                .selectinload(SuspectDossier.suspect)
                .selectinload(Suspect.relatives),
                selectinload(SuspectMaster.dossiers)
                .selectinload(SuspectDossier.suspect)
                .selectinload(Suspect.photos),
            )
            .where(SuspectMaster.id == master_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def records_for_face_matches(
        self,
        face_matches: list[dict],
    ) -> list[MatchCandidateRecord]:
        if not face_matches:
            return []

        master_ids: set[uuid.UUID] = set()
        for m in face_matches:
            sid = m.get("suspect_id") or m.get("master_suspect_id")
            if sid:
                try:
                    master_ids.add(uuid.UUID(str(sid)))
                except ValueError:
                    continue

        if not master_ids:
            return []

        stmt = (
            select(SuspectDossier, Suspect, Office)
            .join(Suspect, Suspect.id == SuspectDossier.suspect_id)
            .outerjoin(Office, Office.id == SuspectDossier.office_id)
            .options(selectinload(Suspect.addresses), selectinload(Suspect.photos))
            .where(SuspectDossier.master_suspect_id.in_(master_ids))
            .order_by(SuspectDossier.submitted_at.desc())
        )
        rows = (await self.session.execute(stmt)).all()

        best_by_master: dict[uuid.UUID, tuple] = {}
        for dossier, suspect, office in rows:
            mid = dossier.master_suspect_id
            prev = best_by_master.get(mid)
            if prev is None:
                best_by_master[mid] = (dossier, suspect, office)
            elif dossier.link_status == "STANDALONE" and prev[0].link_status != "STANDALONE":
                best_by_master[mid] = (dossier, suspect, office)

        sim_by_master: dict[str, float] = {}
        for m in face_matches:
            sid = str(m.get("suspect_id") or m.get("master_suspect_id") or "")
            if sid:
                sim_by_master[sid] = max(sim_by_master.get(sid, 0.0), float(m.get("similarity_score", 0)))

        records: list[MatchCandidateRecord] = []
        for mid, (dossier, suspect, office) in best_by_master.items():
            if dossier.link_status != "STANDALONE":
                continue
            addr = get_primary_address(suspect)
            front = next((p for p in suspect.photos if p.pose_type == "FRONT"), None)
            records.append(
                MatchCandidateRecord(
                    master_suspect_id=str(mid),
                    dossier_id=str(dossier.id),
                    dossier_draft_id=str(dossier.dossier_draft_id) if dossier.dossier_draft_id else None,
                    criminal_name=suspect.criminal_name,
                    alias_name=suspect.alias_name,
                    fathers_name=suspect.fathers_name,
                    date_of_birth=suspect.date_of_birth,
                    year_of_birth=suspect.year_of_birth,
                    address_district=addr.district if addr else None,
                    address_pincode=addr.pincode if addr else None,
                    address_village=addr.village_town_city if addr else None,
                    face_similarity=sim_by_master.get(str(mid), 0.0),
                    office_name=office.office_name if office else None,
                    storage_key=front.storage_key if front else None,
                    photo_id=str(front.photo_id) if front else None,
                )
            )

        return records

    async def resolve_face_match_candidates(
        self,
        *,
        draft: MatchCandidateInput,
        face_matches: list[dict],
    ) -> list:
        records = await self.records_for_face_matches(face_matches)
        return score_match_candidates(draft, records)

    async def search_identity_match_candidates(
        self,
        *,
        draft: MatchCandidateInput,
        office_id: uuid.UUID | None,
        cross_unit: bool,
        exclude_master_id: uuid.UUID | None = None,
        exclude_dossier_id: uuid.UUID | None = None,
        limit: int = 40,
    ) -> list[MatchCandidateRecord]:
        """Find dossiers with overlapping identity fields (name, father, DOB, address)."""
        if not draft.criminal_name.strip() and not (draft.fathers_name or "").strip():
            return []

        stmt = (
            select(SuspectDossier, Suspect, Office)
            .join(Suspect, Suspect.id == SuspectDossier.suspect_id)
            .outerjoin(Office, Office.id == SuspectDossier.office_id)
            .options(selectinload(Suspect.addresses), selectinload(Suspect.photos))
            .where(SuspectDossier.link_status == "STANDALONE")
            .order_by(SuspectDossier.submitted_at.desc())
        )
        if not cross_unit and office_id:
            stmt = stmt.where(SuspectDossier.office_id == office_id)
        if exclude_master_id:
            stmt = stmt.where(SuspectDossier.master_suspect_id != exclude_master_id)
        if exclude_dossier_id:
            stmt = stmt.where(SuspectDossier.id != exclude_dossier_id)

        rows = (await self.session.execute(stmt.limit(limit * 4))).all()
        records: list[MatchCandidateRecord] = []
        seen_masters: set[uuid.UUID] = set()

        for dossier, suspect, office in rows:
            mid = dossier.master_suspect_id
            if mid in seen_masters:
                continue

            name_hit = _fuzzy_ratio(draft.criminal_name, suspect.criminal_name) >= 0.72
            father_hit = (
                draft.fathers_name
                and suspect.fathers_name
                and _fuzzy_ratio(draft.fathers_name, suspect.fathers_name) >= 0.72
            )
            alias_hit = (
                draft.alias_name
                and (
                    _fuzzy_ratio(draft.alias_name, suspect.alias_name or "") >= 0.8
                    or _fuzzy_ratio(draft.alias_name, suspect.criminal_name) >= 0.8
                )
            )
            dob_hit = (
                draft.date_of_birth
                and suspect.date_of_birth
                and draft.date_of_birth == suspect.date_of_birth
            )
            yob_hit = (
                draft.year_of_birth
                and suspect.year_of_birth
                and draft.year_of_birth == suspect.year_of_birth
            )
            addr = get_primary_address(suspect)
            pin_hit = (
                draft.address_pincode
                and addr
                and addr.pincode
                and _norm_pin(draft.address_pincode) == _norm_pin(addr.pincode)
            )
            district_hit = (
                draft.address_district
                and addr
                and addr.district
                and _fuzzy_ratio(draft.address_district, addr.district) >= 0.9
            )

            if not any([name_hit, father_hit, alias_hit, dob_hit, yob_hit, pin_hit, district_hit]):
                continue

            seen_masters.add(mid)
            front = next((p for p in suspect.photos if p.pose_type == "FRONT"), None)
            records.append(
                MatchCandidateRecord(
                    master_suspect_id=str(mid),
                    dossier_id=str(dossier.id),
                    dossier_draft_id=str(dossier.dossier_draft_id) if dossier.dossier_draft_id else None,
                    criminal_name=suspect.criminal_name,
                    alias_name=suspect.alias_name,
                    fathers_name=suspect.fathers_name,
                    date_of_birth=suspect.date_of_birth,
                    year_of_birth=suspect.year_of_birth,
                    address_district=addr.district if addr else None,
                    address_pincode=addr.pincode if addr else None,
                    address_village=addr.village_town_city if addr else None,
                    face_similarity=0.0,
                    office_name=office.office_name if office else None,
                    storage_key=front.storage_key if front else None,
                    photo_id=str(front.photo_id) if front else None,
                )
            )
            if len(records) >= limit:
                break

        return records

    async def list_dossiers(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        q: str | None = None,
        office_id: uuid.UUID | None = None,
        cross_unit: bool = False,
    ) -> tuple[list[SuspectDossier], int]:
        stmt = (
            select(SuspectDossier)
            .options(
                selectinload(SuspectDossier.suspect).selectinload(Suspect.photos),
                selectinload(SuspectDossier.master).selectinload(SuspectMaster.dossiers),
            )
            .order_by(SuspectDossier.submitted_at.desc())
        )
        count_stmt = select(func.count()).select_from(SuspectDossier)

        if not cross_unit and office_id:
            stmt = stmt.where(SuspectDossier.office_id == office_id)
            count_stmt = count_stmt.where(SuspectDossier.office_id == office_id)

        if q and q.strip():
            filters, _ = _dossier_search_filters(q)
            stmt = stmt.join(Suspect).where(or_(*filters))
            count_stmt = count_stmt.join(Suspect).where(or_(*filters))

        total = int((await self.session.execute(count_stmt)).scalar_one())
        offset = max(0, (page - 1) * page_size)
        result = await self.session.execute(stmt.offset(offset).limit(page_size))
        return list(result.scalars().unique().all()), total

    async def get_dossier(self, dossier_id: uuid.UUID) -> SuspectDossier | None:
        stmt = (
            select(SuspectDossier)
            .options(
                selectinload(SuspectDossier.master),
                selectinload(SuspectDossier.suspect).selectinload(Suspect.addresses),
                selectinload(SuspectDossier.suspect).selectinload(Suspect.contacts),
                selectinload(SuspectDossier.suspect).selectinload(Suspect.social_accounts),
                selectinload(SuspectDossier.suspect).selectinload(Suspect.relatives),
                selectinload(SuspectDossier.suspect).selectinload(Suspect.associates),
                selectinload(SuspectDossier.suspect).selectinload(Suspect.photos),
            )
            .where(SuspectDossier.id == dossier_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_office_name(self, office_id: uuid.UUID | None) -> str | None:
        if not office_id:
            return None
        result = await self.session.execute(
            select(Office.office_name).where(Office.id == office_id)
        )
        return result.scalar_one_or_none()
