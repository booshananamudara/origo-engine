"""
Google Gemini platform adapter.

Uses the official google-genai SDK. Model: gemini-1.5-flash.
gemini-2.0-flash is not available to new API key holders; 1.5-flash is
stable and available to all accounts.
Pricing: $0.075/1M input tokens, $0.30/1M output tokens.
"""
import time
import uuid

import structlog
from google import genai
from google.genai.errors import ClientError, ServerError

from app.config import settings
from app.models.response import Platform
from app.platforms.base import BasePlatformAdapter, PlatformResponse
from app.platforms.retry import RetryableError, with_retry

logger = structlog.get_logger()

_MODEL = "gemini-1.5-flash"
_INPUT_COST_PER_TOKEN  = 0.075 / 1_000_000  # $0.075 / 1M input tokens
_OUTPUT_COST_PER_TOKEN = 0.300 / 1_000_000  # $0.30  / 1M output tokens


class GeminiAdapter(BasePlatformAdapter):
    platform = Platform.gemini

    def __init__(self) -> None:
        self._client = genai.Client(api_key=settings.gemini_api_key)

    async def complete(self, prompt_text: str, client_id: uuid.UUID) -> PlatformResponse:
        log = logger.bind(platform="gemini", client_id=str(client_id))
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
            platform=Platform.gemini,
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
            resp = await self._client.aio.models.generate_content(
                model=_MODEL,
                contents=prompt_text,
            )
        except ClientError as exc:
            if exc.code == 429:
                raise RetryableError(429, str(exc)[:200]) from exc
            raise
        except ServerError as exc:
            raise RetryableError(500, str(exc)[:200]) from exc

        text = resp.text or ""
        usage = getattr(resp, "usage_metadata", None)
        input_tokens  = getattr(usage, "prompt_token_count", None) if usage else None
        output_tokens = getattr(usage, "candidates_token_count", None) if usage else None
        return text, input_tokens, output_tokens
