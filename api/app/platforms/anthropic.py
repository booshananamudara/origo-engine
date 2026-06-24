"""
Anthropic platform adapter.

Uses the official anthropic SDK. Default model: claude-haiku-4-5-20251001.
Only Claude 4.x models are available on this account tier; all Claude 3.x
models return not_found_error for new API keys.

When web grounding is enabled (settings.web_grounding_*), the server-side
web-search tool is attached so Claude answers from the live web instead of
training data. The server runs its own search loop; if it hits the iteration
cap it returns stop_reason="pause_turn" and we re-send to resume.
"""
import time
import uuid

import structlog
from anthropic import AsyncAnthropic, APIStatusError

from app.config import settings
from app.models.response import Platform
from app.platforms.base import BasePlatformAdapter, PlatformResponse
from app.platforms.model_registry import get_anthropic_web_search_tool
from app.platforms.retry import RetryableError, with_retry

logger = structlog.get_logger()

_MODEL = "claude-haiku-4-5-20251001"
# claude-haiku-4-5 pricing: $0.80/1M input, $4.00/1M output
_INPUT_COST_PER_TOKEN = 0.80 / 1_000_000
_OUTPUT_COST_PER_TOKEN = 4.00 / 1_000_000
_MAX_TOKENS = 2048
# Cap how many times we resume after a pause_turn, to bound the server-tool loop.
_MAX_CONTINUATIONS = 5


def _grounding_on() -> bool:
    return settings.web_grounding_enabled and settings.web_grounding_anthropic


def _extract_text_and_sources(content_blocks) -> tuple[str, list[dict]]:
    """Pull joined text and cited web sources out of a response's content blocks.

    A grounded response interleaves `text`, `server_tool_use`, and
    `web_search_tool_result` blocks. Source URLs live in the result blocks
    (`.content` is a list of web_search_result items, or an error object).
    """
    text_parts: list[str] = []
    sources: list[dict] = []
    for block in content_blocks or []:
        btype = getattr(block, "type", None)
        if btype == "text":
            text_parts.append(getattr(block, "text", "") or "")
        elif btype == "web_search_tool_result":
            results = getattr(block, "content", None)
            if not isinstance(results, list):
                continue  # error object, not a result list
            for r in results:
                url = getattr(r, "url", None)
                if url:
                    sources.append({"url": url, "title": getattr(r, "title", None)})
    return "".join(text_parts), sources


class AnthropicAdapter(BasePlatformAdapter):
    platform = Platform.anthropic

    def __init__(self) -> None:
        self._client = AsyncAnthropic(api_key=(settings.anthropic_api_key or "").strip())

    async def complete(
        self, prompt_text: str, client_id: uuid.UUID, model: str | None = None
    ) -> PlatformResponse:
        resolved_model = model or _MODEL
        log = logger.bind(platform="anthropic", client_id=str(client_id), model=resolved_model)
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
            platform=Platform.anthropic,
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
        grounded = _grounding_on()
        tools = (
            [get_anthropic_web_search_tool(model, settings.web_search_max_uses)]
            if grounded
            else []
        )
        messages: list[dict] = [{"role": "user", "content": prompt_text}]

        text_parts: list[str] = []
        sources: list[dict] = []
        input_tokens = 0
        output_tokens = 0

        # Resume loop: the server-side web-search loop may pause (pause_turn);
        # re-send the accumulated turns to let it continue. No-op when ungrounded.
        for _ in range(_MAX_CONTINUATIONS + 1):
            try:
                resp = await self._client.messages.create(
                    model=model,
                    max_tokens=_MAX_TOKENS,
                    messages=messages,
                    tools=tools,
                )
            except APIStatusError as exc:
                if exc.status_code == 429 or exc.status_code >= 500:
                    raise RetryableError(exc.status_code, str(exc.message)[:200]) from exc
                raise

            turn_text, turn_sources = _extract_text_and_sources(resp.content)
            if turn_text:
                text_parts.append(turn_text)
            sources.extend(turn_sources)
            if resp.usage:
                input_tokens += resp.usage.input_tokens or 0
                output_tokens += resp.usage.output_tokens or 0

            if resp.stop_reason != "pause_turn":
                break
            # Resume: replay this turn's assistant content and call again.
            messages.append({"role": "assistant", "content": resp.content})

        # Dedupe sources by URL, preserving order.
        seen: set[str] = set()
        deduped = [s for s in sources if not (s["url"] in seen or seen.add(s["url"]))]
        return "".join(text_parts), input_tokens, output_tokens, deduped
