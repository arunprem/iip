import asyncio
from sqlalchemy import text
from iip_core.db import build_engine
from iip_core.settings import get_settings

async def main():
    settings = get_settings()
    print("Database URL:", settings.database_url)
    engine = build_engine(settings)
    
    try:
        async with engine.begin() as conn:
            print("Attempting to run CREATE TABLE DDL...")
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS intelligence.quick_suspect_captures (
                    id           UUID PRIMARY KEY,
                    name         VARCHAR(255) NOT NULL,
                    storage_key  VARCHAR(512) NOT NULL,
                    latitude     NUMERIC(10, 7),
                    longitude    NUMERIC(10, 7),
                    captured_by  UUID REFERENCES iam.users(id) ON DELETE SET NULL,
                    captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    used         BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_quick_suspects_captured_by ON intelligence.quick_suspect_captures (captured_by);
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_quick_suspects_used ON intelligence.quick_suspect_captures (used);
            """))
            print("Successfully created table and indexes!")
    except Exception as exc:
        print("Error during CREATE TABLE DDL:", exc)
    finally:
        await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
