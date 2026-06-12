import asyncio
import os
import sys
import struct

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

def inspect_header(data: bytes, label: str):
    if len(data) < 24:
        print(f"[{label}] Template too short: {len(data)} bytes")
        return
    magic = data[:4]
    version = data[4:8]
    record_length = struct.unpack(">I", data[8:12])[0]
    db_id = struct.unpack(">H", data[12:14])[0]
    width = struct.unpack(">H", data[14:16])[0]
    height = struct.unpack(">H", data[16:18])[0]
    x_res = struct.unpack(">H", data[18:20])[0]
    y_res = struct.unpack(">H", data[20:22])[0]
    num_views = data[22]
    print(f"[{label}] magic={magic!r} version={version!r} len={len(data)} record_len={record_length}")
    print(f"  Size: {width}x{height}, Res: {x_res}x{y_res}, Views: {num_views}")

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    async with engine.connect() as conn:
        print("--- Submissions ---")
        sub_res = await conn.execute(text("""
            SELECT id, criminal_name, finger_position, template_data FROM intelligence.suspect_fingerprint_submissions
        """))
        for s in sub_res.fetchall():
            inspect_header(s.template_data, f"Submission: {s.criminal_name} ({s.finger_position})")
            
        print("\n--- Approved Fingerprints ---")
        fp_res = await conn.execute(text("""
            SELECT print_id, finger_position, template_data, s.criminal_name
            FROM intelligence.suspect_fingerprints f
            JOIN intelligence.suspects s ON f.suspect_id = s.id
        """))
        for f in fp_res.fetchall():
            inspect_header(f.template_data, f"Approved: {f.criminal_name} ({f.finger_position})")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
