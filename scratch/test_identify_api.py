import asyncio
import os
import sys
import base64
import httpx

scratch_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(scratch_dir, ".."))
sys.path.append(os.path.join(root_dir, "backend/libs/iip-core"))

try:
    import dotenv
    dotenv.load_dotenv(os.path.join(root_dir, ".env"))
except ImportError:
    pass

from sqlalchemy import text
from iip_core.db import build_engine
from iip_core.settings import get_settings

async def get_keycloak_token(settings):
    # Retrieve a token using Keycloak client credentials or password grant for local testing
    from iip_core.keycloak import keycloak_password_grant
    try:
        token_payload = await keycloak_password_grant(
            username=settings.keycloak_admin_username,
            password=settings.keycloak_admin_password,
            settings=settings,
            client_type="web"
        )
        return token_payload["access_token"]
    except Exception as exc:
        print("Could not get Keycloak admin token, trying direct service credentials:", exc)
        # Fallback to keycloak_client_credentials
        from iip_core.keycloak import _token_request
        from iip_core.keycloak import keycloak_client_credentials
        client_id, client_secret = keycloak_client_credentials(settings, "web")
        data = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        }
        res = await _token_request(data, settings)
        return res["access_token"]

async def main():
    settings = get_settings()
    engine = build_engine(settings)
    
    # 1. Fetch Sreejith's template
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT f.template_data, s.criminal_name, f.finger_position
            FROM intelligence.suspect_fingerprints f
            JOIN intelligence.suspects s ON f.suspect_id = s.id
            WHERE s.criminal_name ILIKE '%sreejith%'
            LIMIT 1
        """))
        row = result.fetchone()
        if not row:
            print("Sreejith fingerprint not found in database.")
            await engine.dispose()
            return
        
        template_b64 = base64.b64encode(row.template_data).decode("ascii")
        print(f"Loaded template for Sreejith, finger position: {row.finger_position}")
        
    await engine.dispose()

    # 2. Get JWT Token
    token = await get_keycloak_token(settings)
    print("Successfully retrieved auth token from Keycloak.")

    # 3. Call ML Gateway identify endpoint
    ml_url = "http://localhost:8020/api/v1/ml/fingerprints/identify"
    payload = {
        "templateDataB64": template_b64,
        "fingerPosition": "RIGHT_THUMB" # Simulate mobile app which sends RIGHT_THUMB even for index finger
    }
    
    print(f"Calling ML Gateway identify API at {ml_url}...")
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            ml_url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Response status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            print("Matches returned:")
            for m in data.get("matches", []):
                print(f"  - Name: {m['criminal_name']}, Position: {m['finger_position']}, Score: {m['similarity_score']:.4f}")
            best = data.get("best_match")
            if best:
                print(f"Best Match: {best['criminal_name']} (Score: {best['similarity_score']:.4f})")
            else:
                print("No best match returned.")
        else:
            print("Error response:", res.text)

if __name__ == '__main__':
    asyncio.run(main())
