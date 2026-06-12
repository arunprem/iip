import asyncio
import os
import sys
import httpx

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
    
    # 1. Clear Elasticsearch index
    print("Clearing Elasticsearch fingerprint index...")
    async with httpx.AsyncClient() as client:
        try:
            res = await client.delete("http://localhost:9200/iip-suspect-fingerprints")
            print(f"Elasticsearch response: {res.status_code} - {res.text}")
        except Exception as exc:
            print("Could not delete Elasticsearch index:", exc)
            
    # 2. Truncate Postgres tables
    print("Truncating PostgreSQL tables...")
    try:
        async with engine.begin() as conn:
            # We truncate suspect_fingerprints and submissions
            await conn.execute(text("TRUNCATE intelligence.suspect_fingerprints CASCADE"))
            print("Truncated suspect_fingerprints table.")
            await conn.execute(text("TRUNCATE intelligence.suspect_fingerprint_submissions CASCADE"))
            print("Truncated suspect_fingerprint_submissions table.")
            print("PostgreSQL tables cleared successfully!")
    except Exception as exc:
        print("Failed to truncate database tables:", exc)
        
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
