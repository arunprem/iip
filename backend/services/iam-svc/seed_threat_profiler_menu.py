import asyncio
from sqlalchemy import text
from iip_core.settings import get_settings
from iip_core.db import init_db, get_db

async def main():
    settings = get_settings()
    init_db(settings)
    db_gen = get_db()
    db = await anext(db_gen)
    
    try:
        print("Seeding AI Threat Profiler menu and privileges...")
        
        # 1. Insert privilege
        priv_sql = """
        INSERT INTO iam.privileges (id, privilege_code, name, description, module, privilege_type, is_active)
        VALUES (
            '507119ff-3592-482d-862d-94bb9162ab8f', 
            'menu:threat-profiler', 
            'Threat Profiler', 
            'Access AI Threat Profiler module', 
            'Menu', 
            'MENU', 
            TRUE
        )
        ON CONFLICT (privilege_code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description
        RETURNING id;
        """
        res = await db.execute(text(priv_sql))
        priv_id = res.scalar()
        print(f"Privilege seeded with ID: {priv_id}")
        
        # 2. Insert menu under 'analytics' group
        menu_sql = """
        INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id, is_active)
        VALUES (
            'threat-profiler',
            'Threat Profiler',
            '/threat-profiler',
            'Radar',
            'Menu',
            44,
            (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:threat-profiler'),
            FALSE,
            (SELECT id FROM iam.menus WHERE menu_key = 'analytics'),
            TRUE
        )
        ON CONFLICT (menu_key) DO UPDATE SET
            label = EXCLUDED.label,
            path = EXCLUDED.path,
            icon = EXCLUDED.icon,
            sort_order = EXCLUDED.sort_order,
            privilege_id = EXCLUDED.privilege_id,
            parent_id = EXCLUDED.parent_id
        RETURNING id;
        """
        res = await db.execute(text(menu_sql))
        menu_id = res.scalar()
        print(f"Menu seeded with ID: {menu_id}")
        
        # 3. Grant to roles
        grant_sql = """
        INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
        SELECT r.id, p.id
        FROM iam.roles r
        CROSS JOIN iam.privileges p
        WHERE r.role_name IN ('SYSTEM_ADMIN', 'ANALYST', 'SUPERVISOR')
          AND p.privilege_code = 'menu:threat-profiler'
        ON CONFLICT DO NOTHING;
        """
        res = await db.execute(text(grant_sql))
        print("Privileges successfully granted to roles (SYSTEM_ADMIN, ANALYST, SUPERVISOR).")
        
        await db.commit()
        print("Transaction committed successfully.")
        
    except Exception as e:
        await db.rollback()
        print(f"Error seeding menu/privileges: {e}")
        raise e
    finally:
        await db_gen.aclose()

if __name__ == "__main__":
    asyncio.run(main())
