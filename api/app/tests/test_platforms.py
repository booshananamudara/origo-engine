"""
Unit tests for platform adapters.
All external API calls are mocked — no real credits consumed.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.models.response import Platform
from app.platforms import all_platforms, get_adapter
from app.platforms.base import PlatformResponse
from app.platforms.perplexity import PerplexityAdapter
from app.platforms.openai import OpenAIAdapter
from app.platforms.anthropic import AnthropicAdapter
from app.platforms.retry import RetryableError

CLIENT_ID = uuid.uuid4()

# ── Helpers ───────────────────────────────────────────────────────────────────

def _perplexity_response(content: str, total_tokens: int = 100) -> dict:
    return {
        "choices": [{"message": {"content": content}}],
        "usage": {"total_tokens": total_tokens},
    }


# ── Registry ──────────────────────────────────────────────────────────────────

def test_registry_has_all_three_platforms():
    platforms = all_platforms()
    assert Platform.perplexity in platforms
    assert Platform.openai in platforms
    assert Platform.anthropic in platforms


def test_get_adapter_returns_correct_type():
    assert isinstance(get_adapter(Platform.perplexity), PerplexityAdapter)
    assert isinstance(get_adapter(Platform.openai), OpenAIAdapter)
    assert isinstance(get_adapter(Platform.anthropic), AnthropicAdapter)


def test_get_adapter_unknown_platform_raises():
    with pytest.raises(ValueError, match="No adapter registered"):
        get_adapter("unknown_platform")  # type: ignore[arg-type]


# ── Perplexity ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_perplexity_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = _perplexity_response("Acme is a great tool.", 150)

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        adapter = PerplexityAdapter()
        result = await adapter.complete("What is the best analytics tool?", CLIENT_ID)

    assert isinstance(result, PlatformResponse)
    assert result.platform == Platform.perplexity
    assert result.raw_response == "Acme is a great tool."
    assert result.model_used == "sonar"
    assert result.tokens_used == 150
    assert result.cost_usd is not None
    assert result.cost_usd > 0
    assert result.latency_ms >= 0


@pytest.mark.asyncio
async def test_perplexity_retries_on_429():
    rate_limit_resp = MagicMock()
    rate_limit_resp.status_code = 429
    rate_limit_resp.text = "rate limited"

    ok_resp = MagicMock()
    ok_resp.status_code = 200
    ok_resp.json.return_value = _perplexity_response("Answer after retry", 80)

    call_count = 0

    async def post_side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return rate_limit_resp if call_count < 2 else ok_resp

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=post_side_effect)
        mock_client_cls.return_value = mock_client

        with patch("app.platforms.retry._jittered_wait", return_value=0.0):
            adapter = PerplexityAdapter()
            result = await adapter.complete("test prompt", CLIENT_ID)

    assert result.raw_response == "Answer after retry"
    assert call_count == 2


@pytest.mark.asyncio
async def test_perplexity_exhausts_retries_on_500():
    error_resp = MagicMock()
    error_resp.status_code = 500
    error_resp.text = "internal server error"

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=error_resp)
        mock_client_cls.return_value = mock_client

        with patch("app.platforms.retry._jittered_wait", return_value=0.0):
            adapter = PerplexityAdapter()
            with pytest.raises(RetryableError) as exc_info:
                await adapter.complete("test prompt", CLIENT_ID)

    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_perplexity_no_retry_on_400():
    """4xx (except 429) should raise immediately without retrying."""
    bad_req_resp = MagicMock()
    bad_req_resp.status_code = 400
    bad_req_resp.text = "bad request"
    bad_req_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
        "400", request=MagicMock(), response=bad_req_resp
    )

    call_count = 0

    async def post_side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return bad_req_resp

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=post_side_effect)
        mock_client_cls.return_value = mock_client

        adapter = PerplexityAdapter()
        with pytest.raises(httpx.HTTPStatusError):
            await adapter.complete("test prompt", CLIENT_ID)

    assert call_count == 1  # did not retry


# ── OpenAI ────────────────────────────────────────────────────────────────────

def _make_openai_response(content: str, input_tokens: int = 50, output_tokens: int = 100):
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = content
    resp.usage = MagicMock()
    resp.usage.prompt_tokens = input_tokens
    resp.usage.completion_tokens = output_tokens
    return resp


@pytest.mark.asyncio
async def test_openai_success():
    mock_create = AsyncMock(return_value=_make_openai_response("OpenAI says Acme is great."))

    with patch("app.platforms.openai.AsyncOpenAI") as mock_cls:
        mock_instance = MagicMock()
        mock_instance.chat.completions.create = mock_create
        mock_cls.return_value = mock_instance

        adapter = OpenAIAdapter()
        result = await adapter.complete("What is the best tool?", CLIENT_ID)

    assert result.platform == Platform.openai
    assert result.raw_response == "OpenAI says Acme is great."
    assert result.model_used == "gpt-4o"
    assert result.tokens_used == 150  # 50 + 100
    assert result.cost_usd is not None
    assert result.cost_usd > 0


@pytest.mark.asyncio
async def test_openai_retries_on_429():
    from openai import APIStatusError as OpenAIStatusError

    rate_limit_exc = OpenAIStatusError(
        "rate limited",
        response=MagicMock(status_code=429),
        body={"error": {"message": "rate limited"}},
    )
    ok_response = _make_openai_response("Retry success")

    call_count = 0

    async def create_side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            raise rate_limit_exc
        return ok_response

    with patch("app.platforms.openai.AsyncOpenAI") as mock_cls:
        mock_instance = MagicMock()
        mock_instance.chat.completions.create = AsyncMock(side_effect=create_side_effect)
        mock_cls.return_value = mock_instance

        with patch("app.platforms.retry._jittered_wait", return_value=0.0):
            adapter = OpenAIAdapter()
            result = await adapter.complete("test", CLIENT_ID)

    assert result.raw_response == "Retry success"
    assert call_count == 2


# ── Anthropic ─────────────────────────────────────────────────────────────────

def _make_anthropic_response(content: str, input_tokens: int = 60, output_tokens: int = 120):
    resp = MagicMock()
    resp.content = [MagicMock()]
    resp.content[0].text = content
    resp.usage = MagicMock()
    resp.usage.input_tokens = input_tokens
    resp.usage.output_tokens = output_tokens
    return resp


@pytest.mark.asyncio
async def test_anthropic_success():
    mock_create = AsyncMock(
        return_value=_make_anthropic_response("Anthropic says Acme leads the market.")
    )

    with patch("app.platforms.anthropic.AsyncAnthropic") as mock_cls:
        mock_instance = MagicMock()
        mock_instance.messages.create = mock_create
        mock_cls.return_value = mock_instance

        adapter = AnthropicAdapter()
        result = await adapter.complete("What is the best tool?", CLIENT_ID)

    assert result.platform == Platform.anthropic
    assert result.raw_response == "Anthropic says Acme leads the market."
    assert result.model_used == "claude-haiku-4-5-20251001"
    assert result.tokens_used == 180  # 60 + 120
    assert result.cost_usd is not None
    assert result.cost_usd > 0


@pytest.mark.asyncio
async def test_anthropic_retries_on_500():
    from anthropic import APIStatusError as AnthropicStatusError

    server_error = AnthropicStatusError(
        "server error",
        response=MagicMock(status_code=500),
        body={"error": {"message": "internal error"}},
    )
    ok_response = _make_anthropic_response("Recovered response")

    call_count = 0

    async def create_side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            raise server_error
        return ok_response

    with patch("app.platforms.anthropic.AsyncAnthropic") as mock_cls:
        mock_instance = MagicMock()
        mock_instance.messages.create = AsyncMock(side_effect=create_side_effect)
        mock_cls.return_value = mock_instance

        with patch("app.platforms.retry._jittered_wait", return_value=0.0):
            adapter = AnthropicAdapter()
            result = await adapter.complete("test", CLIENT_ID)

    assert result.raw_response == "Recovered response"
    assert call_count == 2


# ── Cost calculation spot-checks ──────────────────────────────────────────────

def test_openai_cost_calculation():
    """1000 input + 1000 output tokens at gpt-4o rates."""
    from app.platforms.openai import _INPUT_COST_PER_TOKEN, _OUTPUT_COST_PER_TOKEN

    cost = 1000 * _INPUT_COST_PER_TOKEN + 1000 * _OUTPUT_COST_PER_TOKEN
    assert abs(cost - 0.01250) < 0.0001  # $0.0125 for 2k tokens


def test_anthropic_cost_calculation():
    """1000 input + 1000 output tokens at claude-3-5-sonnet rates."""
    from app.platforms.anthropic import _INPUT_COST_PER_TOKEN, _OUTPUT_COST_PER_TOKEN

    cost = 1000 * _INPUT_COST_PER_TOKEN + 1000 * _OUTPUT_COST_PER_TOKEN
    assert abs(cost - 0.004800) < 0.0001  # $0.0048 for 2k tokens at haiku-4-5 rates


def test_perplexity_cost_calculation():
    from app.platforms.perplexity import _COST_PER_TOKEN

    cost = 1000 * _COST_PER_TOKEN
    assert abs(cost - 0.001) < 0.0001  # $0.001 for 1k tokens
