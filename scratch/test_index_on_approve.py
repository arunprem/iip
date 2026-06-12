import asyncio
import os
import sys
import base64
import httpx

scratch_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(scratch_dir, ".."))
sys.path.append(os.path.join(root_dir, "backend/libs/iip-core"))
sys.path.append(os.path.join(root_dir, "backend/services/iam-svc"))

try:
    import dotenv
    dotenv.load_dotenv(os.path.join(root_dir, ".env"))
except ImportError:
    pass

from sqlalchemy import text
from iip_core.db import build_engine
from iip_core.settings import get_settings
from test_identify_api import get_keycloak_token

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    # Get a submission to test with
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT id, suspect_id, dossier_id, master_suspect_id, template_id, print_id, 
                   finger_position, template_data, criminal_name, template_format, 
                   quality_score, device_model
            FROM intelligence.suspect_fingerprint_submissions
            LIMIT 1
        """))
        row = result.fetchone()
        if not row:
            print("No submissions found to test with.")
            await engine.dispose()
            return
            
        print(f"Loaded submission for {row.criminal_name}...")
        
    await engine.dispose()
    
    # Get Keycloak auth token
    token = await get_keycloak_token(settings)
    
    # Simulate the index_submitted_fingerprint call
    payload = {
        "suspectId": str(row.suspect_id),
        "dossierDraftId": str(row.dossier_id),
        "templateId": str(row.template_id),
        "printId": str(row.print_id),
        "fingerPosition": row.finger_position,
        "templateFormat": row.template_format,
        "templateDataB64": base64.b64encode(row.template_data).decode("ascii"),
        "criminalName": row.criminal_name,
        "qualityScore": row.quality_score,
        "deviceModel": row.device_model,
    }
    
    ml_url = "http://localhost:8020/api/v1/ml/fingerprints/index-submitted"
    print(f"Calling index-submitted endpoint at {ml_url}...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            ml_url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Response status: {res.status_code}")
        print(f"Response body: {res.text}")

if __name__ == '__main__':
    asyncio.run(main())
