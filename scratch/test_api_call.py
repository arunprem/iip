import asyncio
import httpx
import json

async def main():
    async with httpx.AsyncClient() as client:
        # 1. Login
        print("Logging in...")
        res = await client.post("http://localhost:8010/api/v1/auth/login", json={
            "username": "admin",
            "password": "admin"
        })
        if res.status_code != 200:
            print(f"Login failed: {res.status_code} | {res.text}")
            return
        
        login_data = res.json()
        token = login_data["access_token"]
        print("Logged in successfully.")

        # Let's see the assigned offices
        print("\nUser assigned offices in token payload/response:")
        user_info = login_data.get("user", {})
        offices = user_info.get("offices", [])
        for o in offices:
            print(f"  - Office Name: {o.get('office_name')} | ID: {o.get('office_id')}")

        # Let's test calling descendant-police-stations for each office
        for o in offices:
            office_name = o.get("office_name")
            office_id = o.get("office_id")
            print(f"\nRequesting descendant PS list using Office '{office_name}' (ID={office_id})...")
            
            headers = {
                "Authorization": f"Bearer {token}",
                "X-Office-Id": office_id
            }
            res_api = await client.get(
                "http://localhost:8010/api/v1/iam/offices/descendant-police-stations", 
                headers=headers
            )
            print(f"Status: {res_api.status_code}")
            try:
                data = res_api.json()
                print(f"Response (first 5 items): {data[:5]}")
                print(f"Total count: {len(data)}")
            except Exception as e:
                print(f"Failed to parse JSON: {e} | Text: {res_api.text}")

if __name__ == "__main__":
    asyncio.run(main())
