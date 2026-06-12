import asyncio
import os
import sys
import struct
import math
import random

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

def minutiae_to_histogram_vector(minutiae, dims=512) -> list[float]:
    if not minutiae:
        return [0.0] * dims
    
    dists = []
    n = len(minutiae)
    for i in range(n):
        for j in range(i + 1, n):
            dx = minutiae[i][1] - minutiae[j][1]
            dy = minutiae[i][2] - minutiae[j][2]
            d = math.sqrt(dx*dx + dy*dy)
            dists.append(d)
            
    # Histogram of pairwise distances (max distance approx 500)
    max_dist = 500.0
    hist = [0.0] * dims
    if dists:
        for d in dists:
            bin_idx = int((d / max_dist) * dims)
            if bin_idx >= dims:
                bin_idx = dims - 1
            hist[bin_idx] += 1.0
            
        # Smooth the histogram using a simple Gaussian/moving average to make it robust to noise
        smoothed = [0.0] * dims
        kernel = [0.1, 0.2, 0.4, 0.2, 0.1] # kernel of size 5
        for i in range(dims):
            val = 0.0
            for k_idx, weight in enumerate(kernel):
                offset = k_idx - 2
                j = i + offset
                if 0 <= j < dims:
                    val += hist[j] * weight
            smoothed[i] = val
        
        # Normalize to unit vector
        norm = math.sqrt(sum(x * x for x in smoothed)) or 1.0
        return [x / norm for x in smoothed]
        
    return [0.0] * dims

def cosine_similarity(a, b):
    return sum(x * y for x, y in zip(a, b))

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
            vector = minutiae_to_histogram_vector(minutiae)
            fingerprints.append({
                'name': r.criminal_name,
                'pos': r.finger_position,
                'minutiae': minutiae,
                'vector': vector
            })
            
        print("Histogram Vector Cosine Similarity Matrix:")
        print(f"{'Source':<35} | {'Target':<35} | Cosine")
        print("-" * 82)
        for fp1 in fingerprints:
            for fp2 in fingerprints:
                sim = cosine_similarity(fp1['vector'], fp2['vector'])
                label1 = f"{fp1['name']} ({fp1['pos']})"
                label2 = f"{fp2['name']} ({fp2['pos']})"
                print(f"{label1:<35} | {label2:<35} | {sim:.4f}")
                
        # Now simulate a query with noise (e.g. shift minutiae coordinates slightly, drop 10% of points)
        print("\nTesting robustness of vector with 10% dropped points & coordinate jitter:")
        for fp in fingerprints:
            jittered_minutiae = []
            for m in fp['minutiae']:
                if random.random() < 0.1: # drop 10%
                    continue
                # jitter coordinate by -5 to 5 pixels
                m_type, x, y, angle, q = m
                jx = x + random.randint(-5, 5)
                jy = y + random.randint(-5, 5)
                jittered_minutiae.append((m_type, jx, jy, angle, q))
                
            jittered_vec = minutiae_to_histogram_vector(jittered_minutiae)
            sim = cosine_similarity(fp['vector'], jittered_vec)
            print(f"Original: {fp['name']} ({fp['pos']}) vs Jittered/Dropped: {sim:.4f}")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
