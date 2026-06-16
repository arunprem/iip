import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        # Office 1: KERALA STATE (ID=25c14897-4941-40c6-ad0f-ae61c3c08f24)
        kerala_state_id = "25c14897-4941-40c6-ad0f-ae61c3c08f24"
        print(f"Calling endpoint with X-Office-Id: KERALA STATE ({kerala_state_id})...")
        res = await client.get(
            "http://localhost:8010/api/v1/iam/offices/descendant-police-stations",
            headers={"X-Office-Id": kerala_state_id}
        )
        print(f"Status: {res.status_code}")
        print(f"Response snippet: {res.text[:300]}")

        # Office 2: ADGP OFFICE (ID=5b81b09a-f351-4b41-9847-6a82686aaa6e)
        adgp_id = "5b81b09a-f351-4b41-9847-6a82686aaa6e"
        print(f"\nCalling endpoint with X-Office-Id: ADGP OFFICE ({adgp_id})...")
        res = await client.get(
            "http://localhost:8010/api/v1/iam/offices/descendant-police-stations",
            headers={"X-Office-Id": adgp_id}
        )
        print(f"Status: {res.status_code}")
        print(f"Response snippet: {res.text[:300]}")

if __name__ == "__main__":
    asyncio.run(main())
