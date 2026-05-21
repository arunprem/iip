"""
IAM Service — FastAPI Application Entry Point.

Implements the golden service template pattern for all IIP microservices:
  - Application factory pattern with lifespan context manager
  - Structured JSON logging configured at startup
  - OpenTelemetry instrumentation for distributed tracing
  - Prometheus /metrics endpoint
  - Health and readiness probes (/healthz, /readyz)
  - Standard IIP exception handlers
  - Versioned API routers
  - Classification banner middleware
"""

from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from prometheus_client import Counter, Histogram, make_asgi_app

from iip_core.db import close_db, init_db
from iip_core.errors import IIPException, iip_exception_handler
from iip_core.logging import configure_logging, get_logger
from iip_core.settings import BaseServiceSettings

from .routers import auth as auth_router
from .routers import profile as profile_router
from .routers import health as health_router
from .routers import users as users_router
from .routers import roles as roles_router
from .routers import jit as jit_router
from .routers import captcha as captcha_router
from .routers import menus as menus_router
from .routers import privileges as privileges_router
from .routers import access as access_router
from .routers import offices as offices_router
from .routers import ranks as ranks_router
from .routers import unit_types as unit_types_router
from .routers import office_lookups as office_lookups_router

settings = BaseServiceSettings(service_name="iam-svc")
logger = get_logger(__name__)

# ─── Prometheus Metrics ───────────────────────────────────────────────────────

REQUEST_COUNT = Counter(
    "iip_iam_http_requests_total",
    "Total HTTP requests to iam-svc",
    ["method", "path", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "iip_iam_http_request_duration_seconds",
    "HTTP request latency for iam-svc",
    ["method", "path"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)


# ─── Lifespan ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: initialize resources on startup, release on shutdown."""
    # Configure logging
    configure_logging(
        service_name="iam-svc",
        log_level=settings.log_level,
        render_json=settings.environment.value != "local",
    )

    logger.info(
        "iam-svc starting",
        service="iam-svc",
        version=settings.service_version,
        environment=settings.environment,
    )

    # Initialize database connection pool
    init_db(settings)
    logger.info("Database connection pool initialized")

    yield

    # Cleanup
    await close_db()
    logger.info("iam-svc shutdown complete")


# ─── Application Factory ──────────────────────────────────────────────────────


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title="IIP IAM Service",
        description="Identity, Access Management, Role Assignments, and JIT Elevation for IIP",
        version=settings.service_version,
        docs_url="/docs" if settings.environment.value == "local" else None,
        redoc_url="/redoc" if settings.environment.value == "local" else None,
        openapi_url="/openapi.json" if settings.environment.value == "local" else None,
        lifespan=lifespan,
    )

    # ── Middleware ─────────────────────────────────────────────────────────────

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next) -> Response:
        """Inject X-Request-ID header if not present; bind to logging context."""
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    @app.middleware("http")
    async def metrics_middleware(request: Request, call_next) -> Response:
        """Record Prometheus request count and latency metrics."""
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start
        path = request.url.path
        REQUEST_COUNT.labels(request.method, path, response.status_code).inc()
        REQUEST_LATENCY.labels(request.method, path).observe(duration)
        return response

    # CORS — restricted to internal frontend origins only
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins if hasattr(settings, "cors_origins") else ["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Classification-Level", "X-Office-Id"],
    )

    # ── Exception Handlers ────────────────────────────────────────────────────
    app.add_exception_handler(IIPException, iip_exception_handler)  # type: ignore[arg-type]

    # ── Prometheus Metrics Endpoint ───────────────────────────────────────────
    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(health_router.router, tags=["health"])
    app.include_router(auth_router.router, prefix="/api/v1/auth", tags=["authentication"])
    app.include_router(profile_router.router, prefix="/api/v1/auth/me", tags=["profile"])
    app.include_router(users_router.router, prefix="/api/v1/iam/users", tags=["users"])
    app.include_router(roles_router.router, prefix="/api/v1/iam/roles", tags=["roles"])
    app.include_router(jit_router.router, prefix="/api/v1/iam/jit", tags=["jit-elevation"])
    app.include_router(captcha_router.router, prefix="/api/v1/captcha", tags=["captcha"])
    app.include_router(menus_router.router, prefix="/api/v1/iam/menus", tags=["menus"])
    app.include_router(privileges_router.router, prefix="/api/v1/iam/privileges", tags=["privileges"])
    app.include_router(access_router.router, prefix="/api/v1/iam/access", tags=["access"])
    app.include_router(offices_router.router, prefix="/api/v1/iam/offices", tags=["offices"])
    app.include_router(
        office_lookups_router.router,
        prefix="/api/v1/iam/office-lookups",
        tags=["office-lookups"],
    )
    app.include_router(unit_types_router.router, prefix="/api/v1/iam/unit-types", tags=["unit-types"])
    app.include_router(ranks_router.router, prefix="/api/v1/iam/ranks", tags=["ranks"])

    # ── OpenTelemetry Instrumentation ─────────────────────────────────────────
    FastAPIInstrumentor.instrument_app(app)

    return app


app = create_app()
