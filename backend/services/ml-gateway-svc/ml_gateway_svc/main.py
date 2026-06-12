"""
ML Gateway Service — Main Application.

Orchestrates:
  - RAG pipeline: Elasticsearch dense-vector retrieval + Neo4j graph context + Llama 3.1 synthesis
  - Streaming chat completions via SSE
  - Prompt audit logging for every invocation
  - Classification enforcement on retrieved documents
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from prometheus_client import make_asgi_app

from iip_core.db import close_db, init_db
from iip_core.errors import IIPException, iip_exception_handler
from iip_core.logging import configure_logging, get_logger
from .routers import chat as chat_router
from .routers import faces as faces_router
from .routers import fingerprints as fingerprints_router
from .routers import health as health_router
from .routers import rag as rag_router
from .services.face_index import FaceIndexService
from .services.fingerprint_bootstrap import bootstrap_fingerprints_from_db
from .services.fingerprint_store import get_fingerprint_store
from .services.face_pipeline import warmup_face_models
from .settings import get_ml_settings

settings = get_ml_settings()
_face_index = FaceIndexService()
_fingerprint_index = get_fingerprint_store()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging(
        service_name="ml-gateway-svc",
        log_level=settings.log_level,
        render_json=settings.environment.value != "local",
    )
    logger.info("ml-gateway-svc starting", llm_endpoint="http://standalone-llm.runai-team-arun.keralapolice.gov.in")
    init_db(settings)
    try:
        await _face_index.ensure_index()
        await _fingerprint_index.ensure_index()
        if settings.fingerprint_backend == "openafis":
            await bootstrap_fingerprints_from_db(_fingerprint_index)
    except Exception as exc:
        logger.warning("biometric_index_bootstrap_failed", error=str(exc))

    warmup_task: asyncio.Task[None] | None = None

    if settings.face_warmup_on_startup:

        async def _run_warmup() -> None:
            logger.info("face_models_warmup_starting")
            try:
                await asyncio.to_thread(
                    warmup_face_models,
                    model_name=settings.face_model_name,
                    detector_backend=settings.face_detector_backend,
                )
                logger.info("face_models_warmup_complete")
            except Exception as exc:
                logger.warning("face_models_warmup_startup_failed", error=str(exc))

        warmup_task = asyncio.create_task(_run_warmup())

    yield

    if warmup_task is not None and not warmup_task.done():
        warmup_task.cancel()
        try:
            await warmup_task
        except asyncio.CancelledError:
            pass
    await _face_index.close()
    await _fingerprint_index.close()
    await close_db()
    logger.info("ml-gateway-svc shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title="IIP ML Gateway Service",
        description="RAG orchestration and Llama 3.1 chat gateway for the IIP Analyst Workbench",
        version=settings.service_version,
        docs_url="/docs" if settings.environment.value == "local" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    app.add_exception_handler(IIPException, iip_exception_handler)  # type: ignore[arg-type]

    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)

    app.include_router(health_router.router, tags=["health"])
    app.include_router(chat_router.router, prefix="/api/v1/ml/chat", tags=["chat"])
    app.include_router(rag_router.router, prefix="/api/v1/ml/rag", tags=["rag"])
    app.include_router(faces_router.router, prefix="/api/v1/ml/faces", tags=["faces"])
    app.include_router(
        fingerprints_router.router, prefix="/api/v1/ml/fingerprints", tags=["fingerprints"]
    )

    FastAPIInstrumentor.instrument_app(app)

    return app


app = create_app()
