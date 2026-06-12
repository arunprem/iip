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
from ml_gateway_svc.services.fingerprint_index import FingerprintIndexService
from ml_gateway_svc.settings import get_ml_settings

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    ml_settings = get_ml_settings()
    index_service = FingerprintIndexService(ml_settings)
    
    try:
        async with engine.connect() as conn:
            # Query all suspect fingerprints
            result = await conn.execute(text("""
                SELECT f.print_id, f.template_id, f.finger_position, f.template_data, s.criminal_name
                FROM intelligence.suspect_fingerprints f
                JOIN intelligence.suspects s ON f.suspect_id = s.id
            """))
            rows = result.fetchall()
            print(f"Found {len(rows)} approved fingerprints in DB.")
            
            for row in rows:
                print(f"\n--- Simulating identify for '{row.criminal_name}' ({row.finger_position}) ---")
                
                # We will call find_similar without margin checks first, and check scores
                matches_no_margin = await index_service.find_similar(
                    row.template_data,
                    submitted_only=True,
                    min_cosine=0.0, # get all matches regardless of score
                    apply_margin=False,
                )
                print("Matches (no margin filtering, min_cosine=0.0):")
                for m in matches_no_margin:
                    print(f"  - Name: {m.criminal_name}, Position: {m.finger_position}, Score: {m.similarity_score:.4f}")
                
                # Now call it with actual production thresholds
                matches_prod = await index_service.find_similar(
                    row.template_data,
                    submitted_only=True,
                    # uses settings defaults
                )
                print("Matches (with prod settings thresholds):")
                if not matches_prod:
                    print("  No match found!")
                for m in matches_prod:
                    print(f"  - Name: {m.criminal_name}, Position: {m.finger_position}, Score: {m.similarity_score:.4f}")
                    
    except Exception as exc:
        print("Error:", exc)
    finally:
        await index_service.close()
        await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
