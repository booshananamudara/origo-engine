"""
Perplexity platform adapter.

Uses raw httpx (no official SDK) against the OpenAI-compatible chat completions endpoint.
Model: sonar (Perplexity's default web-search model).
"""
import time
import uuid

import httpx
import structlog

from app.config import settings
from app.models.response import Platform
from app.platforms.base import BasePlatformAdapter, PlatformResponse
from app.platforms.retry import RetryableError, with_retry

logger = structlog.get_logger()

_BASE_URL = "https://api.perplexity.ai"
_MODEL = "sonar"
# Approximate cost: $1 per 1M tokens (input+output blended)
_COST_PER_TOKEN = 1.0 / 1_000_000


class PerplexityAdapter(BasePlatformAdapter):
    platform = Platform.perplexity

    def __init__(self) -> None:
        self._api_key = settings.perplexity_api_key

    async def complete(self, prompt_text: str, client_id: uuid.UUID) -> PlatformResponse:
        log = logger.bind(platform="perplexity", client_id=str(client_id))
        start = time.monotonic()

        response_text, tokens = await self._call_api(prompt_text, log)

        latency_ms = int((time.monotonic() - start) * 1000)
        cost = tokens * _COST_PER_TOKEN if tokens else None

        log.info(
            "platform_complete",
            model=_MODEL,
            latency_ms=latency_ms,
            tokens=tokens,
            cost_usd=round(cost, 6) if cost else None,
        )
        return PlatformResponse(
            platform=Platform.perplexity,
            raw_response=response_text,
            model_used=_MODEL,
            latency_ms=latency_ms,
            tokens_used=tokens,
            cost_usd=cost,
        )

    @with_retry
    async def _call_api(self, prompt_text: str, log) -> tuple[str, int | None]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": _MODEL,
            "messages": [{"role": "user", "content": prompt_text}],
        }

        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=60.0) as client:
            resp = await client.post("/chat/completions", headers=headers, json=payload)

        if resp.status_code == 429 or resp.status_code >= 500:
            raise RetryableError(resp.status_code, resp.text[:200])
        if resp.status_code >= 400:
            log.error("platform_client_error", status=resp.status_code, body=resp.text[:200])
            resp.raise_for_status()

        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        tokens = data.get("usage", {}).get("total_tokens")
        return content, tokens
