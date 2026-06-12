import asyncio
import uuid
from iip_core.db import build_engine
from iip_core.settings import get_settings
from iam_svc.repositories.mobile_map_repository import MobileMapRepository

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    # Master IDs from DB:
    master_ids = [
        "5e2982bf-8be0-409c-bc6e-237cda63e53b", # Arunprem
        "b2311c67-4b0b-47e4-aefd-d96dd3ad2c5a", # Mammoty 2
        "5c250e28-15fa-4c07-a5d8-bf20aa09d627", # SIJO T ANTONY
    ]
    
    try:
        async with engine.begin() as conn:
            # We construct MobileMapRepository with an active session
            from sqlalchemy.ext.asyncio import AsyncSession
            session = AsyncSession(conn)
            repo = MobileMapRepository(session)
            
            for m_id_str in master_ids:
                m_id = uuid.UUID(m_id_str)
                resolved = await repo.resolve_frs_dossier_id(suspect_id=m_id)
                print(f"Master ID: {m_id_str} -> Resolved Dossier ID: {resolved}")
    except Exception as exc:
        print("Error:", exc)
    finally:
        await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
