import asyncio
import os
import httpx
from iip_core.db import init_db, get_db_context
from iip_core.settings import BaseServiceSettings
from sqlalchemy import text
from iam_svc.services.fingerprint_ml_client import index_submitted_fingerprint
from iip_core.auth import create_access_token
from iip_core.settings import ClassificationLevel

async def main():
    settings = BaseServiceSettings(
        environment="local",
        service_name="test-iam-svc",
        database_url="postgresql+asyncpg://iip_user:iip_secret_password@localhost:5432/iip_db"
    )
    init_db(settings)
    
    # Generate a mock system admin token to call the index-submitted endpoint
    token_claims = {
        "sub": "d2387e33-40e6-42af-8e58-ac548d9e390e", # Admin user ID from DB
        "username": "admin",
        "roles": ["SYSTEM_ADMIN"],
        "groups": ["Information Technology Wing"],
        "clearance_level": "CONFIDENTIAL",
        "jti": "system-admin-jti",
        "jit_elevated": False
    }
    token = create_access_token(token_claims, settings)
    
    async with get_db_context() as session:
        # Get approved submissions
        res = await session.execute(
            text("SELECT * FROM intelligence.suspect_fingerprint_submissions WHERE status = 'APPROVED'")
        )
        submissions = res.mappings().all()
        print(f"Found {len(submissions)} approved submissions.")
        
        for sub in submissions:
            print(f"Re-indexing Submission ID: {sub['id']}, Criminal: {sub['criminal_name']}")
            success = await index_submitted_fingerprint(
                access_token=token,
                suspect_id=str(sub['master_suspect_id']),
                dossier_draft_id=str(sub['dossier_id']), # or whatever draft ID
                template_id=str(sub['template_id']),
                print_id=str(sub['print_id']),
                finger_position=sub['finger_position'],
                template_bytes=sub['template_data'],
                criminal_name=sub['criminal_name'] or "",
                template_format=sub['template_format'],
                quality_score=sub['quality_score'],
                device_model=sub['device_model']
            )
            print(f"Result for {sub['id']}: {success}")

if __name__ == '__main__':
    asyncio.run(main())
