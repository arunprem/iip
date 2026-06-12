import asyncio
from iip_core.db import init_db, get_db_context
from iip_core.settings import BaseServiceSettings
from sqlalchemy import text

async def main():
    settings = BaseServiceSettings(
        environment="local",
        service_name="test-iam-svc",
        database_url="postgresql+asyncpg://iip_user:iip_secret_password@localhost:5432/iip_db"
    )
    init_db(settings)
    
    async with get_db_context() as session:
        # Check suspect_fingerprints
        res = await session.execute(text("SELECT id, suspect_id, dossier_id, finger_position, template_hash FROM intelligence.suspect_fingerprints"))
        rows = res.all()
        print(f"Postgres - suspect_fingerprints table has {len(rows)} records:")
        for r in rows:
            print(r)
            
        # Check suspect_fingerprint_submissions
        res2 = await session.execute(text("SELECT id, suspect_id, status, reviewed_at, approved_fingerprint_id FROM intelligence.suspect_fingerprint_submissions"))
        rows2 = res2.all()
        print(f"Postgres - suspect_fingerprint_submissions table has {len(rows2)} records:")
        for r in rows2:
            print(r)

if __name__ == '__main__':
    asyncio.run(main())
