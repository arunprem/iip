# OpenAFIS fingerprint matcher (IIP)

Fingerprints are stored as **ISO/IEC 19794-2:2005** template files on disk (`{print_id}.iso`).
Matching uses [OpenAFIS](https://github.com/neilharan/openafis) in a Docker container.

## Build and run

```bash
make openafis-docker
```

This clones OpenAFIS into `vendor/openafis` on the host, builds the image, and starts `iip-openafis-matcher`.

Templates volume: `./data/openafis/templates` → `/data/templates` inside the container.

## CLI (inside container)

```bash
docker exec iip-openafis-matcher iip-openafis-identify \
  --probe /tmp/probe.iso \
  --templates /data/templates \
  --min-score 40
```

Stdout JSON: `{"matches":[{"id":"<print_id>","score":78},...]}`

## ml-gateway (local dev)

```bash
make ml-gateway-dev
```

ml-gateway runs on the host and invokes the matcher via `docker exec iip-openafis-matcher`.
Do not set `OPENAFIS_MATCHER_BIN` unless you have a reason to bypass Docker.

## Re-index from PostgreSQL

```bash
uv run python scratch/reindex_fingerprints.py
```
