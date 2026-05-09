"""
Redis-backed per-platform rate limiter.

Uses a sliding 60-second window counter per platform.
Fails open if Redis is unavailable so a Redis outage never blocks pipeline execution.
"""
import asyncio
import random
from typing import Optional

import structlog

logger = structlog.get_logger()

# Conservative per-minute request limits (tune upward after observing real usage)
_PLATFORM_LIMITS: dict[str, int] = {
    "openai": 500,
    "anthropic": 500,
    "perplexity": 50,
    "gemini": 60,
}

_redis_client = None


def _get_async_redis():
    """Lazy-init async Redis client (singleton)."""
    global _redis_client
    if _redis_client is None:
        try:
            from redis.asyncio import Redis

            from app.config import settings

            _redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
        except Exception:
            return None
    return _redis_client


async def acquire_platform_token(platform: str) -> None:
    """
    Reserve a request token for the platform.
    Blocks (with backoff) if the per-minute limit is reached.
    Fails open if Redis is unavailable.
    """
    r = _get_async_redis()
    if r is None:
        return

    limit = _PLATFORM_LIMITS.get(platform, 100)
    key = f"platform_rl:{platform}:minute"
    max_wait_iterations = 60

    for attempt in range(max_wait_iterations):
        try:
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, 60)
            results = await pipe.execute()
            count = results[0]

            if count <= limit:
                return  # Token acquired

            # Back-pressure: sleep with jitter, then retry
            sleep_time = min(1.0 * (1.2 ** attempt), 15.0) + random.uniform(0, 0.3)
            logger.warning(
                "platform_rate_limit_waiting",
                platform=platform,
                count=count,
                limit=limit,
                sleep_s=round(sleep_time, 2),
            )
            await asyncio.sleep(sleep_time)

        except Exception as exc:
            logger.warning("platform_rate_limiter_unavailable", platform=platform, error=str(exc))
            return  # Fail open
