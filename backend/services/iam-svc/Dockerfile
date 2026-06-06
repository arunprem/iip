FROM python:3.12-slim AS base

# ─── System Dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# ─── Dependencies Layer ────────────────────────────────────────────────────────
FROM base AS deps

COPY pyproject.toml ./
COPY backend/libs/iip-core ./backend/libs/iip-core
COPY backend/libs/iip-audit ./backend/libs/iip-audit
COPY backend/services/iam-svc ./backend/services/iam-svc

RUN uv sync --package iam-svc --no-dev

# ─── Production Image ─────────────────────────────────────────────────────────
FROM base AS production

COPY --from=deps /app /app
COPY --from=deps /usr/local/lib/python3.12 /usr/local/lib/python3.12

# uv needs a writable cache when running as non-root
ENV HOME=/tmp
ENV UV_CACHE_DIR=/tmp/uv-cache

# Non-root user for security
RUN useradd -r -s /bin/false -u 1001 iip \
    && mkdir -p /tmp/uv-cache \
    && chown -R 1001:1001 /tmp/uv-cache /tmp /app

USER iip

EXPOSE 8010

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8010/healthz || exit 1

CMD ["uv", "run", "--directory", "backend/services/iam-svc", "uvicorn", "iam_svc.main:app", "--host", "0.0.0.0", "--port", "8010", "--workers", "2"]