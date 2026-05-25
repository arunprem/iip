"""
IIP Core — Pydantic Settings for all services.

Each service overrides only the fields it needs. Load from environment and .env files.
Secrets are fetched from Vault at runtime (not stored in env).
"""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from typing import Annotated

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    """Deployment environment identifiers."""

    LOCAL = "local"
    STAGING = "staging"
    PRODUCTION = "production"


class ClassificationLevel(StrEnum):
    """Permitted classification markings for IIP data objects."""

    UNCLASSIFIED = "UNCLASSIFIED"
    RESTRICTED = "RESTRICTED"
    CONFIDENTIAL = "CONFIDENTIAL"
    SECRET = "SECRET"
    TOP_SECRET = "TOP SECRET"


class BaseServiceSettings(BaseSettings):
    """Base configuration shared across every IIP microservice."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Service Identity ────────────────────────────────────────────────────
    service_name: str = "iip-service"
    service_version: str = "0.1.0"
    environment: Environment = Environment.LOCAL

    # ── Database ────────────────────────────────────────────────────────────
    database_url: PostgresDsn = Field(
        default="postgresql+asyncpg://iip_user:iip_secret_password@localhost:5432/iip_db",
        description="Async PostgreSQL DSN for SQLAlchemy",
    )
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_pre_ping: bool = True

    # ── Redis ────────────────────────────────────────────────────────────────
    redis_url: RedisDsn = Field(
        default="redis://:iip_redis_password@localhost:6379/0",
        description="Redis DSN for session and token caching",
    )

    # ── Kafka ────────────────────────────────────────────────────────────────
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_audit_topic: str = "iip.audit.events"
    kafka_alert_topic: str = "iip.alert.events"

    # ── Keycloak (OIDC) ───────────────────────────────────────────────────────
    keycloak_enabled: bool = Field(
        default=True,
        description="When true, APIs validate Keycloak RS256 tokens; login uses Keycloak password grant",
    )
    keycloak_server_url: str = Field(
        default="http://localhost:8081",
        description="Keycloak base URL (no trailing slash; host port 8081 in docker-compose)",
    )
    keycloak_realm: str = "iip"
    keycloak_client_id: str = "iip-backend"
    keycloak_client_secret: str = Field(
        default="iip-backend-secret-dev-only",
        description="Confidential client secret for token and admin API calls",
    )
    keycloak_admin_username: str = Field(
        default="admin",
        description="Master-realm admin user for Keycloak Admin REST API (dev)",
    )
    keycloak_admin_password: str = Field(
        default="admin",
        description="Master-realm admin password (dev only)",
    )

    # ── Auth & JWT (legacy / tests when keycloak_enabled=false) ───────────────
    jwt_secret_key: str = Field(
        default="CHANGE_ME_IN_PRODUCTION_USE_VAULT",
        description="HMAC-SHA256 JWT signing key — used only when keycloak_enabled=false",
    )
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 1

    # ── OPA Policy Engine ─────────────────────────────────────────────────────
    opa_base_url: str = "http://localhost:8181"
    opa_policy_package: str = "iip"

    # ── HashiCorp Vault ───────────────────────────────────────────────────────
    vault_addr: str = "http://localhost:8200"
    vault_token: str = "iip-vault-root-token"

    # ── Object storage (MinIO / S3) ───────────────────────────────────────────
    s3_endpoint_url: str | None = Field(
        default="http://localhost:9000",
        description="S3-compatible endpoint (MinIO in local dev)",
    )
    s3_access_key: str = Field(default="iip_minio_user")
    s3_secret_key: str = Field(default="iip_minio_password")
    s3_bucket: str = Field(default="iip-uploads", description="Primary uploads bucket")
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False

    # ── Observability ──────────────────────────────────────────────────────────
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # ── Classification ────────────────────────────────────────────────────────
    system_classification_level: ClassificationLevel = ClassificationLevel.CONFIDENTIAL


class GatewaySettings(BaseServiceSettings):
    """Additional settings specific to the BFF Gateway."""

    service_name: str = "iip-bff"
    bff_port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache(maxsize=1)
def get_settings() -> BaseServiceSettings:
    """Singleton settings accessor. Override in tests with dependency injection."""
    return BaseServiceSettings()
