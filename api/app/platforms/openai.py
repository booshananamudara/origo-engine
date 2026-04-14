"""
OpenAI platform adapter.

Uses the official openai SDK. Model: gpt-4o.
"""
import time
import uuid

import structlog
from openai import AsyncOpenAI, APIStatusError

from app.config import settings
from app.models.response import Platform
from app.platforms.base import BasePlatformAdapter, PlatformResponse
from app.platforms.retry import RetryableError, with_retry

logger = structlog.get_logger()

_MODEL = "gpt-4o"
# gpt-4o pricing (as of mid-2024): $2.50/1M input, $10.00/1M output
_INPUT_COST_PER_TOKEN = 2.50 / 1_000_000
_OUTPUT_COST_PER_TOKEN = 10.00 / 1_000_000


class OpenAIAdapter(BasePlatformAdapter):
    platform = Platform.openai

    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def complete(self, prompt_text: str, client_id: uuid.UUID) -> PlatformResponse:
        log = logger.bind(platform="openai", client_id=str(client_id))
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
            platform=Platform.openai,
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
            resp = await self._client.chat.completions.create(
                model=_MODEL,
                messages=[{"role": "user", "content": prompt_text}],
                temperature=0.7,
            )
        except APIStatusError as exc:
            if exc.status_code == 429 or exc.status_code >= 500:
                raise RetryableError(exc.status_code, str(exc.message)[:200]) from exc
            raise

        content = resp.choices[0].message.content or ""
        input_tokens = resp.usage.prompt_tokens if resp.usage else None
        output_tokens = resp.usage.completion_tokens if resp.usage else None
        return content, input_tokens, output_tokens
