"""Load approved suspect fingerprints from PostgreSQL into OpenAFIS store on startup."""

from __future__ import annotations

from sqlalchemy import text

import iip_core.db as db
from iip_core.logging import get_logger
from ml_gateway_svc.services.fingerprint_store import FingerprintStore

logger = get_logger(__name__)


async def bootstrap_fingerprints_from_db(store: FingerprintStore) -> int:
    # Use db._engine — `from iip_core.db import _engine` stays None after init_db().
    if db._engine is None:
        logger.warning("fingerprint_bootstrap_skipped", reason="database_not_initialized")
        return 0
    count = 0
    try:
        async with db._engine.connect() as conn:
            result = await conn.execute(
                text(
                    """
                    SELECT f.print_id, f.template_id, f.dossier_id, f.suspect_id,
                           f.finger_position, f.template_format, f.template_data, f.template_hash,
                           f.quality_score, f.device_model,
                           d.dossier_draft_id, s.criminal_name,
                           sub.image_data, sub.image_width, sub.image_height
                    FROM intelligence.suspect_fingerprints f
                    JOIN intelligence.suspect_dossiers d ON f.dossier_id = d.id
                    JOIN intelligence.suspects s ON f.suspect_id = s.id
                    LEFT JOIN intelligence.suspect_fingerprint_submissions sub
                        ON sub.print_id = f.print_id
                       AND sub.status = 'APPROVED'
                       AND sub.image_data IS NOT NULL
                    WHERE f.print_id IS NOT NULL
                      AND f.template_data IS NOT NULL
                    """
                )
            )
            rows = result.fetchall()
        for row in rows:
            print_id = str(row.print_id)
            draft_id = str(row.dossier_draft_id) if row.dossier_draft_id else str(row.dossier_id)
            image_bytes = bytes(row.image_data) if row.image_data else None
            await store.index_print(
                print_id=print_id,
                template_id=str(row.template_id),
                dossier_draft_id=draft_id,
                finger_position=row.finger_position,
                template_format=row.template_format,
                template_bytes=bytes(row.template_data),
                template_hash=row.template_hash,
                created_by="bootstrap",
                suspect_id=str(row.suspect_id),
                criminal_name=row.criminal_name,
                quality_score=row.quality_score,
                device_model=row.device_model,
                image_bytes=image_bytes,
                image_width=row.image_width,
                image_height=row.image_height,
            )
            count += 1
        logger.info("fingerprint_bootstrap_complete", count=count)
    except Exception as exc:
        logger.warning("fingerprint_bootstrap_failed", error=str(exc))
    return count
