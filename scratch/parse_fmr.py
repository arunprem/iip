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

def parse_fmr(data: bytes):
    if len(data) < 24:
        print("Data too short")
        return None
    
    # 1. Header
    magic = data[:4]
    version = data[4:8]
    record_length = struct.unpack(">I", data[8:12])[0]
    # In some versions, the header has 2 bytes DB ID, 2 bytes terminal ID, or is slightly different.
    # Let's unpack the rest of the 24-byte header
    db_id = struct.unpack(">H", data[12:14])[0]
    image_width = struct.unpack(">H", data[14:16])[0]
    image_height = struct.unpack(">H", data[16:18])[0]
    x_res = struct.unpack(">H", data[18:20])[0]
    y_res = struct.unpack(">H", data[20:22])[0]
    num_views = data[22]
    reserved = data[23]
    
    print(f"Magic: {magic!r}, Version: {version!r}, Length: {record_length}")
    print(f"DB ID: {db_id}, Size: {image_width}x{image_height}, Res: {x_res}x{y_res}, Views: {num_views}, Reserved: {reserved}")
    
    offset = 24
    for view_idx in range(num_views):
        if offset + 6 > len(data):
            print(f"Data truncated before view {view_idx}")
            break
        finger_pos = data[offset]
        view_num = data[offset+1]
        impression_type = data[offset+2]
        quality = data[offset+3]
        num_minutiae = data[offset+4]
        # In FMR, finger view header can also have 1 byte for extended data length or similar?
        # Let's check typical FMR view header size: 6 bytes (finger position, view number, impression type, quality, minutiae count, reserved).
        # Wait, let's print these 6 bytes.
        reserved_view = data[offset+5]
        print(f"  View {view_idx}: Finger={finger_pos}, ViewNum={view_num}, Imp={impression_type}, Quality={quality}, MinutiaeCount={num_minutiae}, Reserved={reserved_view}")
        
        offset += 6
        minutiae = []
        for m_idx in range(num_minutiae):
            if offset + 6 > len(data):
                print(f"    Data truncated at minutia {m_idx}")
                break
            m_bytes = data[offset : offset + 6]
            # byte 0-1: type (2 bits), X (14 bits)
            type_and_x = struct.unpack(">H", m_bytes[0:2])[0]
            m_type = type_and_x >> 14
            x = type_and_x & 0x3FFF
            
            # byte 2-3: reserved (2 bits), Y (14 bits)
            res_and_y = struct.unpack(">H", m_bytes[2:4])[0]
            y = res_and_y & 0x3FFF
            
            angle = m_bytes[4] # angle is in steps of 2 degrees: 0..180 (0..360 degrees) or 0..255.
            # In ISO 19794-2, angle is represented as a single byte from 0 to 255 (value * 360 / 256 degrees).
            quality = m_bytes[5]
            
            minutiae.append((m_type, x, y, angle, quality))
            offset += 6
        print(f"    Parsed {len(minutiae)} minutiae points.")
        if minutiae:
            print(f"    Sample: {minutiae[:3]}")

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT f.template_data, s.criminal_name
            FROM intelligence.suspect_fingerprints f
            JOIN intelligence.suspects s ON f.suspect_id = s.id
        """))
        for row in result.fetchall():
            print(f"\n--- Parsing FMR for {row.criminal_name} ---")
            parse_fmr(row.template_data)

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
