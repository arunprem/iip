import asyncio
import os
import sys

# Set up paths relative to the script location
scratch_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(scratch_dir, ".."))
sys.path.append(os.path.join(root_dir, "backend/libs/iip-core"))
sys.path.append(os.path.join(root_dir, "backend/services/ml-gateway-svc"))

# Load environment variables from the root .env file
try:
    import dotenv
    dotenv.load_dotenv(os.path.join(root_dir, ".env"))
except ImportError:
    pass

from sqlalchemy import text
from iip_core.db import build_engine
from iip_core.settings import get_settings
from ml_gateway_svc.services.fingerprint_store import FingerprintStore
from ml_gateway_svc.settings import get_ml_settings

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    ml_settings = get_ml_settings()
    index_service = FingerprintStore(ml_settings)
    
    try:
        async with engine.connect() as conn:
            # Query all suspect fingerprints
            result = await conn.execute(text("""
                SELECT f.print_id, f.template_id, f.dossier_id, f.finger_position, 
                       f.template_format, f.template_data, f.template_hash, 
                       f.quality_score, f.device_model,
                       d.dossier_draft_id, d.master_suspect_id, s.criminal_name
                FROM intelligence.suspect_fingerprints f
                JOIN intelligence.suspect_dossiers d ON f.dossier_id = d.id
                JOIN intelligence.suspects s ON f.suspect_id = s.id
            """))
            rows = result.fetchall()
            print(f"Found {len(rows)} approved fingerprints in DB to index.")
            
            for row in rows:
                print(f"Indexing print_id={row.print_id} (template_id={row.template_id}) for suspect '{row.criminal_name}'...")
                await index_service.index_print(
                    print_id=str(row.print_id),
                    template_id=str(row.template_id),
                    dossier_draft_id=str(row.dossier_draft_id) if row.dossier_draft_id else str(row.dossier_id),
                    finger_position=row.finger_position,
                    template_format=row.template_format,
                    template_bytes=row.template_data,
                    template_hash=row.template_hash,
                    created_by="system-reindex",
                    suspect_id=str(row.master_suspect_id),
                    criminal_name=row.criminal_name,
                    quality_score=row.quality_score,
                    device_model=row.device_model,
                )
            print("Finished indexing all prints successfully!")
    except Exception as exc:
        print("Error during reindexing:", exc)
    finally:
        await index_service.close()
        await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
