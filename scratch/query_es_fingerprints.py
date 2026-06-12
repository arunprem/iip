import asyncio
from elasticsearch import AsyncElasticsearch
from ml_gateway_svc.settings import get_ml_settings

async def main():
    settings = get_ml_settings()
    es = AsyncElasticsearch(settings.elasticsearch_url)
    try:
        res = await es.search(index=settings.fingerprint_index_name, body={"query": {"match_all": {}}}, size=100)
        hits = res.get("hits", {}).get("hits", [])
        print(f"Total documents in {settings.fingerprint_index_name}: {len(hits)}")
        for hit in hits:
            source = hit["_source"]
            # Exclude long embedding array for readability
            source_print = {k: v for k, v in source.items() if k != "fingerprint_embedding"}
            print(f"ID: {hit['_id']}, Source: {source_print}")
    except Exception as exc:
        print("Error querying ES:", exc)
    finally:
        await es.close()

if __name__ == '__main__':
    asyncio.run(main())
