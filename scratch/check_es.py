import asyncio
from elasticsearch import AsyncElasticsearch

async def main():
    es = AsyncElasticsearch("http://localhost:9200")
    try:
        if not await es.indices.exists(index="iip-suspect-fingerprints"):
            print("Index iip-suspect-fingerprints does not exist!")
            return
        
        response = await es.search(
            index="iip-suspect-fingerprints",
            query={"match_all": {}},
            size=100
        )
        hits = response.get("hits", {}).get("hits", [])
        print(f"Total documents in iip-suspect-fingerprints: {len(hits)}")
        for i, hit in enumerate(hits):
            src = hit.get("_source", {})
            print(f"{i+1}. Print ID: {src.get('print_id')}, Suspect ID: {src.get('suspect_id')}, Name: {src.get('criminal_name')}, Position: {src.get('finger_position')}")
    except Exception as e:
        print(f"Error checking ES: {e}")
    finally:
        await es.close()

if __name__ == '__main__':
    asyncio.run(main())
