from __future__ import annotations

from functools import lru_cache

from sentence_transformers import SentenceTransformer

from ml_gateway_svc.settings import get_ml_settings


@lru_cache(maxsize=1)
def get_text_embedder() -> SentenceTransformer:
    settings = get_ml_settings()
    return SentenceTransformer(settings.humint_text_embedding_model)


def embed_text(text: str) -> list[float]:
    model = get_text_embedder()
    vector = model.encode(text or "", normalize_embeddings=True)
    return [float(v) for v in vector.tolist()]
