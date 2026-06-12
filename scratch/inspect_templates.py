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
        result = await conn.execute(text("""
            SELECT f.print_id, f.finger_position, f.template_data, s.criminal_name
            FROM intelligence.suspect_fingerprints f
            JOIN intelligence.suspects s ON f.suspect_id = s.id
        """))
        rows = result.fetchall()
        print(f"Total fingerprints: {len(rows)}")
        for r in rows:
            print(f"Name: {r.criminal_name}, Position: {r.finger_position}")
            print(f"  Length: {len(r.template_data)} bytes")
            print(f"  Header (hex): {r.template_data[:20].hex()}")
            print(f"  Header (ASCII): {r.template_data[:20]}")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
