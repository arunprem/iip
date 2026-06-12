import asyncio
from sqlalchemy import text
from iip_core.db import build_engine
from iip_core.settings import get_settings

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("""
                SELECT id, master_suspect_id, suspect_id, status, link_status
                FROM intelligence.suspect_dossiers
            """))
            rows = result.fetchall()
            print(f"Total dossiers in DB: {len(rows)}")
            for row in rows:
                print(f"Dossier ID: {row.id}, Master ID: {row.master_suspect_id}, Suspect ID: {row.suspect_id}, Status: {row.status}, Link Status: {row.link_status}")
    except Exception as exc:
        print("Error:", exc)
    finally:
        await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
