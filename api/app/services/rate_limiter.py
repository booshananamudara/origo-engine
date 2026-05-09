"""
Simple Redis-backed rate limiter for login endpoints.

Policy: 5 failed-attempt equivalent calls per email per 15-minute window.
Uses a sliding counter with TTL. If Redis is unavailable, fails open
(login proceeds) so a Redis outage doesn't lock out all users.
"""
import structlog
from fastapi import HTTPException, status

from app.config import settings

logger = structlog.get_logger()

_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 15 * 60  # 15 minutes


def _get_client():
    """Return a synchronous Redis client (lazy init)."""
    try:
        import redis as redis_lib
        return redis_lib.from_url(settings.redis_url, decode_responses=True, socket_timeout=1)
    except Exception:
        return None


async def check_rate_limit(key: str, ip: str) -> None:
    """
    Increment the attempt counter for this key.
    Raises HTTP 429 if the limit is exceeded.
    Fails open if Redis is unavailable.
    """
    try:
        r = _get_client()
        if r is None:
            return

        full_key = f"rl:{key}"
        pipe = r.pipeline()
        pipe.incr(full_key)
        pipe.expire(full_key, _WINDOW_SECONDS)
        results = pipe.execute()
        count = results[0]

        if count > _MAX_ATTEMPTS:
            logger.warning("rate_limit_exceeded", key=key, ip=ip, count=count)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many login attempts. Please wait 15 minutes before trying again.",
                headers={"Retry-After": str(_WINDOW_SECONDS)},
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Redis unavailable — fail open so users aren't locked out
        logger.warning("rate_limiter_unavailable", error=str(exc))
