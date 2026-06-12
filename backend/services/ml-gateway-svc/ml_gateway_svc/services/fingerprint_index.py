"""Elasticsearch index for suspect fingerprint template embeddings."""

from __future__ import annotations

import base64
import math
import struct
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from elasticsearch import ApiError, AsyncElasticsearch, NotFoundError

from iip_core.logging import get_logger
from ml_gateway_svc.services.face_similarity import apply_match_margin, exact_match_score
from ml_gateway_svc.services.fingerprint_pipeline import normalize_embedding, template_to_embedding
from ml_gateway_svc.settings import MlGatewaySettings, get_ml_settings

logger = get_logger(__name__)


def parse_fmr_minutiae(data: bytes) -> list[tuple[int, int, int, int, int]]:
    if len(data) < 30:
        return []
    
    num_views = data[22]
    offset = 24
    minutiae = []
    
    for view_idx in range(num_views):
        if offset + 6 > len(data):
            break
        num_minutiae = data[offset+4]
        actual_minutiae_count = (len(data) - 30) // 6
        num_to_read = min(num_minutiae, actual_minutiae_count)
        
        offset += 6
        for m_idx in range(num_to_read):
            if offset + 6 > len(data):
                break
            m_bytes = data[offset : offset + 6]
            
            type_and_x = struct.unpack(">H", m_bytes[0:2])[0]
            m_type = type_and_x >> 14
            x = type_and_x & 0x3FFF
            
            res_and_y = struct.unpack(">H", m_bytes[2:4])[0]
            y = res_and_y & 0x3FFF
            
            angle = m_bytes[4]
            quality = m_bytes[5]
            
            minutiae.append((m_type, x, y, angle, quality))
            offset += 6
            
    return minutiae


def compute_local_descriptors(pts: list[dict[str, float]]) -> list[list[float]]:
    descriptors = []
    n = len(pts)
    for i in range(n):
        p_i = pts[i]
        dists = []
        for j in range(n):
            if i == j:
                continue
            p_j = pts[j]
            dx = p_i['x'] - p_j['x']
            dy = p_i['y'] - p_j['y']
            d = math.sqrt(dx*dx + dy*dy)
            dists.append(d)
        dists.sort()
        if len(dists) >= 3:
            desc = dists[:3]
        elif len(dists) == 2:
            desc = dists + [dists[-1]]
        elif len(dists) == 1:
            desc = dists * 3
        else:
            desc = [0.0, 0.0, 0.0]
        descriptors.append(desc)
    return descriptors


def match_minutiae_fast(
    M_A: list[tuple[int, int, int, int, int]],
    M_B: list[tuple[int, int, int, int, int]],
    d_thresh: float = 15.0,
    a_thresh_deg: float = 25.0,
) -> float:
    if not M_A or not M_B:
        return 0.0
    
    pts_A = []
    for m in M_A:
        m_type, x, y, angle_val, q = m
        angle_rad = angle_val * (2 * math.pi / 256.0)
        pts_A.append({'x': float(x), 'y': float(y), 'theta': angle_rad})
        
    pts_B = []
    for m in M_B:
        m_type, x, y, angle_val, q = m
        angle_rad = angle_val * (2 * math.pi / 256.0)
        pts_B.append({'x': float(x), 'y': float(y), 'theta': angle_rad})
        
    desc_A = compute_local_descriptors(pts_A)
    desc_B = compute_local_descriptors(pts_B)
    
    a_thresh_rad = a_thresh_deg * (math.pi / 180.0)
    best_match_count = 0
    
    potential_pairs = []
    for idx_A, r_A in enumerate(pts_A):
        for idx_B, r_B in enumerate(pts_B):
            diff = sum(abs(da - db) for da, db in zip(desc_A[idx_A], desc_B[idx_B]))
            if diff < 15.0:
                potential_pairs.append((r_A, r_B, diff))
                
    potential_pairs.sort(key=lambda item: item[2])
    
    if not potential_pairs:
        for r_A in pts_A:
            for r_B in pts_B:
                potential_pairs.append((r_A, r_B, 999.0))
                
    for ref_A, ref_B, _ in potential_pairs[:30]:
        tx = ref_A['x'] - ref_B['x']
        ty = ref_A['y'] - ref_B['y']
        d_theta = ref_A['theta'] - ref_B['theta']
        cos_t = math.cos(d_theta)
        sin_t = math.sin(d_theta)
        
        aligned_B = []
        for p in pts_B:
            dx = p['x'] - ref_B['x']
            dy = p['y'] - ref_B['y']
            rx = dx * cos_t - dy * sin_t
            ry = dx * sin_t + dy * cos_t
            aligned_B.append({
                'x': rx + ref_A['x'],
                'y': ry + ref_A['y'],
                'theta': (p['theta'] + d_theta) % (2 * math.pi)
            })
        
        matches = 0
        matched_A = [False] * len(pts_A)
        
        for p_B in aligned_B:
            min_d = float('inf')
            closest_idx = -1
            for idx, p_A in enumerate(pts_A):
                if matched_A[idx]:
                    continue
                dx = p_A['x'] - p_B['x']
                dy = p_A['y'] - p_B['y']
                d = math.sqrt(dx*dx + dy*dy)
                if d < d_thresh:
                    d_ang = abs(p_A['theta'] - p_B['theta'])
                    d_ang = min(d_ang, 2 * math.pi - d_ang)
                    if d_ang < a_thresh_rad:
                        if d < min_d:
                            min_d = d
                            closest_idx = idx
            if closest_idx != -1:
                matched_A[closest_idx] = True
                matches += 1
        
        if matches > best_match_count:
            best_match_count = matches
            
    denom = min(len(pts_A), len(pts_B))
    if denom == 0:
        return 0.0
    return best_match_count / denom


def match_minutiae_greedy(
    M_A: list[tuple[int, int, int, int, int]],
    M_B: list[tuple[int, int, int, int, int]],
    *,
    d_thresh: float = 30.0,
    a_thresh_deg: float = 55.0,
) -> float:
    """Translation-tolerant overlap — better for live SecuGen re-capture."""
    if not M_A or not M_B:
        return 0.0
    a_thresh = a_thresh_deg * (math.pi / 180.0)
    used_b: set[int] = set()
    matched = 0
    for m_type, x_a, y_a, angle_a, _ in M_A:
        theta_a = angle_a * (2 * math.pi / 256.0)
        best_j = -1
        best_d = float("inf")
        for j, (_, x_b, y_b, angle_b, _) in enumerate(M_B):
            if j in used_b:
                continue
            dx = float(x_a - x_b)
            dy = float(y_a - y_b)
            d = math.hypot(dx, dy)
            if d >= d_thresh:
                continue
            theta_b = angle_b * (2 * math.pi / 256.0)
            d_ang = abs(theta_a - theta_b)
            d_ang = min(d_ang, 2 * math.pi - d_ang)
            if d_ang >= a_thresh:
                continue
            if d < best_d:
                best_d = d
                best_j = j
        if best_j >= 0:
            used_b.add(best_j)
            matched += 1
    denom = min(len(M_A), len(M_B))
    return matched / denom if denom else 0.0


def match_minutiae_identify(
    M_A: list[tuple[int, int, int, int, int]],
    M_B: list[tuple[int, int, int, int, int]],
) -> float:
    """Best-of structural + greedy, both directions (live capture is noisy)."""
    scores = [
        match_minutiae_fast(M_A, M_B, d_thresh=28.0, a_thresh_deg=45.0),
        match_minutiae_fast(M_B, M_A, d_thresh=28.0, a_thresh_deg=45.0),
        match_minutiae_greedy(M_A, M_B, d_thresh=32.0, a_thresh_deg=60.0),
        match_minutiae_greedy(M_B, M_A, d_thresh=32.0, a_thresh_deg=60.0),
    ]
    return max(scores)


@dataclass
class FingerprintMatch:
    print_id: str
    template_id: str | None
    dossier_draft_id: str | None
    suspect_id: str | None
    criminal_name: str | None
    finger_position: str
    similarity_score: float


class FingerprintIndexService:
    def __init__(self, settings: MlGatewaySettings | None = None) -> None:
        self._settings = settings or get_ml_settings()
        self._client: AsyncElasticsearch | None = None

    @property
    def enabled(self) -> bool:
        return self._settings.elasticsearch_enabled

    def _client_or_create(self) -> AsyncElasticsearch:
        if self._client is None:
            self._client = AsyncElasticsearch(self._settings.elasticsearch_url)
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    async def ensure_index(self) -> None:
        if not self.enabled:
            return
        es = self._client_or_create()
        index = self._settings.fingerprint_index_name
        try:
            if await es.indices.exists(index=index):
                return
        except ApiError as exc:
            if exc.status_code not in (400, 404):
                raise

        dims = self._settings.fingerprint_embedding_dims
        body = {
            "settings": {"number_of_shards": 1, "number_of_replicas": 0},
            "mappings": {
                "properties": {
                    "print_id": {"type": "keyword"},
                    "template_id": {"type": "keyword"},
                    "dossier_draft_id": {"type": "keyword"},
                    "suspect_id": {"type": "keyword"},
                    "criminal_name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                    "finger_position": {"type": "keyword"},
                    "template_format": {"type": "keyword"},
                    "template_hash": {"type": "keyword"},
                    "quality_score": {"type": "float"},
                    "device_model": {"type": "keyword"},
                    "created_by": {"type": "keyword"},
                    "created_at": {"type": "date"},
                    "template_data_b64": {"type": "keyword", "index": False},
                    "fingerprint_embedding": {
                        "type": "dense_vector",
                        "dims": dims,
                        "index": True,
                        "similarity": "cosine",
                    },
                }
            },
        }
        try:
            await es.indices.create(index=index, body=body)
            logger.info("fingerprint_index_created", index=index, dims=dims)
        except ApiError as exc:
            if exc.status_code == 400 and "resource_already_exists_exception" in str(exc.body).lower():
                return
            raise

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
    ) -> None:
        if not self.enabled:
            return
        await self.ensure_index()
        es = self._client_or_create()
        embedding = normalize_embedding(template_to_embedding(template_bytes))
        doc = {
            "print_id": print_id,
            "template_id": template_id,
            "dossier_draft_id": dossier_draft_id,
            "suspect_id": suspect_id,
            "criminal_name": criminal_name,
            "finger_position": finger_position.upper(),
            "template_format": template_format.upper(),
            "template_hash": template_hash,
            "quality_score": quality_score,
            "device_model": device_model,
            "created_by": created_by,
            "created_at": datetime.now(UTC).isoformat(),
            "template_data_b64": base64.b64encode(template_bytes).decode("utf-8"),
            "fingerprint_embedding": embedding,
        }
        await es.index(
            index=self._settings.fingerprint_index_name,
            id=print_id,
            document=doc,
            refresh=True,
        )

    async def delete_print(self, print_id: str) -> None:
        if not self.enabled:
            return
        es = self._client_or_create()
        try:
            await es.delete(index=self._settings.fingerprint_index_name, id=print_id, refresh=True)
        except NotFoundError:
            pass

    async def delete_draft_prints(self, dossier_draft_id: str) -> None:
        if not self.enabled:
            return
        es = self._client_or_create()
        await es.delete_by_query(
            index=self._settings.fingerprint_index_name,
            body={"query": {"term": {"dossier_draft_id": dossier_draft_id}}},
            refresh=True,
        )

    async def find_similar(
        self,
        template_bytes: bytes,
        *,
        exclude_dossier_draft_id: str | None = None,
        exclude_print_id: str | None = None,
        submitted_only: bool = True,
        search_k: int | None = None,
        min_cosine: float | None = None,
        apply_margin: bool = True,
        finger_position: str | None = None,
    ) -> list[FingerprintMatch]:
        if not self.enabled:
            return []

        await self.ensure_index()
        es = self._client_or_create()
        try:
            if not await es.indices.exists(index=self._settings.fingerprint_index_name):
                return []
        except ApiError:
            return []

        filters: list[dict[str, Any]] = []
        if submitted_only:
            filters.append({"exists": {"field": "suspect_id"}})
        if finger_position:
            filters.append({"term": {"finger_position": finger_position.upper()}})

        must_not: list[dict[str, Any]] = []
        if exclude_dossier_draft_id:
            must_not.append({"term": {"dossier_draft_id": exclude_dossier_draft_id}})
        if exclude_print_id:
            must_not.append({"term": {"print_id": exclude_print_id}})

        query = {
            "bool": {
                "filter": filters,
                "must_not": must_not
            }
        }

        response = await es.search(
            index=self._settings.fingerprint_index_name,
            query=query,
            size=1000,
            _source=[
                "print_id",
                "template_id",
                "dossier_draft_id",
                "suspect_id",
                "criminal_name",
                "finger_position",
                "template_data_b64",
            ],
        )

        cosine_floor = (
            min_cosine
            if min_cosine is not None
            else self._settings.fingerprint_identify_min_cosine
        )

        query_minutiae = parse_fmr_minutiae(template_bytes)

        ranked: list[tuple[float, dict[str, Any]]] = []
        for hit in response.get("hits", {}).get("hits", []):
            src = hit.get("_source") or {}
            cand_b64 = src.get("template_data_b64")
            
            if not cand_b64:
                logger.warning("fingerprint_candidate_missing_template_data", print_id=src.get("print_id"))
                exact = 0.0
            else:
                try:
                    cand_bytes = base64.b64decode(cand_b64)
                    cand_minutiae = parse_fmr_minutiae(cand_bytes)
                    exact = match_minutiae_fast(query_minutiae, cand_minutiae)
                except Exception as exc:
                    logger.error("fingerprint_match_error", error=str(exc))
                    exact = 0.0

            logger.info("fingerprint_similarity_candidate",
                        criminal_name=src.get("criminal_name"),
                        finger_position=src.get("finger_position"),
                        score=exact,
                        threshold=cosine_floor)
            if exact < cosine_floor:
                continue
            ranked.append((exact, src))

        ranked.sort(key=lambda item: item[0], reverse=True)
        if apply_margin:
            margin_hits = [(score, {"_source": src}) for score, src in ranked]
            kept = apply_match_margin(
                margin_hits,
                min_gap=self._settings.fingerprint_match_min_gap,
                high_confidence=self._settings.fingerprint_match_high_confidence_cosine,
            )
            ranked = [(score, hit["_source"]) for score, hit in kept]

        matches: list[FingerprintMatch] = []
        for exact, src in ranked:
            matches.append(
                FingerprintMatch(
                    print_id=str(src.get("print_id") or ""),
                    template_id=src.get("template_id"),
                    dossier_draft_id=src.get("dossier_draft_id"),
                    suspect_id=src.get("suspect_id"),
                    criminal_name=src.get("criminal_name"),
                    finger_position=str(src.get("finger_position") or "RIGHT_THUMB"),
                    similarity_score=exact,
                )
            )
        return matches


def new_print_id() -> str:
    return str(uuid.uuid4())
