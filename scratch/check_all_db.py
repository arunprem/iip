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
        print("--- Checked Suspects ---")
        sus_res = await conn.execute(text("""
            SELECT id, criminal_name FROM intelligence.suspects
        """))
        for s in sus_res.fetchall():
            print(f"Suspect: {s.criminal_name} (ID: {s.id})")
            
        print("\n--- Approved Fingerprints in DB ---")
        fp_res = await conn.execute(text("""
            SELECT f.print_id, f.template_id, f.finger_position, f.quality_score, s.criminal_name
            FROM intelligence.suspect_fingerprints f
            JOIN intelligence.suspects s ON f.suspect_id = s.id
        """))
        fps = fp_res.fetchall()
        print(f"Approved fingerprints count: {len(fps)}")
        for f in fps:
            print(f"  Suspect: {f.criminal_name}, Print ID: {f.print_id}, Position: {f.finger_position}")
            
        print("\n--- Submissions in DB ---")
        sub_res = await conn.execute(text("""
            SELECT id, suspect_id, finger_position, status, quality_score, criminal_name
            FROM intelligence.suspect_fingerprint_submissions
        """))
        subs = sub_res.fetchall()
        print(f"Submissions count: {len(subs)}")
        for sub in subs:
            print(f"  Suspect: {sub.criminal_name}, Position: {sub.finger_position}, Status: {sub.status}")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
