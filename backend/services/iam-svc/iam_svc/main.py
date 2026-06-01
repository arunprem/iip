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
from .routers import mfa as mfa_router
from .routers import mfa_profile as mfa_profile_router
from .routers import mobile as mobile_router
from .routers import mobile_home as mobile_home_router
from .routers import notifications as notifications_router
from .routers import security as security_router
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
from .routers import suspect_dossiers as suspect_dossiers_router

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

    # Run quick suspect captures table startup DDL verification
    from sqlalchemy import text
    from iip_core.db import _engine
    if _engine:
        try:
            async with _engine.begin() as conn:
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS intelligence.quick_suspect_captures (
                        id           UUID PRIMARY KEY,
                        name         VARCHAR(255) NOT NULL,
                        storage_key  VARCHAR(512) NOT NULL,
                        latitude     NUMERIC(10, 7),
                        longitude    NUMERIC(10, 7),
                        captured_by  UUID REFERENCES iam.users(id) ON DELETE SET NULL,
                        captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        used         BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    CREATE INDEX IF NOT EXISTS idx_quick_suspects_captured_by ON intelligence.quick_suspect_captures (captured_by);
                    CREATE INDEX IF NOT EXISTS idx_quick_suspects_used ON intelligence.quick_suspect_captures (used);
                """))
            logger.info("Quick suspect captures database table verified")
        except Exception as exc:
            logger.error("quick_suspect_table_init_failed", error=str(exc))

    from iip_core.object_storage import get_object_storage

    try:
        await get_object_storage().ensure_ready()
        logger.info("object_storage_ready", bucket=settings.s3_bucket)
    except Exception as exc:
        logger.warning("object_storage_init_failed", error=str(exc))

    if settings.keycloak_enabled:
        logger.info(
            "keycloak_configured",
            server_url=settings.keycloak_server_url,
            realm=settings.keycloak_realm,
            client_id=settings.keycloak_client_id,
        )

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
    app.include_router(mfa_router.router, prefix="/api/v1/auth/mfa", tags=["mfa"])
    app.include_router(mfa_profile_router.router, prefix="/api/v1/auth/me/mfa", tags=["mfa-profile"])
    app.include_router(security_router.router, prefix="/api/v1/iam/security", tags=["security"])
    app.include_router(
        notifications_router.router,
        prefix="/api/v1/notifications",
        tags=["notifications"],
    )
    app.include_router(profile_router.router, prefix="/api/v1/auth/me", tags=["profile"])
    app.include_router(users_router.router, prefix="/api/v1/iam/users", tags=["users"])
    app.include_router(roles_router.router, prefix="/api/v1/iam/roles", tags=["roles"])
    app.include_router(jit_router.router, prefix="/api/v1/iam/jit", tags=["jit-elevation"])
    app.include_router(captcha_router.router, prefix="/api/v1/captcha", tags=["captcha"])
    app.include_router(menus_router.router, prefix="/api/v1/iam/menus", tags=["menus"])
    app.include_router(privileges_router.router, prefix="/api/v1/iam/privileges", tags=["privileges"])
    app.include_router(access_router.router, prefix="/api/v1/iam/access", tags=["access"])
    app.include_router(mobile_router.router, prefix="/api/v1/mobile", tags=["mobile"])
    app.include_router(mobile_home_router.router, prefix="/api/v1/mobile", tags=["mobile"])
    app.include_router(offices_router.router, prefix="/api/v1/iam/offices", tags=["offices"])
    app.include_router(
        office_lookups_router.router,
        prefix="/api/v1/iam/office-lookups",
        tags=["office-lookups"],
    )
    app.include_router(unit_types_router.router, prefix="/api/v1/iam/unit-types", tags=["unit-types"])
    app.include_router(ranks_router.router, prefix="/api/v1/iam/ranks", tags=["ranks"])
    app.include_router(
        suspect_dossiers_router.router,
        prefix="/api/v1/intelligence/suspect-dossiers",
        tags=["suspect-dossiers"],
    )

    # ── OpenTelemetry Instrumentation ─────────────────────────────────────────
    FastAPIInstrumentor.instrument_app(app)

    return app


app = create_app()
