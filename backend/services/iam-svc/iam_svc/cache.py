from typing import AsyncGenerator
import redis.asyncio as redis
from iip_core.settings import get_settings

async def get_redis() -> AsyncGenerator[redis.Redis, None]:
    settings = get_settings()
    redis_url = str(settings.redis_url)
    client = redis.from_url(redis_url, decode_responses=False)
    try:
        yield client
    finally:
        await client.aclose()
