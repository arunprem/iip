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

# IAM with reload limited to app code (avoids .venv / node_modules reload storms)
iam-svc-dev:
	cd backend/services/iam-svc && uv run uvicorn iam_svc.main:app \
		--host 0.0.0.0 --port 8010 --reload \
		--reload-dir iam_svc \
		--reload-dir ../../libs/iip-core/iip_core

# Flutter mobile app (requires Flutter SDK). Android emulator: use 10.0.2.2 for localhost.
mobile-bootstrap:
	cd mobile/iip_app && flutter create . --project-name iip_app --org gov.in.iip

mobile-dev:
	cd mobile/iip_app && flutter pub get && flutter run \
		--dart-define=API_BASE_URL=http://127.0.0.1:8010

mobile-dev-android:
	cd mobile/iip_app && flutter pub get && flutter run \
		--dart-define=API_BASE_URL=http://10.0.2.2:8010

# Physical phone on same Wi‑Fi — uses Mac LAN IP automatically
mobile-dev-device:
	cd mobile/iip_app && $(MAKE) mobile-dev-device

run: docker-up
	pnpm --filter iip-portal run dev & \
	KEYCLOAK_SERVER_URL=http://localhost:8081 \
	KEYCLOAK_ENABLED=true \
	uv run uvicorn backend.services.iam-svc.iam_svc.main:app --port 8010 & \
	KEYCLOAK_SERVER_URL=http://localhost:8081 \
	KEYCLOAK_ENABLED=true \
	uv run uvicorn backend.services.ml-gateway-svc.ml_gateway_svc.main:app --port 8020 & \
	wait

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
