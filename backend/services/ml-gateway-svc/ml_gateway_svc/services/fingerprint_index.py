"""Elasticsearch index for suspect fingerprint template embeddings."""

from __future__ import annotations

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

        query_vector = normalize_embedding(template_to_embedding(template_bytes))
        filters: list[dict[str, Any]] = []
        if submitted_only:
            filters.append({"exists": {"field": "suspect_id"}})
        must_not: list[dict[str, Any]] = []
        if exclude_dossier_draft_id:
            must_not.append({"term": {"dossier_draft_id": exclude_dossier_draft_id}})
        if exclude_print_id:
            must_not.append({"term": {"print_id": exclude_print_id}})

        k = search_k if search_k is not None else self._settings.fingerprint_search_k
        knn: dict[str, Any] = {
            "field": "fingerprint_embedding",
            "query_vector": query_vector,
            "k": k,
            "num_candidates": max(40, k * 12),
        }
        if filters or must_not:
            knn["filter"] = {"bool": {"filter": filters, "must_not": must_not}}

        response = await es.search(
            index=self._settings.fingerprint_index_name,
            knn=knn,
            size=k,
            _source=[
                "print_id",
                "template_id",
                "dossier_draft_id",
                "suspect_id",
                "criminal_name",
                "finger_position",
                "fingerprint_embedding",
            ],
        )

        cosine_floor = (
            min_cosine
            if min_cosine is not None
            else self._settings.fingerprint_identify_min_cosine
        )

        ranked: list[tuple[float, dict[str, Any]]] = []
        for hit in response.get("hits", {}).get("hits", []):
            src = hit.get("_source") or {}
            doc_embedding = src.get("fingerprint_embedding")
            if isinstance(doc_embedding, list) and doc_embedding:
                exact = exact_match_score(query_vector, doc_embedding)
            else:
                exact = float(hit.get("_score") or 0.0)
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
