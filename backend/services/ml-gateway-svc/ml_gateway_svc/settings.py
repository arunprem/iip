"""ML Gateway service settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field

from iip_core.settings import BaseServiceSettings


class MlGatewaySettings(BaseServiceSettings):
    service_name: str = "ml-gateway-svc"

    elasticsearch_url: str = Field(
        default="http://localhost:9200",
        description="Elasticsearch cluster URL for face vectors and RAG indices",
    )
    elasticsearch_enabled: bool = Field(
        default=True,
        description="When false, face indexing and duplicate search are skipped",
    )

    face_index_name: str = Field(default="iip-suspect-faces")
    face_embedding_dims: int = Field(default=512, description="Facenet512 output size")
    face_model_name: str = Field(default="Facenet512")
    face_detector_backend: str = Field(default="retinaface")
    face_match_min_score: float = Field(
        default=0.72,
        description="Legacy Elasticsearch kNN pre-filter (exact cosine applied after retrieval)",
    )
    face_identify_min_cosine: float = Field(
        default=0.72,
        description="Minimum exact cosine for field / workbench 1:N identification",
    )
    face_duplicate_min_cosine: float = Field(
        default=0.68,
        description="Minimum exact cosine to flag a duplicate during dossier photo upload",
    )
    face_match_min_gap: float = Field(
        default=0.045,
        description="Top match must beat the runner-up by at least this cosine margin",
    )
    face_match_high_confidence_cosine: float = Field(
        default=0.78,
        description="Skip margin check when the top cosine is at or above this value",
    )
    face_duplicate_search_k: int = Field(default=8)
    face_max_upload_bytes: int = Field(default=8 * 1024 * 1024)
    face_analysis_timeout_seconds: int = Field(
        default=300,
        description="Max seconds per photo analysis (models should be pre-warmed at startup)",
    )
    face_warmup_on_startup: bool = Field(
        default=True,
        description="Load DeepFace/RetinaFace weights when ml-gateway starts (one-time per process)",
    )
    face_live_max_side: int = Field(
        default=1024,
        description="Longest image side for live FRS detection (smaller = faster)",
    )
    face_live_max_faces: int = Field(default=4, description="Max faces per live scan frame")
    face_live_search_k: int = Field(default=3, description="kNN hits per face for live FRS")
    face_live_identify_min_cosine: float = Field(
        default=0.70,
        description="Minimum exact cosine for live multi-face camera matching",
    )
    suspect_photos_prefix: str = Field(default="suspect-photos")


@lru_cache(maxsize=1)
def get_ml_settings() -> MlGatewaySettings:
    return MlGatewaySettings()
