import asyncio
import os
import sys

scratch_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(scratch_dir, ".."))
sys.path.append(os.path.join(root_dir, "backend/libs/iip-core"))

try:
    import dotenv
    dotenv.load_dotenv(os.path.join(root_dir, ".env"))
except ImportError:
    pass

from sqlalchemy import text
from iip_core.db import build_engine
from iip_core.settings import get_settings

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    async with engine.connect() as conn:
        print("--- Checking Suspects named Sreejith ---")
        sus_res = await conn.execute(text("""
            SELECT id, criminal_name FROM intelligence.suspects
            WHERE criminal_name ILIKE '%sreejith%'
        """))
        suspects = sus_res.fetchall()
        for s in suspects:
            print(f"Suspect ID: {s.id}, Name: {s.criminal_name}")
            
            # Check approved fingerprints
            fp_res = await conn.execute(text("""
                SELECT * FROM intelligence.suspect_fingerprints
                WHERE suspect_id = :suspect_id
            """), {"suspect_id": s.id})
            fps = fp_res.fetchall()
            print(f"  Approved fingerprints: {len(fps)}")
            for f in fps:
                print(f"    Fields: {dict(f._mapping)}")
                
            # Check fingerprint submissions
            sub_res = await conn.execute(text("""
                SELECT id, dossier_id, finger_position, status, quality_score, created_at
                FROM intelligence.suspect_fingerprint_submissions
                WHERE suspect_id = :suspect_id
            """), {"suspect_id": s.id})
            subs = sub_res.fetchall()
            print(f"  Submissions: {len(subs)}")
            for sub in subs:
                print(f"    Sub ID: {sub.id}, Dossier ID: {sub.dossier_id}, Position: {sub.finger_position}, Status: {sub.status}, Quality: {sub.quality_score}")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
