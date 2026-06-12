import asyncio
import os
import sys
import struct
import math

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
from test_fast_matcher import parse_fmr_minutiae, compute_local_descriptors, match_minutiae_fast
from test_robust_matcher import match_minutiae_robust

def match_minutiae_full(M_A, M_B, d_thresh=15.0, a_thresh_deg=25.0) -> float:
    """Brute-force check of all possible reference pairs (O(N_A * N_B) alignment pairs)."""
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
    
    # Try all pairs of minutiae as reference alignment points
    for ref_A in pts_A:
        for ref_B in pts_B:
            tx = ref_A['x'] - ref_B['x']
            ty = ref_A['y'] - ref_B['y']
            d_theta = ref_A['theta'] - ref_B['theta']
            cos_t = math.cos(d_theta)
            sin_t = math.sin(d_theta)
            
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
    
    # 1. Load Sreejith/Priya Raj templates from DB
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT f.template_data, s.criminal_name, f.finger_position
            FROM intelligence.suspect_fingerprints f
            JOIN intelligence.suspects s ON f.suspect_id = s.id
            WHERE s.criminal_name ILIKE '%priya%'
            LIMIT 1
        """))
        row = result.fetchone()
        if not row:
            print("No approved fingerprint found for Priya Raj in DB.")
            await engine.dispose()
            return
        db_template = row.template_data
        print(f"Loaded approved DB template for {row.criminal_name} ({row.finger_position}).")
        
    await engine.dispose()
    
    # 2. Load the last query template from file
    query_file = "/Volumes/dev/kp-inteligence/scratch/last_query_template.bin"
    if not os.path.exists(query_file):
        print(f"Query template file not found at {query_file}.")
        return
        
    with open(query_file, "rb") as f:
        query_template = f.read()
    print(f"Loaded last query template from file (size={len(query_template)} bytes).")
    
    # Parse minutiae points
    M_DB = parse_fmr_minutiae(db_template)
    M_Q = parse_fmr_minutiae(query_template)
    
    print(f"DB Template Minutiae count: {len(M_DB)}")
    print(f"Query Template Minutiae count: {len(M_Q)}")
    
    # 3. Test matching algorithms
    # A. Standard fast matcher (current settings)
    score_fast = match_minutiae_fast(M_DB, M_Q)
    print(f"Fast Matcher: score={score_fast:.4f}")
    
    # B. Robust matcher (max_diff=35.0, max_pairs=100)
    score_robust = match_minutiae_robust(M_DB, M_Q, max_diff=35.0, max_pairs=100)
    print(f"Robust Matcher (max_diff=35, max_pairs=100): score={score_robust:.4f}")
    
    # C. Robust matcher (max_diff=50.0, max_pairs=200)
    score_robust_loose = match_minutiae_robust(M_DB, M_Q, max_diff=50.0, max_pairs=200)
    print(f"Robust Matcher (max_diff=50, max_pairs=200): score={score_robust_loose:.4f}")
    
    # D. Unrestricted Brute-Force Matcher (O(N_A * N_B) pairs checked)
    score_full = match_minutiae_full(M_DB, M_Q)
    print(f"Unrestricted Full Matcher: score={score_full:.4f}")
    
    # E. Full Matcher with larger distance tolerance (d_thresh=25.0)
    score_full_loose = match_minutiae_full(M_DB, M_Q, d_thresh=25.0, a_thresh_deg=35.0)
    print(f"Unrestricted Full Matcher (d_thresh=25, a_thresh=35): score={score_full_loose:.4f}")

if __name__ == '__main__':
    asyncio.run(main())
