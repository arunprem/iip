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
from test_minutiae_matcher import parse_fmr_minutiae

def compute_local_descriptors(pts):
    descriptors = []
    n = len(pts)
    for i in range(n):
        p_i = pts[i]
        # Find distances to all other points
        dists = []
        for j in range(n):
            if i == j:
                continue
            p_j = pts[j]
            dx = p_i['x'] - p_j['x']
            dy = p_i['y'] - p_j['y']
            d = math.sqrt(dx*dx + dy*dy)
            dists.append(d)
        dists.sort()
        # Take the nearest 3 distances as the descriptor
        if len(dists) >= 3:
            desc = dists[:3]
        elif len(dists) == 2:
            desc = dists + [dists[-1]]
        elif len(dists) == 1:
            desc = dists * 3
        else:
            desc = [0.0, 0.0, 0.0]
        descriptors.append(desc)
    return descriptors

def match_minutiae_fast(M_A, M_B, d_thresh=15.0, a_thresh_deg=25.0) -> float:
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
    
    # We will score candidates. If they have similar neighborhood distances, they are potential reference pairs.
    potential_pairs = []
    for idx_A, r_A in enumerate(pts_A):
        for idx_B, r_B in enumerate(pts_B):
            # Sum of absolute differences of local descriptor distances
            diff = sum(abs(da - db) for da, db in zip(desc_A[idx_A], desc_B[idx_B]))
            # If the neighborhood distances differ by less than 15 pixels total, it's a good candidate
            if diff < 15.0:
                potential_pairs.append((r_A, r_B, diff))
                
    # Sort potential pairs so we try the most similar neighborhoods first
    potential_pairs.sort(key=lambda item: item[2])
    
    # If we found no close matches, try with a larger tolerance or just fall back to all pairs
    if not potential_pairs:
        for r_A in pts_A:
            for r_B in pts_B:
                potential_pairs.append((r_A, r_B, 999.0))
                
    # Limit to top 20 potential pairs to make it extremely fast
    for ref_A, ref_B, _ in potential_pairs[:30]:
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
            
        print("Starting comparison...")
        start_time = time.time()
        
        for fp1 in fingerprints:
            for fp2 in fingerprints:
                score = match_minutiae_fast(fp1['minutiae'], fp2['minutiae'])
                label1 = f"{fp1['name']} ({fp1['pos']})"
                label2 = f"{fp2['name']} ({fp2['pos']})"
                print(f"{label1:<35} | {label2:<35} | {score:.4f}")
                
        duration = time.time() - start_time
        print(f"\nTotal time: {duration:.4f} seconds ({duration/16:.4f} seconds per match)")
                
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
