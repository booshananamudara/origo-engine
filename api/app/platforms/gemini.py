"""
Google Gemini platform adapter.

Uses the official google-genai SDK on the v1beta API, which exposes
both stable (2.x) and preview (3.x) models. Default model: gemini-2.5-flash.

When web grounding is enabled (settings.web_grounding_*), the Google Search
grounding tool is attached so Gemini answers from the live web instead of
training data, and the cited sources are read from grounding_metadata.
"""
import time
import uuid

import structlog
from google import genai
from google.genai import types
from google.genai.errors import ClientError, ServerError

from app.config import settings
from app.models.response import Platform
from app.platforms.base import BasePlatformAdapter, PlatformResponse
from app.platforms.retry import RetryableError, with_retry

logger = structlog.get_logger()

_MODEL = "gemini-2.5-flash"
_INPUT_COST_PER_TOKEN  = 1.25 / 1_000_000   # $1.25 / 1M input tokens (≤200K)
_OUTPUT_COST_PER_TOKEN = 10.00 / 1_000_000  # $10.00 / 1M output tokens (≤200K)


def _grounding_on() -> bool:
    return settings.web_grounding_enabled and settings.web_grounding_gemini


def _extract_gemini_sources(resp) -> list[dict]:
    """Pull cited web sources out of a grounded Gemini response.

    Sources live in candidates[].grounding_metadata.grounding_chunks[].web
    (each with uri/title). Deduped by URL, order preserved.
    """
    sources: list[dict] = []
    seen: set[str] = set()
    for cand in getattr(resp, "candidates", None) or []:
        meta = getattr(cand, "grounding_metadata", None)
        for chunk in getattr(meta, "grounding_chunks", None) or []:
            web = getattr(chunk, "web", None)
            uri = getattr(web, "uri", None) if web else None
            if uri and uri not in seen:
                seen.add(uri)
                sources.append({"url": uri, "title": getattr(web, "title", None)})
    return sources


class GeminiAdapter(BasePlatformAdapter):
    platform = Platform.gemini

    def __init__(self) -> None:
        # v1beta exposes both stable (2.x) and preview (3.x) models; v1 blocks the latter.
        self._client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options={"api_version": "v1beta"},
        )

    async def complete(
        self, prompt_text: str, client_id: uuid.UUID, model: str | None = None
    ) -> PlatformResponse:
        resolved_model = model or _MODEL
        log = logger.bind(platform="gemini", client_id=str(client_id), model=resolved_model)
        start = time.monotonic()

        response_text, input_tokens, output_tokens, sources = await self._call_api(
            prompt_text, log, resolved_model
        )

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
            latency_ms=latency_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 6) if cost else None,
            grounded=_grounding_on(),
            sources=len(sources),
        )
        return PlatformResponse(
            platform=Platform.gemini,
            raw_response=response_text,
            model_used=resolved_model,
            latency_ms=latency_ms,
            tokens_used=total_tokens,
            cost_usd=cost,
            sources=sources or None,
        )

    @with_retry
    async def _call_api(
        self, prompt_text: str, log, model: str
    ) -> tuple[str, int | None, int | None, list[dict]]:
        config = None
        if _grounding_on():
            config = types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())]
            )
        try:
            resp = await self._client.aio.models.generate_content(
                model=model,
                contents=prompt_text,
                config=config,
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
        return text, input_tokens, output_tokens, _extract_gemini_sources(resp)
