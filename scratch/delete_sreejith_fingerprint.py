import asyncio
import os
import sys

scratch_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(scratch_dir, ".."))
sys.path.append(os.path.join(root_dir, "backend/libs/iip-core"))
sys.path.append(os.path.join(root_dir, "backend/services/ml-gateway-svc"))

try:
    import dotenv
    dotenv.load_dotenv(os.path.join(root_dir, ".env"))
except ImportError:
    pass

from sqlalchemy import text
from iip_core.db import build_engine
from iip_core.settings import get_settings
from ml_gateway_svc.services.fingerprint_index import FingerprintIndexService
from ml_gateway_svc.settings import get_ml_settings

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    ml_settings = get_ml_settings()
    index_service = FingerprintIndexService(ml_settings)
    
    suspect_id = "350e08c0-abf7-4519-9961-dfe6a9b83529" # Sreejith
    
    try:
        async with engine.begin() as conn:
            print(f"Searching fingerprints and submissions for suspect_id={suspect_id}...")
            
            # 1. Fetch print_ids from suspect_fingerprints
            fp_res = await conn.execute(text("""
                SELECT id, print_id FROM intelligence.suspect_fingerprints
                WHERE suspect_id = :suspect_id
            """), {"suspect_id": suspect_id})
            fps = fp_res.fetchall()
            
            # 2. Fetch print_ids from suspect_fingerprint_submissions
            sub_res = await conn.execute(text("""
                SELECT id, print_id FROM intelligence.suspect_fingerprint_submissions
                WHERE suspect_id = :suspect_id
            """), {"suspect_id": suspect_id})
            subs = sub_res.fetchall()
            
            # Collect all unique print IDs to delete from ES
            print_ids = set()
            for fp in fps:
                if fp.print_id:
                    print_ids.add(str(fp.print_id))
            for sub in subs:
                if sub.print_id:
                    print_ids.add(str(sub.print_id))
                    
            # Delete from Elasticsearch
            for pid in print_ids:
                print(f"Deleting print_id={pid} from Elasticsearch...")
                await index_service.delete_print(pid)
                
            # Delete suspect_fingerprints
            del_fp_res = await conn.execute(text("""
                DELETE FROM intelligence.suspect_fingerprints
                WHERE suspect_id = :suspect_id
            """), {"suspect_id": suspect_id})
            print(f"Deleted {del_fp_res.rowcount} approved fingerprints from DB.")
            
            # Delete suspect_fingerprint_submissions
            del_sub_res = await conn.execute(text("""
                DELETE FROM intelligence.suspect_fingerprint_submissions
                WHERE suspect_id = :suspect_id
            """), {"suspect_id": suspect_id})
            print(f"Deleted {del_sub_res.rowcount} fingerprint submissions from DB.")
            
            print("Successfully deleted Sreejith's fingerprint records!")
    except Exception as exc:
        print("Failed to delete records:", exc)
            
    await index_service.close()
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
