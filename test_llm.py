import asyncio
import httpx
import json

async def main():
    async with httpx.AsyncClient() as client:
        res = await client.post("http://localhost:8010/api/v1/auth/login", json={
            "username": "admin",
            "password": "admin"
        })
        token = res.json()["access_token"]
        
        print("Sending chat request to ML Gateway...")
        res = await client.post("http://localhost:8020/api/v1/ml/chat/", json={
            "messages": [{"role": "user", "content": "Hello! What is your name?"}],
            "mode": "analyst"
        }, headers={"Authorization": f"Bearer {token}"}, timeout=120)
        
        print(f"Status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))

if __name__ == "__main__":
    asyncio.run(main())
