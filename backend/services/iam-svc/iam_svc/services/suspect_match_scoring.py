"""Score identity overlap between a draft dossier and an existing master/child record."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from difflib import SequenceMatcher


STRONG_MATCH_THRESHOLD = 70
FACE_GATE_MIN = 0.85
IDENTITY_ONLY_MIN = 25


@dataclass
class MatchCandidateInput:
    criminal_name: str
    alias_name: str | None
    fathers_name: str | None
    date_of_birth: date | None
    year_of_birth: int | None
    address_district: str | None
    address_pincode: str | None
    address_village: str | None


@dataclass
class MatchCandidateRecord:
    master_suspect_id: str
    dossier_id: str | None
    dossier_draft_id: str | None
    criminal_name: str
    alias_name: str | None
    fathers_name: str | None
    date_of_birth: date | None
    year_of_birth: int | None
    address_district: str | None
    address_pincode: str | None
    address_village: str | None
    face_similarity: float
    office_name: str | None = None
    storage_key: str | None = None
    photo_id: str | None = None


@dataclass
class ScoredMatch:
    master_suspect_id: str
    dossier_id: str | None
    dossier_draft_id: str | None
    criminal_name: str
    alias_name: str | None
    office_name: str | None
    face_similarity: float
    match_score: int
    tier: str  # STRONG | WEAK | IDENTITY | BELOW_FACE_GATE
    storage_key: str | None = None
    photo_id: str | None = None


def _norm(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip().lower())


def _fuzzy_ratio(a: str | None, b: str | None) -> float:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _score_identity(draft: MatchCandidateInput, existing: MatchCandidateRecord) -> int:
    score = 0

    name_ratio = _fuzzy_ratio(draft.criminal_name, existing.criminal_name)
    if name_ratio >= 0.92:
        score += 20
    elif name_ratio >= 0.75:
        score += 12

    if draft.alias_name and existing.alias_name:
        if _fuzzy_ratio(draft.alias_name, existing.alias_name) >= 0.85:
            score += 10
        elif _fuzzy_ratio(draft.alias_name, existing.criminal_name) >= 0.85:
            score += 8

    father_ratio = _fuzzy_ratio(draft.fathers_name, existing.fathers_name)
    if father_ratio >= 0.9:
        score += 15
    elif father_ratio >= 0.75:
        score += 8

    if draft.date_of_birth and existing.date_of_birth:
        if draft.date_of_birth == existing.date_of_birth:
            score += 25
        elif draft.date_of_birth.year == existing.date_of_birth.year:
            score += 12
    elif draft.year_of_birth and existing.year_of_birth:
        if draft.year_of_birth == existing.year_of_birth:
            score += 15

    if _norm(draft.address_pincode) and _norm(draft.address_pincode) == _norm(
        existing.address_pincode
    ):
        score += 10
    if _norm(draft.address_district) and _norm(draft.address_district) == _norm(
        existing.address_district
    ):
        score += 8
    if _norm(draft.address_village) and _norm(draft.address_village) == _norm(
        existing.address_village
    ):
        score += 7

    return min(score, 100)


def score_match_candidate(
    draft: MatchCandidateInput,
    existing: MatchCandidateRecord,
) -> ScoredMatch:
    match_score = _score_identity(draft, existing)
    if existing.face_similarity >= FACE_GATE_MIN:
        tier = "STRONG" if match_score >= STRONG_MATCH_THRESHOLD else "WEAK"
    elif match_score >= IDENTITY_ONLY_MIN:
        tier = "STRONG" if match_score >= STRONG_MATCH_THRESHOLD else "IDENTITY"
    else:
        tier = "BELOW_FACE_GATE"
        match_score = 0

    return ScoredMatch(
        master_suspect_id=existing.master_suspect_id,
        dossier_id=existing.dossier_id,
        dossier_draft_id=existing.dossier_draft_id,
        criminal_name=existing.criminal_name,
        alias_name=existing.alias_name,
        office_name=existing.office_name,
        face_similarity=existing.face_similarity,
        match_score=match_score,
        tier=tier,
        storage_key=existing.storage_key,
        photo_id=existing.photo_id,
    )


def score_match_candidates(
    draft: MatchCandidateInput,
    candidates: list[MatchCandidateRecord],
) -> list[ScoredMatch]:
    scored = [score_match_candidate(draft, c) for c in candidates]
    scored = [s for s in scored if s.tier != "BELOW_FACE_GATE"]
    scored.sort(key=lambda s: (s.match_score, s.face_similarity), reverse=True)
    return scored


def merge_candidate_records(
    primary: list[MatchCandidateRecord],
    extra: list[MatchCandidateRecord],
) -> list[MatchCandidateRecord]:
    """Merge by master_suspect_id; primary (face) rows win on duplicate keys."""
    by_master: dict[str, MatchCandidateRecord] = {}
    for record in extra:
        by_master[record.master_suspect_id] = record
    for record in primary:
        by_master[record.master_suspect_id] = record
    return list(by_master.values())
