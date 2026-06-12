"""Unified fingerprint index — routes to OpenAFIS or legacy Elasticsearch."""

from __future__ import annotations

from functools import lru_cache

from ml_gateway_svc.services.fingerprint_afis_store import FingerprintAfisStore
from ml_gateway_svc.services.fingerprint_index import FingerprintIndexService, FingerprintMatch
from ml_gateway_svc.settings import MlGatewaySettings, get_ml_settings


@lru_cache(maxsize=1)
def get_fingerprint_store() -> "FingerprintStore":
    """Process-wide singleton — bootstrap and /fingerprints routes must share one store."""
    return FingerprintStore()


class FingerprintStore:
    """Facade: OpenAFIS (default) or Elasticsearch (legacy faces-only stack)."""

    def __init__(self, settings: MlGatewaySettings | None = None) -> None:
        self._settings = settings or get_ml_settings()
        self._openafis = FingerprintAfisStore(self._settings)
        self._elasticsearch = FingerprintIndexService(self._settings)

    @property
    def enabled(self) -> bool:
        if self._settings.fingerprint_backend == "openafis":
            return True
        return self._elasticsearch.enabled

    def _backend(self):
        if self._settings.fingerprint_backend == "openafis":
            return self._openafis
        return self._elasticsearch

    async def close(self) -> None:
        await self._elasticsearch.close()
        await self._openafis.close()

    async def ensure_index(self) -> None:
        await self._backend().ensure_index()

    async def index_print(self, **kwargs) -> None:
        backend = self._backend()
        await backend.index_print(**kwargs)

    async def delete_print(self, print_id: str) -> None:
        await self._backend().delete_print(print_id)

    async def delete_draft_prints(self, dossier_draft_id: str) -> None:
        await self._backend().delete_draft_prints(dossier_draft_id)

    async def ensure_gallery_loaded(self) -> int:
        backend = self._backend()
        if hasattr(backend, "ensure_gallery_loaded"):
            return await backend.ensure_gallery_loaded()
        return 0

    async def find_similar(
        self,
        template_bytes: bytes,
        **kwargs,
    ) -> list[FingerprintMatch]:
        return await self._backend().find_similar(template_bytes, **kwargs)
