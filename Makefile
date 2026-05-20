.PHONY: setup lint test run build sbom sign e2e docker-up docker-down

# ─── Bootstrap ────────────────────────────────────────────────────────────────
setup:
	uv sync --all-packages
	pnpm install

# ─── Code Quality ─────────────────────────────────────────────────────────────
lint:
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy .
	pnpm --filter "*" lint

format:
	uv run ruff format .
	uv run ruff check --fix .
	pnpm --filter "*" format

# ─── Testing ──────────────────────────────────────────────────────────────────
test:
	uv run pytest -v --tb=short
	pnpm --filter "*" test

test-backend:
	uv run pytest -v --tb=short backend/

test-coverage:
	uv run pytest --cov=backend --cov-report=xml --cov-report=html

# ─── Local Dev ────────────────────────────────────────────────────────────────
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

run: docker-up
	uv run uvicorn backend.gateway.bff.main:app --reload --host 0.0.0.0 --port 8000

run-iam:
	uv run uvicorn backend.services.iam-svc.iam_svc.main:app --reload --port 8010

# ─── Build & Sign ─────────────────────────────────────────────────────────────
build:
	docker build -t iip/iam-svc:latest -f backend/services/iam-svc/Dockerfile .
	docker build -t iip/ml-gateway-svc:latest -f backend/services/ml-gateway-svc/Dockerfile .
	docker build -t iip/bff:latest -f backend/gateway/bff/Dockerfile .

sbom:
	syft dir:. -o spdx-json > sbom.json

sign:
	cosign sign --key cosign.key iip/iam-svc:latest

# ─── E2E ──────────────────────────────────────────────────────────────────────
e2e:
	npx playwright test

# ─── Knowledge Graph ──────────────────────────────────────────────────────────
graphify-update:
	graphify update .
