"""OpenAFIS-backed fingerprint store — ISO templates on disk, PG metadata in memory."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from iip_core.logging import get_logger

from ml_gateway_svc.services.fingerprint_index import (
    FingerprintMatch,
    match_minutiae_fast,
    match_minutiae_identify,
    parse_fmr_minutiae,
)
from ml_gateway_svc.services.fingerprint_quality import (
    assess_template_quality,
    filter_minutiae_for_match,
)
from ml_gateway_svc.services.fingerprint_pipeline import (
    is_iso19794_fmr_template,
    normalize_iso19794_template,
)
from ml_gateway_svc.services.face_similarity import apply_match_margin
from ml_gateway_svc.services.nbis_matcher import NbisMatcher
from ml_gateway_svc.settings import MlGatewaySettings, get_ml_settings

logger = get_logger(__name__)

_nbis: NbisMatcher | None = None


def _get_nbis() -> NbisMatcher:
    global _nbis
    if _nbis is None:
        _nbis = NbisMatcher()
    return _nbis


@dataclass
class _PrintRecord:
    print_id: str
    template_id: str | None
    dossier_draft_id: str | None
    suspect_id: str | None
    criminal_name: str | None
    finger_position: str
    template_format: str
    template_hash: str
    template_bytes: bytes
    minutiae: list[tuple[int, int, int, int, int]]
    quality_score: float | None
    device_model: str | None
    has_nbis: bool
    created_by: str
    created_at: str


class FingerprintAfisStore:
    """Store ISO templates for OpenAFIS 1:N matching (no Elasticsearch)."""

    def __init__(self, settings: MlGatewaySettings | None = None) -> None:
        self._settings = settings or get_ml_settings()
        self._records: dict[str, _PrintRecord] = {}
        self._templates_dir = Path(self._settings.openafis_templates_dir)
        self._templates_dir.mkdir(parents=True, exist_ok=True)

    @property
    def enabled(self) -> bool:
        return self._settings.fingerprint_backend == "openafis"

    async def ensure_index(self) -> None:
        self._templates_dir.mkdir(parents=True, exist_ok=True)
        repaired = await self._repair_iso_templates()
        logger.info(
            "openafis_templates_ready",
            path=str(self._templates_dir),
            repaired_iso_files=repaired,
        )

    async def _repair_iso_templates(self) -> int:
        """Rewrite .iso files whose declared totalLength does not match file size."""

        def _run() -> int:
            count = 0
            for path in self._templates_dir.glob("*.iso"):
                raw = path.read_bytes()
                fixed = normalize_iso19794_template(raw)
                if fixed != raw:
                    path.write_bytes(fixed)
                    count += 1
            return count

        return await asyncio.to_thread(_run)

    async def close(self) -> None:
        return

    def _iso_path(self, print_id: str) -> Path:
        return self._templates_dir / f"{print_id}.iso"

    async def index_print(
        self,
        *,
        print_id: str,
        template_id: str,
        dossier_draft_id: str,
        finger_position: str,
        template_format: str,
        template_bytes: bytes,
        template_hash: str,
        created_by: str,
        suspect_id: str | None = None,
        criminal_name: str | None = None,
        quality_score: float | None = None,
        device_model: str | None = None,
        image_bytes: bytes | None = None,
        image_width: int | None = None,
        image_height: int | None = None,
    ) -> None:
        normalized = normalize_iso19794_template(template_bytes)
        iso_path = self._iso_path(print_id)
        await asyncio.to_thread(iso_path.write_bytes, normalized)
        quality = assess_template_quality(normalized)
        minutiae = parse_fmr_minutiae(normalized)
        if quality["grade"] != "good":
            logger.warning(
                "fingerprint_low_quality_enrollment",
                print_id=print_id,
                suspect_id=suspect_id,
                criminal_name=criminal_name,
                grade=quality["grade"],
                minutiae=quality["minutiae_count"],
                bytes=quality["bytes"],
            )
        has_nbis = False
        if image_bytes and image_width and image_height:
            try:
                has_nbis = await _get_nbis().enroll_image(
                    print_id,
                    image_bytes,
                    width=image_width,
                    height=image_height,
                )
            except Exception as exc:
                logger.warning("nbis_enroll_failed", print_id=print_id, error=str(exc))
        elif _get_nbis().has_gallery_entry(print_id):
            has_nbis = True

        self._records[print_id] = _PrintRecord(
            print_id=print_id,
            template_id=template_id,
            dossier_draft_id=dossier_draft_id,
            suspect_id=suspect_id,
            criminal_name=criminal_name,
            finger_position=finger_position.upper(),
            template_format=template_format.upper(),
            template_hash=template_hash,
            template_bytes=normalized,
            minutiae=minutiae,
            quality_score=quality_score,
            device_model=device_model,
            has_nbis=has_nbis,
            created_by=created_by,
            created_at=datetime.now(UTC).isoformat(),
        )
        logger.info(
            "openafis_print_indexed",
            print_id=print_id,
            suspect_id=suspect_id,
            has_nbis=has_nbis,
        )

    async def delete_print(self, print_id: str) -> None:
        self._records.pop(print_id, None)
        iso_path = self._iso_path(print_id)
        if iso_path.exists():
            await asyncio.to_thread(iso_path.unlink)
        await _get_nbis().delete_print(print_id)

    async def delete_draft_prints(self, dossier_draft_id: str) -> None:
        to_delete = [
            pid
            for pid, rec in self._records.items()
            if rec.dossier_draft_id == dossier_draft_id and not rec.suspect_id
        ]
        for pid in to_delete:
            await self.delete_print(pid)

    async def ensure_gallery_loaded(self) -> int:
        """Load approved prints from PostgreSQL when the in-memory gallery is empty."""
        if self._records:
            return len(self._records)
        from ml_gateway_svc.services.fingerprint_bootstrap import bootstrap_fingerprints_from_db
        from ml_gateway_svc.services.fingerprint_store import get_fingerprint_store

        return await bootstrap_fingerprints_from_db(get_fingerprint_store())

    async def find_similar(
        self,
        template_bytes: bytes,
        *,
        exclude_dossier_draft_id: str | None = None,
        exclude_print_id: str | None = None,
        submitted_only: bool = True,
        min_cosine: float | None = None,
        apply_margin: bool = True,
        finger_position: str | None = None,
        identify_mode: bool = False,
        match_engine: str = "openafis",
        image_bytes: bytes | None = None,
        image_width: int | None = None,
        image_height: int | None = None,
    ) -> list[FingerprintMatch]:
        await self.ensure_gallery_loaded()
        engine = (match_engine or "openafis").strip().lower()
        if engine == "nbis":
            return await self._find_similar_nbis(
                image_bytes=image_bytes,
                image_width=image_width,
                image_height=image_height,
                exclude_dossier_draft_id=exclude_dossier_draft_id,
                exclude_print_id=exclude_print_id,
                submitted_only=submitted_only,
                finger_position=finger_position,
                identify_mode=identify_mode,
            )

        if min_cosine is not None:
            min_score = int(min_cosine * 100)
        else:
            min_score = self._settings.openafis_min_score

        probe_bytes = normalize_iso19794_template(template_bytes)
        # SecuGen FMR templates are not parsed by OpenAFIS; docker exec is slow and always fails.
        if is_iso19794_fmr_template(probe_bytes):
            all_scored = self._minutiae_match(
                probe_bytes,
                min_score=0,
                finger_position=finger_position,
                identify_mode=identify_mode,
            )
            openafis_hits = self._pick_identify_hits(all_scored, min_score) if identify_mode else [
                (pid, sc) for pid, sc in all_scored if sc >= min_score
            ]
        else:
            openafis_hits = await self._openafis_identify(probe_bytes, min_score=min_score)
            if not openafis_hits:
                all_scored = self._minutiae_match(
                    probe_bytes,
                    min_score=0,
                    finger_position=finger_position,
                    identify_mode=identify_mode,
                )
                openafis_hits = self._pick_identify_hits(all_scored, min_score) if identify_mode else [
                    (pid, sc) for pid, sc in all_scored if sc >= min_score
                ]

        matches: list[FingerprintMatch] = []
        for print_id, score_pct in openafis_hits:
            rec = self._records.get(print_id)
            if not rec:
                continue
            if submitted_only and not rec.suspect_id:
                continue
            if exclude_dossier_draft_id and rec.dossier_draft_id == exclude_dossier_draft_id:
                continue
            if exclude_print_id and rec.print_id == exclude_print_id:
                continue
            if finger_position and rec.finger_position != finger_position.upper():
                continue
            similarity = score_pct / 100.0
            matches.append(
                FingerprintMatch(
                    print_id=rec.print_id,
                    template_id=rec.template_id,
                    dossier_draft_id=rec.dossier_draft_id,
                    suspect_id=rec.suspect_id,
                    criminal_name=rec.criminal_name,
                    finger_position=rec.finger_position,
                    similarity_score=similarity,
                )
            )

        matches.sort(key=lambda m: m.similarity_score, reverse=True)

        if apply_margin and matches:
            margin_hits = [
                (m.similarity_score, {"_source": m}) for m in matches
            ]
            kept = apply_match_margin(
                margin_hits,
                min_gap=self._settings.fingerprint_match_min_gap,
                high_confidence=self._settings.fingerprint_match_high_confidence_cosine,
            )
            matches = [hit["_source"] for _, hit in kept]

        top_raw = (
            [
                {
                    "print_id": pid[:8],
                    "finger": self._records[pid].finger_position,
                    "name": self._records[pid].criminal_name,
                    "score": sc / 100.0,
                }
                for pid, sc in (all_scored[:3] if is_iso19794_fmr_template(probe_bytes) else openafis_hits[:3])
                if pid in self._records
            ]
            if is_iso19794_fmr_template(probe_bytes)
            else []
        )
        probe_minutiae = (
            len(parse_fmr_minutiae(probe_bytes))
            if is_iso19794_fmr_template(probe_bytes)
            else None
        )
        logger.info(
            "fingerprint_match_complete",
            gallery_size=len(self._records),
            submitted_gallery=sum(1 for r in self._records.values() if r.suspect_id),
            finger_position=finger_position,
            identify_mode=identify_mode,
            min_score=min_score,
            probe_minutiae=probe_minutiae,
            hit_count=len(matches),
            top_score=matches[0].similarity_score if matches else None,
            top_match_name=matches[0].criminal_name if matches else None,
            top_match_print_id=matches[0].print_id[:8] if matches else None,
            top_candidates=top_raw,
            matcher="minutiae" if is_iso19794_fmr_template(probe_bytes) else "openafis",
        )
        return matches

    async def _find_similar_nbis(
        self,
        *,
        image_bytes: bytes | None,
        image_width: int | None,
        image_height: int | None,
        exclude_dossier_draft_id: str | None,
        exclude_print_id: str | None,
        submitted_only: bool,
        finger_position: str | None,
        identify_mode: bool,
    ) -> list[FingerprintMatch]:
        if not image_bytes or not image_width or not image_height:
            logger.warning("nbis_identify_missing_image")
            return []

        eligible: set[str] | None = None
        if submitted_only or exclude_dossier_draft_id or exclude_print_id or finger_position:
            eligible = set()
            for pid, rec in self._records.items():
                if submitted_only and not rec.suspect_id:
                    continue
                if exclude_dossier_draft_id and rec.dossier_draft_id == exclude_dossier_draft_id:
                    continue
                if exclude_print_id and rec.print_id == exclude_print_id:
                    continue
                if finger_position and rec.finger_position != finger_position.upper():
                    continue
                if rec.has_nbis or _get_nbis().has_gallery_entry(pid):
                    eligible.add(pid)

        try:
            nbis_hits = await _get_nbis().identify(
                image_bytes,
                width=image_width,
                height=image_height,
                eligible_print_ids=eligible,
                top_k=10 if identify_mode else self._settings.fingerprint_search_k,
            )
        except Exception as exc:
            logger.warning("nbis_identify_failed", error=str(exc))
            return []

        score_max = max(self._settings.nbis_score_max, 1)
        matches: list[FingerprintMatch] = []
        for print_id, bozorth in nbis_hits:
            rec = self._records.get(print_id)
            if not rec:
                continue
            similarity = min(1.0, bozorth / float(score_max))
            matches.append(
                FingerprintMatch(
                    print_id=rec.print_id,
                    template_id=rec.template_id,
                    dossier_draft_id=rec.dossier_draft_id,
                    suspect_id=rec.suspect_id,
                    criminal_name=rec.criminal_name,
                    finger_position=rec.finger_position,
                    similarity_score=similarity,
                )
            )

        matches.sort(key=lambda m: m.similarity_score, reverse=True)
        if identify_mode and matches:
            matches = matches[:1]

        logger.info(
            "fingerprint_match_complete",
            gallery_size=len(self._records),
            nbis_gallery=sum(
                1 for r in self._records.values() if r.has_nbis or _get_nbis().has_gallery_entry(r.print_id)
            ),
            finger_position=finger_position,
            identify_mode=identify_mode,
            hit_count=len(matches),
            top_score=matches[0].similarity_score if matches else None,
            top_match_name=matches[0].criminal_name if matches else None,
            matcher="nbis",
        )
        return matches

    def _matcher_command(self, probe_path: Path, min_score: int) -> list[str] | None:
        matcher_bin = (self._settings.openafis_matcher_bin or "").strip()
        if matcher_bin and Path(matcher_bin).is_file():
            return [
                matcher_bin,
                "--probe",
                str(probe_path),
                "--templates",
                str(self._templates_dir),
                "--min-score",
                str(min_score),
            ]
        # Dev: use OpenAFIS container if running (shared templates volume)
        import shutil

        if shutil.which("docker"):
            return [
                "docker",
                "exec",
                "iip-openafis-matcher",
                "iip-openafis-identify",
                "--probe",
                str(probe_path),
                "--templates",
                "/data/templates",
                "--min-score",
                str(min_score),
            ]
        return None

    async def _openafis_identify(
        self,
        template_bytes: bytes,
        *,
        min_score: int,
    ) -> list[tuple[str, int]] | None:
        def _run() -> list[tuple[str, int]] | None:
            with tempfile.TemporaryDirectory(prefix="iip-afis-") as tmp:
                probe = Path(tmp) / "probe.iso"
                probe.write_bytes(template_bytes)
                import subprocess

                cmd = self._matcher_command(probe, min_score)
                if not cmd:
                    return None

                container_probe: str | None = None
                if cmd[0] == "docker":
                    container_probe = f"/tmp/iip-probe-{uuid.uuid4().hex}.iso"
                    cp = subprocess.run(
                        ["docker", "cp", str(probe), f"iip-openafis-matcher:{container_probe}"],
                        capture_output=True,
                        timeout=30,
                        check=False,
                    )
                    if cp.returncode != 0:
                        return None
                    cmd = [
                        "docker",
                        "exec",
                        "iip-openafis-matcher",
                        "iip-openafis-identify",
                        "--probe",
                        container_probe,
                        "--templates",
                        "/data/templates",
                        "--min-score",
                        str(min_score),
                    ]

                try:
                    proc = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=120,
                        check=False,
                    )
                finally:
                    if container_probe:
                        subprocess.run(
                            [
                                "docker",
                                "exec",
                                "iip-openafis-matcher",
                                "rm",
                                "-f",
                                container_probe,
                            ],
                            capture_output=True,
                            timeout=10,
                            check=False,
                        )
                if proc.returncode not in (0, 1):
                    logger.warning(
                        "openafis_identify_failed",
                        code=proc.returncode,
                        stderr=proc.stderr[:500],
                    )
                    return None if cmd[0] == "docker" else []
                try:
                    data = json.loads(proc.stdout.strip() or "{}")
                except json.JSONDecodeError:
                    logger.warning("openafis_identify_bad_json", stdout=proc.stdout[:200])
                    return None
                if data.get("error"):
                    logger.warning(
                        "openafis_identify_error_response",
                        error=str(data.get("error")),
                    )
                    return None
                hits: list[tuple[str, int]] = []
                for row in data.get("matches") or []:
                    pid = str(row.get("id") or "")
                    score = int(row.get("score") or 0)
                    if pid:
                        hits.append((pid, score))
                return hits

        try:
            result = await asyncio.to_thread(_run)
            return result
        except Exception as exc:
            logger.warning("openafis_identify_error", error=str(exc))
            return None

    @staticmethod
    def _pick_identify_hits(
        scored: list[tuple[str, int]],
        min_score: int,
    ) -> list[tuple[str, int]]:
        """Field identify: return the single best same-finger hit above the floor."""
        if not scored:
            return []
        top_pid, top_sc = scored[0]
        floor = min(min_score, 12)
        if top_sc >= floor:
            return [(top_pid, top_sc)]
        return []

    def _minutiae_match(
        self,
        template_bytes: bytes,
        *,
        min_score: int,
        finger_position: str | None,
        identify_mode: bool = False,
    ) -> list[tuple[str, int]]:
        """Fast in-process minutiae 1:N (SecuGen ISO / FMR templates)."""
        query_minutiae = filter_minutiae_for_match(parse_fmr_minutiae(template_bytes))
        if not query_minutiae:
            return []
        finger = finger_position.upper() if finger_position else None
        hits: list[tuple[str, int]] = []
        for print_id, rec in self._records.items():
            if not rec.suspect_id:
                continue
            if finger and rec.finger_position != finger:
                continue
            if not rec.minutiae:
                continue
            gallery_minutiae = (
                filter_minutiae_for_match(rec.minutiae) if identify_mode else rec.minutiae
            )
            if not gallery_minutiae:
                continue
            if identify_mode:
                ratio = match_minutiae_identify(query_minutiae, gallery_minutiae)
            else:
                ratio = match_minutiae_fast(
                    query_minutiae,
                    gallery_minutiae,
                    d_thresh=15.0,
                    a_thresh_deg=25.0,
                )
            hits.append((print_id, int(ratio * 100)))
        hits.sort(key=lambda x: x[1], reverse=True)
        if min_score > 0 and not identify_mode:
            hits = [(pid, sc) for pid, sc in hits if sc >= min_score]
        return hits
