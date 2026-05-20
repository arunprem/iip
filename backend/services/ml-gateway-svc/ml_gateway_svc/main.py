"""
ML Gateway Service — Main Application.

Orchestrates:
  - RAG pipeline: Elasticsearch dense-vector retrieval + Neo4j graph context + Llama 3.1 synthesis
  - Streaming chat completions via SSE
  - Prompt audit logging for every invocation
  - Classification enforcement on retrieved documents
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from prometheus_client import make_asgi_app

from iip_core.db import close_db, init_db
from iip_core.errors import IIPException, iip_exception_handler
from iip_core.logging import configure_logging, get_logger
from iip_core.settings import BaseServiceSettings

from .routers import chat as chat_router
from .routers import health as health_router
from .routers import rag as rag_router

settings = BaseServiceSettings(service_name="ml-gateway-svc")
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
    yield
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
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    app.add_exception_handler(IIPException, iip_exception_handler)  # type: ignore[arg-type]

    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)

    app.include_router(health_router.router, tags=["health"])
    app.include_router(chat_router.router, prefix="/api/v1/ml/chat", tags=["chat"])
    app.include_router(rag_router.router, prefix="/api/v1/ml/rag", tags=["rag"])

    FastAPIInstrumentor.instrument_app(app)

    return app


app = create_app()
