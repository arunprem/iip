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
                SELECT id, suspect_id, master_suspect_id, finger_position, status, review_notes
                FROM intelligence.suspect_fingerprint_submissions
            """))
            rows = result.fetchall()
            print(f"Total fingerprint submissions in DB: {len(rows)}")
            for row in rows:
                print(f"ID: {row.id}, Suspect ID: {row.suspect_id}, Master ID: {row.master_suspect_id}, Finger: {row.finger_position}, Status: {row.status}, Notes: {row.review_notes}")
    except Exception as exc:
        print("Error:", exc)
    finally:
        await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
