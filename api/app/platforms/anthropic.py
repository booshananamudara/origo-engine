"""
Anthropic platform adapter.

Uses the official anthropic SDK. Model: claude-haiku-4-5-20251001.
Only Claude 4.x models are available on this account tier; all Claude 3.x
models return not_found_error for new API keys.
"""
import time
import uuid

import structlog
from anthropic import AsyncAnthropic, APIStatusError

from app.config import settings
from app.models.response import Platform
from app.platforms.base import BasePlatformAdapter, PlatformResponse
from app.platforms.retry import RetryableError, with_retry

logger = structlog.get_logger()

_MODEL = "claude-haiku-4-5-20251001"
# claude-haiku-4-5 pricing: $0.80/1M input, $4.00/1M output
_INPUT_COST_PER_TOKEN = 0.80 / 1_000_000
_OUTPUT_COST_PER_TOKEN = 4.00 / 1_000_000
_MAX_TOKENS = 2048


class AnthropicAdapter(BasePlatformAdapter):
    platform = Platform.anthropic

    def __init__(self) -> None:
        self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def complete(self, prompt_text: str, client_id: uuid.UUID) -> PlatformResponse:
        log = logger.bind(platform="anthropic", client_id=str(client_id))
        start = time.monotonic()

        response_text, input_tokens, output_tokens = await self._call_api(prompt_text, log)

        latency_ms = int((time.monotonic() - start) * 1000)
        cost = (
            input_tokens * _INPUT_COST_PER_TOKEN + output_tokens * _OUTPUT_COST_PER_TOKEN
            if input_tokens is not None
            else None
        )
        total_tokens = (
            (input_tokens or 0) + (output_tokens or 0)
            if input_tokens is not None
            else None
        )

        log.info(
            "platform_complete",
            model=_MODEL,
            latency_ms=latency_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 6) if cost else None,
        )
        return PlatformResponse(
            platform=Platform.anthropic,
            raw_response=response_text,
            model_used=_MODEL,
            latency_ms=latency_ms,
            tokens_used=total_tokens,
            cost_usd=cost,
        )

    @with_retry
    async def _call_api(
        self, prompt_text: str, log
    ) -> tuple[str, int | None, int | None]:
        try:
            resp = await self._client.messages.create(
                model=_MODEL,
                max_tokens=_MAX_TOKENS,
                messages=[{"role": "user", "content": prompt_text}],
            )
        except APIStatusError as exc:
            if exc.status_code == 429 or exc.status_code >= 500:
                raise RetryableError(exc.status_code, str(exc.message)[:200]) from exc
            raise

        content = resp.content[0].text if resp.content else ""
        input_tokens = resp.usage.input_tokens if resp.usage else None
        output_tokens = resp.usage.output_tokens if resp.usage else None
        return content, input_tokens, output_tokens
