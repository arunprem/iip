# NBIS fingerprint matcher (IIP)

NIST **mindtct** + **bozorth3** for grayscale fingerprint images captured alongside SecuGen ISO templates.

## Dual-format enrollment

| Format | Storage | Matcher |
|--------|---------|---------|
| ISO 19794-2 FMR | `data/openafis/templates/{print_id}.iso` | OpenAFIS / in-process minutiae |
| Grayscale raw + NBIS `.xyt` | `data/nbis/xyt/{print_id}.xyt` | NBIS bozorth3 |

Field capture must send **template + raw image** so both galleries stay in sync.

## Build & run

Downloads NBIS 5.0.0 from NIST NIGOS on the host, then builds in Docker (no SourceForge).

```bash
make nbis-docker
```

Manual fetch only:

```bash
infra/nbis-matcher/scripts/fetch-nbis.sh
```

Starts `iip-nbis-matcher` with gallery at `./data/nbis/xyt`.

## Identify engine selection

`POST /api/v1/ml/fingerprints/identify` accepts `matchEngine`:

- `openafis` (default) — ISO FMR minutiae / OpenAFIS
- `nbis` — requires probe `imageDataB64`, `imageWidth`, `imageHeight`

Prints enrolled before dual-capture only work with **openafis** until re-captured.
