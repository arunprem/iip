import asyncio
import os
import sys
import struct
import math
import time

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
from test_fast_matcher import parse_fmr_minutiae, compute_local_descriptors

def match_minutiae_robust(M_A, M_B, d_thresh=15.0, a_thresh_deg=25.0, max_pairs=80, max_diff=35.0) -> float:
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
        
    desc_A = compute_local_descriptors(pts_A)
    desc_B = compute_local_descriptors(pts_B)
    
    a_thresh_rad = a_thresh_deg * (math.pi / 180.0)
    best_match_count = 0
    
    potential_pairs = []
    for idx_A, r_A in enumerate(pts_A):
        for idx_B, r_B in enumerate(pts_B):
            # Sum of absolute differences of local descriptor distances
            diff = sum(abs(da - db) for da, db in zip(desc_A[idx_A], desc_B[idx_B]))
            if diff < max_diff:
                potential_pairs.append((r_A, r_B, diff))
                
    potential_pairs.sort(key=lambda item: item[2])
    
    if not potential_pairs:
        for r_A in pts_A:
            for r_B in pts_B:
                potential_pairs.append((r_A, r_B, 999.0))
                
    # Evaluate up to max_pairs
    for ref_A, ref_B, _ in potential_pairs[:max_pairs]:
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
    
    async with engine.connect() as conn:
        # Load approved fingerprint for Priya Raj
        fp_res = await conn.execute(text("""
            SELECT f.template_data, s.criminal_name
            FROM intelligence.suspect_fingerprints f
            JOIN intelligence.suspects s ON f.suspect_id = s.id
            WHERE s.criminal_name ILIKE '%priya%'
            LIMIT 1
        """))
        fp = fp_res.fetchone()
        
        # Load submission fingerprint for Priya Raj (which represents the mobile scan)
        sub_res = await conn.execute(text("""
            SELECT template_data, criminal_name
            FROM intelligence.suspect_fingerprint_submissions
            WHERE criminal_name ILIKE '%priya%'
            LIMIT 1
        """))
        sub = sub_res.fetchone()
        
        if not fp or not sub:
            print("Could not find both approved and submission prints for Priya Raj.")
            await engine.dispose()
            return
            
        M_A = parse_fmr_minutiae(fp.template_data)
        M_B = parse_fmr_minutiae(sub.template_data)
        
        print(f"Priya Raj approved template size: {len(M_A)} minutiae")
        print(f"Priya Raj submission template size: {len(M_B)} minutiae")
        
        # Test standard matcher (max_diff=15.0, max_pairs=30)
        t0 = time.time()
        score1 = match_minutiae_robust(M_A, M_B, max_diff=15.0, max_pairs=30)
        t1 = time.time()
        print(f"Standard Matcher: score={score1:.4f} time={(t1-t0)*1000:.2f}ms")
        
        # Test robust matcher (max_diff=35.0, max_pairs=100)
        t0 = time.time()
        score2 = match_minutiae_robust(M_A, M_B, max_diff=35.0, max_pairs=100)
        t2 = time.time()
        print(f"Robust Matcher (max_diff=35, max_pairs=100): score={score2:.4f} time={(t2-t0)*1000:.2f}ms")
        
        # Test robust matcher (max_diff=45.0, max_pairs=150)
        t0 = time.time()
        score3 = match_minutiae_robust(M_A, M_B, max_diff=45.0, max_pairs=150)
        t3 = time.time()
        print(f"Robust Matcher (max_diff=45, max_pairs=150): score={score3:.4f} time={(t3-t0)*1000:.2f}ms")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
