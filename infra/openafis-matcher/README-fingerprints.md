# Fingerprint AFIS (OpenAFIS)

Suspect fingerprints use **OpenAFIS** for 1:N matching instead of Elasticsearch.

## Architecture

```text
SecuGen capture (ISO template bytes)
  → PostgreSQL intelligence.suspect_fingerprints (source of truth)
  → data/openafis/templates/{print_id}.iso (on disk, shared volume)
  → Docker: iip-openafis-matcher runs iip-openafis-identify
  → ml-gateway /fingerprints/identify (docker exec)
```

Faces still use Elasticsearch (`iip-suspect-faces`).

## Start (Docker — recommended)

```bash
make openafis-docker    # fetch OpenAFIS source + build + start container
make docker-up          # postgres, elasticsearch, etc.
make ml-gateway-dev     # calls matcher via docker exec iip-openafis-matcher
```

First-time build pulls `cmake:3.28-bookworm` and `debian:bookworm-slim` from Docker Hub.
No Mac build tools (cmake, llvm) required.

### If Docker build fails on DNS

If you see **Temporary failure resolving 'deb.debian.org'** on an older Dockerfile, rebuild after pulling latest changes — the current Dockerfile does **not** use `apt-get`.

If Docker Hub pulls also fail, fix Docker Desktop DNS (Settings → Docker Engine):

```json
{ "dns": ["8.8.8.8", "8.8.4.4"] }
```

Then retry `make openafis-docker`.

### Verify matcher

```bash
docker exec iip-openafis-matcher iip-openafis-identify --help
docker ps --filter name=iip-openafis-matcher
```

On ml-gateway startup, approved prints are loaded from PostgreSQL into `data/openafis/templates/`.

## Re-index after DB restore

```bash
uv run python scratch/reindex_fingerprints.py
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `FINGERPRINT_BACKEND` | `openafis` | `openafis` or `elasticsearch` (legacy) |
| `OPENAFIS_TEMPLATES_DIR` | `data/openafis/templates` | ISO template files (host path) |
| `OPENAFIS_MATCHER_BIN` | _(empty)_ | Optional local binary; leave empty for Docker |
| `OPENAFIS_MIN_SCORE` | `40` | Match threshold 0–100 |

When `OPENAFIS_MATCHER_BIN` is unset, ml-gateway uses `docker exec iip-openafis-matcher`.
If the container is not running, it falls back to in-process minutiae matching.
