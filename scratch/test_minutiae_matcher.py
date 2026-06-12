import asyncio
import os
import sys
import struct
import math

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

def parse_fmr_minutiae(data: bytes):
    if len(data) < 30:
        return []
    
    # 24-byte record header
    num_views = data[22]
    
    offset = 24
    minutiae = []
    
    for view_idx in range(num_views):
        if offset + 6 > len(data):
            break
        num_minutiae = data[offset+4]
        # In case the template was trimmed, the actual count of 6-byte records available is:
        actual_minutiae_count = (len(data) - 30) // 6
        num_to_read = min(num_minutiae, actual_minutiae_count)
        
        offset += 6
        for m_idx in range(num_to_read):
            if offset + 6 > len(data):
                break
            m_bytes = data[offset : offset + 6]
            
            # X coordinate: 14 bits (mask out the top 2 type bits)
            type_and_x = struct.unpack(">H", m_bytes[0:2])[0]
            m_type = type_and_x >> 14
            x = type_and_x & 0x3FFF
            
            # Y coordinate: 14 bits
            res_and_y = struct.unpack(">H", m_bytes[2:4])[0]
            y = res_and_y & 0x3FFF
            
            angle = m_bytes[4] # 0..255
            quality = m_bytes[5]
            
            minutiae.append((m_type, x, y, angle, quality))
            offset += 6
            
    return minutiae

def match_minutiae(M_A, M_B, d_thresh=15.0, a_thresh_deg=25.0) -> float:
    if not M_A or not M_B:
        return 0.0
    
    pts_A = []
    for m in M_A:
        m_type, x, y, angle_val, q = m
        angle_rad = angle_val * (2 * math.pi / 256.0)
        pts_A.append({'x': float(x), 'y': float(y), 'theta': angle_rad})
        
    pts_B = []
    for m in M_B:
        m_type, x, y, angle_val, q = m
        angle_rad = angle_val * (2 * math.pi / 256.0)
        pts_B.append({'x': float(x), 'y': float(y), 'theta': angle_rad})
        
    a_thresh_rad = a_thresh_deg * (math.pi / 180.0)
    
    best_match_count = 0
    
    # Try all pairs of minutiae as reference matching points
    for ref_A in pts_A:
        for ref_B in pts_B:
            # Shift B to align ref_B with ref_A
            tx = ref_A['x'] - ref_B['x']
            ty = ref_A['y'] - ref_B['y']
            d_theta = ref_A['theta'] - ref_B['theta']
            cos_t = math.cos(d_theta)
            sin_t = math.sin(d_theta)
            
            # Align points in B
            aligned_B = []
            for p in pts_B:
                dx = p['x'] - ref_B['x']
                dy = p['y'] - ref_B['y']
                rx = dx * cos_t - dy * sin_t
                ry = dx * sin_t + dy * cos_t
                aligned_B.append({
                    'x': rx + ref_A['x'],
                    'y': ry + ref_A['y'],
                    'theta': (p['theta'] + d_theta) % (2 * math.pi)
                })
            
            # Count matches
            matches = 0
            matched_A = [False] * len(pts_A)
            
            for p_B in aligned_B:
                min_d = float('inf')
                closest_idx = -1
                for idx, p_A in enumerate(pts_A):
                    if matched_A[idx]:
                        continue
                    dx = p_A['x'] - p_B['x']
                    dy = p_A['y'] - p_B['y']
                    d = math.sqrt(dx*dx + dy*dy)
                    if d < d_thresh:
                        d_ang = abs(p_A['theta'] - p_B['theta'])
                        d_ang = min(d_ang, 2 * math.pi - d_ang)
                        if d_ang < a_thresh_rad:
                            if d < min_d:
                                min_d = d
                                closest_idx = idx
                if closest_idx != -1:
                    matched_A[closest_idx] = True
                    matches += 1
            
            if matches > best_match_count:
                best_match_count = matches
                
    denom = min(len(pts_A), len(pts_B))
    if denom == 0:
        return 0.0
    return best_match_count / denom

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT f.template_data, s.criminal_name, f.finger_position
            FROM intelligence.suspect_fingerprints f
            JOIN intelligence.suspects s ON f.suspect_id = s.id
        """))
        rows = result.fetchall()
        
        fingerprints = []
        for r in rows:
            minutiae = parse_fmr_minutiae(r.template_data)
            fingerprints.append({
                'name': r.criminal_name,
                'pos': r.finger_position,
                'minutiae': minutiae
            })
            
        print("Similarity Matrix:")
        print(f"{'Source Fingerprint':<40} | {'Target Fingerprint':<40} | {'Score':<6}")
        print("-" * 92)
        for fp1 in fingerprints:
            for fp2 in fingerprints:
                score = match_minutiae(fp1['minutiae'], fp2['minutiae'])
                label1 = f"{fp1['name']} ({fp1['pos']}) [{len(fp1['minutiae'])} pts]"
                label2 = f"{fp2['name']} ({fp2['pos']}) [{len(fp2['minutiae'])} pts]"
                print(f"{label1:<40} | {label2:<40} | {score:.4f}")
                
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
