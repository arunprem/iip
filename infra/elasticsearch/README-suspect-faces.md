# Suspect face index (`iip-suspect-faces`)

The ML gateway creates this index automatically on startup when Elasticsearch is reachable.

## Requirements

- Elasticsearch 8.x (see `docker-compose.yml`)
- MinIO for photo blobs (`suspect-photos/{dossier_draft_id}/{photo_id}.jpg`)
- DeepFace + Facenet512 (512-dim cosine vectors)

## API

- `POST /api/v1/ml/faces/analyze` — multipart: `file`, `pose_type`, `dossier_draft_id`, `photo_id`, optional `suspect_id`
  - **FRONT**, **LEFT_PROFILE**, **RIGHT_PROFILE**: face detection + pose verification (profiles optional but checked when uploaded)
  - **LEFT**, **RIGHT**, **OTHER**: stored only, no pose check
  - FRS indexing / duplicate search: submitted dossiers only (`suspect_id` on analyze)
- `DELETE /api/v1/ml/faces/photos/{photo_id}?dossier_draft_id=...&storage_key=...` — remove one draft slot photo from MinIO
- `DELETE /api/v1/ml/faces/drafts/{dossier_draft_id}` — discard entire abandoned draft (all MinIO objects + legacy ES vectors)

Draft photos are stored under `suspect-photos/{dossier_draft_id}/` in MinIO. They are **not** indexed for duplicate search until `suspect_id` is sent on submit. When the user clears the wizard or removes a slot, the portal calls these delete endpoints so blobs do not accumulate.

## Environment (ml-gateway-svc)

| Variable | Default |
|----------|---------|
| `ELASTICSEARCH_URL` | `http://localhost:9200` |
| `FACE_INDEX_NAME` | `iip-suspect-faces` |
| `FACE_MATCH_MIN_SCORE` | `0.72` |

## Run locally

```bash
cd backend/services/ml-gateway-svc
uv sync
uv run uvicorn ml_gateway_svc.main:app --host 0.0.0.0 --port 8020 --reload
```

First face analysis downloads DeepFace model weights (may take a few minutes).
