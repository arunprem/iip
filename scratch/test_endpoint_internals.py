import asyncio
import uuid
import sys
import os

# Add service directory to Python path
sys.path.append("/Volumes/dev/kp-inteligence/backend/services/iam-svc")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from iam_svc.routers.offices import list_descendant_police_stations

DATABASE_URL = "postgresql+asyncpg://iip_user:iip_secret_password@localhost:5432/iip_db"

async def main():
    engine = create_async_engine(DATABASE_URL)
    async with AsyncSession(engine) as session:
        # KERALA STATE office id
        office_id = uuid.UUID("25c14897-4941-40c6-ad0f-ae61c3c08f24")
        print("Calling list_descendant_police_stations internally...")
        try:
            res = await list_descendant_police_stations(office_id, session)
            print(f"Success! Result: {res}")
        except Exception as e:
            print("\n--- Python Exception Stack Trace ---")
            import traceback
            traceback.print_exc()

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
