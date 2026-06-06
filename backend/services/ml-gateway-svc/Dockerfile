FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    libglib2.0-0 \
    libgl1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

FROM base AS deps

COPY pyproject.toml ./
COPY backend/libs/iip-core ./backend/libs/iip-core
COPY backend/libs/iip-audit ./backend/libs/iip-audit
COPY backend/libs/iip-llm ./backend/libs/iip-llm
COPY backend/services/ml-gateway-svc ./backend/services/ml-gateway-svc

RUN uv sync --package ml-gateway-svc --no-dev

FROM base AS production

COPY --from=deps /app /app
COPY --from=deps /usr/local/lib/python3.12 /usr/local/lib/python3.12

ENV HOME=/tmp
ENV UV_CACHE_DIR=/tmp/uv-cache
ENV DEEPFACE_HOME=/tmp/deepface
ENV MPLCONFIGDIR=/tmp/matplotlib

RUN useradd -r -s /bin/false -u 1001 iip \
    && mkdir -p /tmp/uv-cache /tmp/deepface /tmp/matplotlib \
    && chown -R 1001:1001 /tmp/uv-cache /tmp/deepface /tmp/matplotlib /tmp /app

USER iip

EXPOSE 8020

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8020/healthz || exit 1

CMD ["uv", "run", "--directory", "backend/services/ml-gateway-svc", "uvicorn", "ml_gateway_svc.main:app", "--host", "0.0.0.0", "--port", "8020", "--workers", "1"]
