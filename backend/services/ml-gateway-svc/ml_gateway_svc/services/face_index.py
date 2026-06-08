"""
Elasticsearch index for suspect face embeddings (FRS).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from elasticsearch import ApiError, AsyncElasticsearch, NotFoundError

from iip_core.logging import get_logger
from ml_gateway_svc.services.face_pipeline import normalize_embedding
from ml_gateway_svc.services.face_similarity import apply_match_margin, exact_match_score
from ml_gateway_svc.settings import MlGatewaySettings, get_ml_settings

logger = get_logger(__name__)


@dataclass
class FaceDuplicateMatch:
    face_id: str
    photo_id: str | None
    dossier_draft_id: str | None
    suspect_id: str | None
    criminal_name: str | None
    storage_key: str | None
    pose_type: str
    score: float


class FaceIndexService:
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
        index = self._settings.face_index_name
        try:
            if await es.indices.exists(index=index):
                return
        except ApiError as exc:
            # Some ES versions return 400 on HEAD for missing indices — fall through to create.
            if exc.status_code not in (400, 404):
                raise

        dims = self._settings.face_embedding_dims
        body = {
            "settings": {"number_of_shards": 1, "number_of_replicas": 0},
            "mappings": {
                "properties": {
                    "face_id": {"type": "keyword"},
                    "photo_id": {"type": "keyword"},
                    "dossier_draft_id": {"type": "keyword"},
                    "suspect_id": {"type": "keyword"},
                    "criminal_name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                    "pose_type": {"type": "keyword"},
                    "detected_pose": {"type": "keyword"},
                    "storage_key": {"type": "keyword"},
                    "created_by": {"type": "keyword"},
                    "created_at": {"type": "date"},
                    "face_embedding": {
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
            logger.info("face_index_created", index=index, dims=dims)
        except ApiError as exc:
            if exc.status_code == 400 and "resource_already_exists_exception" in str(exc.body).lower():
                return
            raise

    async def index_face(
        self,
        *,
        face_id: str,
        photo_id: str,
        dossier_draft_id: str,
        pose_type: str,
        detected_pose: str,
        embedding: list[float],
        storage_key: str,
        created_by: str,
        suspect_id: str | None = None,
        criminal_name: str | None = None,
    ) -> None:
        if not self.enabled:
            return
        await self.ensure_index()
        es = self._client_or_create()
        doc = {
            "face_id": face_id,
            "photo_id": photo_id,
            "dossier_draft_id": dossier_draft_id,
            "suspect_id": suspect_id,
            "criminal_name": criminal_name,
            "pose_type": pose_type,
            "detected_pose": detected_pose,
            "storage_key": storage_key,
            "created_by": created_by,
            "created_at": datetime.now(UTC).isoformat(),
            "face_embedding": normalize_embedding(embedding),
        }
        await es.index(index=self._settings.face_index_name, id=face_id, document=doc)

    async def delete_suspect_faces_except(self, suspect_id: str, keep_face_id: str) -> None:
        """Remove stale FRS vectors when a suspect's front photo is replaced."""
        if not self.enabled:
            return
        es = self._client_or_create()
        await es.delete_by_query(
            index=self._settings.face_index_name,
            body={
                "query": {
                    "bool": {
                        "filter": [{"term": {"suspect_id": suspect_id}}],
                        "must_not": [{"term": {"face_id": keep_face_id}}],
                    }
                }
            },
            refresh=True,
        )

    async def delete_face(self, face_id: str) -> None:
        if not self.enabled:
            return
        es = self._client_or_create()
        try:
            await es.delete(index=self._settings.face_index_name, id=face_id)
        except NotFoundError:
            pass

    async def delete_draft_faces(self, dossier_draft_id: str) -> None:
        if not self.enabled:
            return
        es = self._client_or_create()
        await es.delete_by_query(
            index=self._settings.face_index_name,
            body={"query": {"term": {"dossier_draft_id": dossier_draft_id}}},
            refresh=True,
        )

    async def find_similar_front_faces(
        self,
        embedding: list[float],
        *,
        exclude_dossier_draft_id: str | None,
        exclude_face_id: str | None = None,
        search_k: int | None = None,
        min_score: float | None = None,
        min_cosine: float | None = None,
        apply_margin: bool = True,
    ) -> list[FaceDuplicateMatch]:
        if not self.enabled:
            return []

        await self.ensure_index()
        es = self._client_or_create()
        try:
            if not await es.indices.exists(index=self._settings.face_index_name):
                return []
        except ApiError:
            return []

        query_vector = normalize_embedding(embedding)
        cosine_floor = (
            min_cosine
            if min_cosine is not None
            else (
                min_score
                if min_score is not None and min_score <= 1.0
                else self._settings.face_identify_min_cosine
            )
        )

        try:
            return await self._search_similar(
                es,
                query_vector,
                exclude_dossier_draft_id,
                exclude_face_id,
                search_k=search_k,
                min_score=min_score,
                min_cosine=cosine_floor,
                apply_margin=apply_margin,
            )
        except ApiError as exc:
            logger.warning("face_similar_search_failed", error=str(exc))
            return []

    async def _search_similar(
        self,
        es: AsyncElasticsearch,
        embedding: list[float],
        exclude_dossier_draft_id: str | None,
        exclude_face_id: str | None,
        *,
        search_k: int | None = None,
        min_score: float | None = None,
        min_cosine: float | None = None,
        apply_margin: bool = True,
    ) -> list[FaceDuplicateMatch]:
        # Only compare against submitted dossiers (suspect_id set). Draft uploads are not in the FRS index.
        filters: list[dict[str, Any]] = [
            {"term": {"pose_type": "FRONT"}},
            {"exists": {"field": "suspect_id"}},
        ]
        must_not: list[dict[str, Any]] = []
        if exclude_dossier_draft_id:
            must_not.append({"term": {"dossier_draft_id": exclude_dossier_draft_id}})
        if exclude_face_id:
            must_not.append({"term": {"face_id": exclude_face_id}})

        k = search_k if search_k is not None else self._settings.face_duplicate_search_k
        knn: dict[str, Any] = {
            "field": "face_embedding",
            "query_vector": embedding,
            "k": k,
            "num_candidates": max(40, k * 12),
        }
        if filters or must_not:
            knn["filter"] = {"bool": {"filter": filters, "must_not": must_not}}

        response = await es.search(
            index=self._settings.face_index_name,
            knn=knn,
            size=k,
            _source=[
                "face_id",
                "photo_id",
                "dossier_draft_id",
                "suspect_id",
                "criminal_name",
                "storage_key",
                "pose_type",
                "face_embedding",
            ],
        )

        cosine_floor = min_cosine if min_cosine is not None else self._settings.face_identify_min_cosine
        es_score_floor = min_score if min_score is not None else self._settings.face_match_min_score

        ranked: list[tuple[float, dict[str, Any], dict[str, Any]]] = []
        for hit in response.get("hits", {}).get("hits", []):
            es_score = float(hit.get("_score") or 0.0)
            if es_score < es_score_floor:
                continue
            src = hit.get("_source") or {}
            doc_embedding = src.get("face_embedding")
            if isinstance(doc_embedding, list) and doc_embedding:
                exact = exact_match_score(embedding, doc_embedding)
            else:
                exact = es_score
            if exact < cosine_floor:
                continue
            ranked.append((exact, hit, src))

        ranked.sort(key=lambda item: item[0], reverse=True)

        if apply_margin:
            kept = apply_match_margin(
                ranked,
                min_gap=self._settings.face_match_min_gap,
                high_confidence=self._settings.face_match_high_confidence_cosine,
            )
        else:
            kept = ranked

        matches: list[FaceDuplicateMatch] = []
        for exact, hit, src in kept:
            matches.append(
                FaceDuplicateMatch(
                    face_id=str(src.get("face_id") or hit.get("_id")),
                    photo_id=src.get("photo_id"),
                    dossier_draft_id=src.get("dossier_draft_id"),
                    suspect_id=src.get("suspect_id"),
                    criminal_name=src.get("criminal_name"),
                    storage_key=src.get("storage_key"),
                    pose_type=str(src.get("pose_type") or "FRONT"),
                    score=exact,
                )
            )
        return matches

    async def safe_index_face(self, **kwargs: object) -> bool:
        """Index face; return False instead of raising when Elasticsearch is unavailable."""
        try:
            await self.index_face(**kwargs)  # type: ignore[arg-type]
            return True
        except ApiError as exc:
            logger.warning("face_index_failed", error=str(exc))
            return False
        except Exception as exc:
            logger.warning("face_index_failed", error=str(exc))
            return False


def new_face_id() -> str:
    return str(uuid.uuid4())
