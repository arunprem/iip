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

    # ── Auth & JWT ───────────────────────────────────────────────────────────
    jwt_secret_key: str = Field(
        default="CHANGE_ME_IN_PRODUCTION_USE_VAULT",
        description="HMAC-SHA256 JWT signing key — override via Vault in production",
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
