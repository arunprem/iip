import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://iip_user:iip_secret_password@localhost:5432/iip_db"

async def main():
    engine = create_async_engine(DATABASE_URL)
    async with AsyncSession(engine) as session:
        # Check user office assignments
        print("Checking user office roles/assignments...")
        res = await session.execute(text("""
            SELECT uor.user_id, u.username, uor.office_id, o.office_name, o.office_type_id, o.root_id, o.lft, o.rgt 
            FROM iam.user_office_roles uor
            JOIN iam.users u ON uor.user_id = u.id
            JOIN iam.offices o ON uor.office_id = o.id
        """))
        for row in res.fetchall():
            user_id, username, office_id, name, type_id, root_id, lft, rgt = row
            
            # Query active police stations under this office hierarchy
            stmt = text("""
                SELECT COUNT(*)
                FROM iam.offices
                WHERE root_id = :root_id AND lft >= :lft AND rgt <= :rgt AND office_type_id = 21 AND is_active = True
            """)
            res_ps = await session.execute(stmt, {"root_id": root_id, "lft": lft, "rgt": rgt})
            ps_count = res_ps.scalar()
            
            print(f"User={username} | Office='{name}' | Type={type_id} | Lft={lft} | Rgt={rgt} | Descendant PS Count={ps_count}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
