from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from elasticsearch import ApiError, AsyncElasticsearch

from iip_core.logging import get_logger
from ml_gateway_svc.services.text_embedding import embed_text
from ml_gateway_svc.settings import MlGatewaySettings, get_ml_settings

logger = get_logger(__name__)


class HumintIndexService:
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
        index = self._settings.humint_index_name
        try:
            if await es.indices.exists(index=index):
                return
        except ApiError as exc:
            if exc.status_code not in (400, 404):
                raise
        dims = len(embed_text("humint"))
        body = {
            "settings": {"number_of_shards": 1, "number_of_replicas": 0},
            "mappings": {
                "properties": {
                    "report_id": {"type": "keyword"},
                    "office_id": {"type": "keyword"},
                    "supervisor_cross_unit_visible": {"type": "boolean"},
                    "title": {"type": "text"},
                    "report_type": {"type": "keyword"},
                    "status": {"type": "keyword"},
                    "urgency": {"type": "keyword"},
                    "location_text": {"type": "text"},
                    "linked_case_ref": {"type": "keyword"},
                    "linked_hotspot_label": {"type": "text"},
                    "search_text": {"type": "text"},
                    "created_at": {"type": "date"},
                    "embedding": {"type": "dense_vector", "dims": dims, "index": True, "similarity": "cosine"},
                }
            },
        }
        try:
            await es.indices.create(index=index, body=body)
        except ApiError as exc:
            if exc.status_code == 400 and "resource_already_exists_exception" in str(exc.body).lower():
                return
            raise

    async def index_report(self, document: dict[str, Any]) -> None:
        if not self.enabled:
            return
        await self.ensure_index()
        es = self._client_or_create()
        search_text = str(document.get("search_text") or "").strip()
        payload = {
            **document,
            "created_at": document.get("created_at") or datetime.now(UTC).isoformat(),
            "embedding": embed_text(search_text),
        }
        await es.index(index=self._settings.humint_index_name, id=str(document["report_id"]), document=payload, refresh=True)

    async def search_reports(
        self,
        *,
        query: str,
        office_id: str,
        allow_cross_unit: bool,
        size: int = 10,
    ) -> list[dict[str, Any]]:
        if not self.enabled or not query.strip():
            return []
        await self.ensure_index()
        es = self._client_or_create()
        vector = embed_text(query)
        access_filter: dict[str, Any]
        if allow_cross_unit:
            access_filter = {
                "bool": {
                    "should": [
                        {"term": {"office_id": office_id}},
                        {"term": {"supervisor_cross_unit_visible": True}},
                    ],
                    "minimum_should_match": 1,
                }
            }
        else:
            access_filter = {"term": {"office_id": office_id}}

        res = await es.search(
            index=self._settings.humint_index_name,
            size=size,
            knn={
                "field": "embedding",
                "query_vector": vector,
                "k": size,
                "num_candidates": max(size * 5, 20),
                "filter": access_filter,
            },
        )
        hits: list[dict[str, Any]] = []
        for hit in res.get("hits", {}).get("hits", []):
            src = hit.get("_source") or {}
            hits.append(
                {
                    "report_id": src.get("report_id"),
                    "title": src.get("title"),
                    "report_type": src.get("report_type"),
                    "status": src.get("status"),
                    "urgency": src.get("urgency"),
                    "location_text": src.get("location_text"),
                    "linked_case_ref": src.get("linked_case_ref"),
                    "linked_hotspot_label": src.get("linked_hotspot_label"),
                    "score": float(hit.get("_score") or 0.0),
                    "search_text": src.get("search_text") or "",
                }
            )
        return hits
