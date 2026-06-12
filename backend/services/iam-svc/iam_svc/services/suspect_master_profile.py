"""Build consolidated master suspect profile responses."""

from __future__ import annotations

import base64
from iam_svc.models.suspect_dossier import Suspect, SuspectAddress, SuspectDossier, SuspectMaster, SuspectPhoto, SuspectFingerprint
from iam_svc.services.suspect_address_utils import get_address_by_kind


def _address_dict(addr: SuspectAddress) -> dict:
    return {
        "is_permanent": addr.is_permanent,
        "house_no": addr.house_no,
        "house_name": addr.house_name,
        "street_name": addr.street_name,
        "locality": addr.locality,
        "tehsil": addr.tehsil,
        "village_town_city": addr.village_town_city,
        "pincode": addr.pincode,
        "latitude": float(addr.latitude) if addr.latitude is not None else None,
        "longitude": float(addr.longitude) if addr.longitude is not None else None,
        "district": addr.district,
        "state": addr.state,
        "country": addr.country,
        "police_station": addr.police_station,
    }


def _identity_block(suspect: Suspect, dossier: SuspectDossier, office_name: str | None) -> dict:
    return {
        "dossier_id": str(dossier.id),
        "office_name": office_name,
        "submitted_at": dossier.submitted_at.isoformat(),
        "criminal_name": suspect.criminal_name,
        "alias_name": suspect.alias_name,
        "gender": suspect.gender,
        "fathers_name": suspect.fathers_name,
        "date_of_birth": suspect.date_of_birth.isoformat() if suspect.date_of_birth else None,
        "age": suspect.age,
        "year_of_birth": suspect.year_of_birth,
        "place_of_birth": suspect.place_of_birth,
        "religion": suspect.religion,
        "category": suspect.category,
    }


def build_master_profile(
    master: SuspectMaster,
    dossiers: list[SuspectDossier],
    office_names: dict[str, str | None],
) -> dict:
    identities: list[dict] = []
    addresses: list[dict] = []
    contacts: list[dict] = []
    social_accounts: list[dict] = []
    relatives: list[dict] = []
    photos: list[dict] = []
    fingerprints: list[dict] = []

    for dossier in sorted(dossiers, key=lambda d: d.submitted_at, reverse=True):
        suspect = dossier.suspect
        office_name = office_names.get(str(dossier.office_id)) if dossier.office_id else None
        tag = {"dossier_id": str(dossier.id), "office_name": office_name}

        identities.append(_identity_block(suspect, dossier, office_name))

        for addr in suspect.addresses or []:
            addresses.append({**tag, **_address_dict(addr)})

        for c in suspect.contacts:
            contacts.append({**tag, "contact_type": c.contact_type, "value": c.value})

        for s in suspect.social_accounts:
            social_accounts.append({**tag, "platform": s.platform, "details": s.details})

        for r in suspect.relatives:
            relatives.append(
                {
                    **tag,
                    "name": r.name,
                    "relation": r.relation,
                    "gender": r.gender,
                    "occupation": r.occupation,
                }
            )

        draft_id = str(dossier.dossier_draft_id) if dossier.dossier_draft_id else None
        for p in sorted(suspect.photos, key=lambda x: x.sort_order):
            photos.append(_photo_dict(p, tag, dossier_draft_id=draft_id))
        for f in sorted(suspect.fingerprints or [], key=lambda x: x.sort_order):
            fingerprints.append(_fingerprint_dict(f, tag))

    return {
        "master_suspect_id": str(master.id),
        "display_name": master.display_name,
        "dossier_count": len(dossiers),
        "identities": identities,
        "addresses": addresses,
        "contacts": contacts,
        "social_accounts": social_accounts,
        "relatives": relatives,
        "photos": photos,
        "fingerprints": fingerprints,
    }


def build_dossier_detail(
    dossier: SuspectDossier,
    office_name: str | None,
) -> dict:
    suspect = dossier.suspect
    tag = {"dossier_id": str(dossier.id), "office_name": office_name}
    return {
        "dossier_id": str(dossier.id),
        "master_suspect_id": str(dossier.master_suspect_id),
        "suspect_id": str(suspect.id),
        "link_status": dossier.link_status,
        "status": dossier.status,
        "office_name": office_name,
        "submitted_at": dossier.submitted_at.isoformat(),
        "identity": _identity_block(suspect, dossier, office_name),
        "address": (
            _address_dict(perm)
            if (perm := get_address_by_kind(suspect.addresses, is_permanent=True))
            else None
        ),
        "present_address": (
            _address_dict(pres)
            if (pres := get_address_by_kind(suspect.addresses, is_permanent=False))
            else None
        ),
        "has_different_present_address": get_address_by_kind(
            suspect.addresses, is_permanent=False
        )
        is not None,
        "contacts": [
            {"contact_type": c.contact_type, "value": c.value} for c in suspect.contacts
        ],
        "social_accounts": [
            {"platform": s.platform, "details": s.details} for s in suspect.social_accounts
        ],
        "relatives": [
            {
                "name": r.name,
                "relation": r.relation,
                "gender": r.gender,
                "occupation": r.occupation,
            }
            for r in suspect.relatives
        ],
        "associates": [
            {
                "name": a.name,
                "association_type": a.association_type,
                "occupation": a.occupation,
                "notes": a.notes,
                "linked_master_suspect_id": (
                    str(a.linked_master_suspect_id) if a.linked_master_suspect_id else None
                ),
            }
            for a in suspect.associates
        ],
        "photos": [
            _photo_dict(
                p,
                tag,
                dossier_draft_id=str(dossier.dossier_draft_id) if dossier.dossier_draft_id else None,
            )
            for p in sorted(suspect.photos, key=lambda x: x.sort_order)
        ],
        "fingerprints": [
            _fingerprint_dict(f, tag)
            for f in sorted(suspect.fingerprints or [], key=lambda x: x.sort_order)
        ],
        "dossier_draft_id": str(dossier.dossier_draft_id) if dossier.dossier_draft_id else None,
    }


def _photo_dict(
    photo: SuspectPhoto, tag: dict, *, dossier_draft_id: str | None = None
) -> dict:
    return {
        **tag,
        "dossier_draft_id": dossier_draft_id,
        "photo_id": str(photo.photo_id),
        "pose_type": photo.pose_type,
        "storage_key": photo.storage_key,
        "face_id": str(photo.face_id) if photo.face_id else None,
        "detected_pose": photo.detected_pose,
        "face_detected": photo.face_detected,
    }


def _fingerprint_dict(fp: SuspectFingerprint, tag: dict) -> dict:
    return {
        **tag,
        "template_id": str(fp.template_id),
        "print_id": str(fp.print_id) if fp.print_id else None,
        "finger_position": fp.finger_position,
        "template_format": fp.template_format,
        "template_data": base64.b64encode(fp.template_data).decode("utf-8"),
        "template_hash": fp.template_hash,
        "quality_score": fp.quality_score,
        "device_model": fp.device_model,
    }
