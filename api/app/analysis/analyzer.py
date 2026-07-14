"""
LLM-based citation analyzer.

Uses the per-client configured platform + model (defaults to gpt-4o-mini on OpenAI).
On JSON parse / validation failure, retries once with corrective context.
Logs estimated cost on every call.
Persists results to the analyses table.
"""
import asyncio
import json

import structlog
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.prompt_template import build_prompt, build_retry_prompt
from app.analysis.schemas import AnalysisResult
from app.config import settings
from app.models.analysis import (
    Analysis,
    CitationOpportunity,
    CitationType,
    Prominence,
    Sentiment,
)
from app.models.response import Response
from app.services.platform_rate_limiter import acquire_platform_token

logger = structlog.get_logger()

_TEMPERATURE = 0
_INPUT_COST_PER_TOKEN = 0.15 / 1_000_000
_OUTPUT_COST_PER_TOKEN = 0.60 / 1_000_000


class AnalysisParseError(Exception):
    """Raised when the LLM output cannot be parsed after all retries."""


class ResponseAnalyzer:
    def __init__(self, client_model_config: dict | None = None) -> None:
        from app.platforms.model_registry import get_analysis_config_for_client
        self._platform, self._model, self._custom_prompt = get_analysis_config_for_client(client_model_config)

    async def analyze_and_persist(
        self,
        response: Response,
        client_brand: str,
        competitor_names: list[str],
        prompt_text: str,
        db: AsyncSession,
    ) -> Analysis:
        """
        Analyze a platform response for brand citations and persist the result.

        Args:
            response: the Response ORM object to analyze
            client_brand: name of the client's brand
            competitor_names: list of known competitor names
            prompt_text: the original prompt that generated this response
            db: async DB session (caller manages commit)
        """
        log = logger.bind(
            response_id=str(response.id),
            client_id=str(response.client_id),
            platform=response.platform.value,
        )

        result, cost_usd = await self._call_with_retry(
            prompt_text=prompt_text,
            raw_response=response.raw_response,
            client_brand=client_brand,
            competitor_names=competitor_names,
            log=log,
        )

        analysis = _to_orm(result, response, cost_usd=cost_usd)
        db.add(analysis)
        log.info("analysis_persisted", citation_opportunity=result.citation_opportunity)
        return analysis

    async def _call_with_retry(
        self,
        prompt_text: str,
        raw_response: str,
        client_brand: str,
        competitor_names: list[str],
        log,
    ) -> tuple[AnalysisResult, float | None]:
        """Call the LLM. On parse failure, retry once with corrective context.

        Returns (result, total estimated cost across attempts) — the cost is
        persisted on the Analysis row so run spend figures are complete (R5).
        """
        messages = [
            {
                "role": "user",
                "content": build_prompt(
                    original_prompt=prompt_text,
                    raw_response=raw_response,
                    client_brand=client_brand,
                    competitor_names=competitor_names,
                    custom_template=self._custom_prompt,
                ),
            }
        ]

        raw_text, input_tokens, output_tokens = await self._call_llm(messages, log)
        cost = _compute_cost(input_tokens, output_tokens)
        log.info(
            "analyzer_llm_call",
            model=self._model,
            attempt=1,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 6) if cost else None,
        )

        first_err_msg: str | None = None
        try:
            return _parse(raw_text), cost
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            # Capture before Python deletes the except-clause variable on exit
            first_err_msg = str(exc)[:300]
            log.warning("analysis_parse_failed_attempt_1", error=first_err_msg[:200])

        # ── Retry once with corrective context ────────────────────────────────
        # Build a NEW list — don't mutate in place so captured references stay clean
        retry_messages = messages + [
            {"role": "assistant", "content": raw_text},
            {
                "role": "user",
                "content": build_retry_prompt(
                    previous_response=raw_text[:500],
                    parse_error=first_err_msg or "unknown parse error",
                ),
            },
        ]

        raw_text2, input_tokens2, output_tokens2 = await self._call_llm(retry_messages, log)
        cost2 = _compute_cost(input_tokens2, output_tokens2)
        log.info(
            "analyzer_llm_call",
            model=self._model,
            attempt=2,
            input_tokens=input_tokens2,
            output_tokens=output_tokens2,
            cost_usd=round(cost2, 6) if cost2 else None,
        )

        try:
            total_cost = (cost or 0.0) + (cost2 or 0.0) if (cost or cost2) else None
            return _parse(raw_text2), total_cost
        except (json.JSONDecodeError, ValidationError, ValueError) as second_err:
            log.error("analysis_parse_failed_attempt_2", error=str(second_err)[:200])
            raise AnalysisParseError(
                f"LLM output unparseable after 2 attempts: {second_err}"
            ) from second_err

    async def _call_llm(
        self, messages: list[dict], log
    ) -> tuple[str, int | None, int | None]:
        # Pace analysis calls through the same per-platform limiter the monitoring
        # phase uses. The analysis fan-out previously bypassed it entirely, so a
        # large audit could burst every response at the analysis concurrency with
        # no pacing and trip the provider's per-minute cap. (Token acquisition is
        # outside the timeout below — waiting for a slot isn't a slow call.)
        await acquire_platform_token(self._platform)
        # Bound the call so one hung analysis request can't stall the run.
        try:
            return await asyncio.wait_for(
                self._invoke_llm(messages),
                timeout=settings.platform_call_timeout_seconds,
            )
        except TimeoutError as exc:
            log.error(
                "analyzer_llm_timeout",
                platform=self._platform,
                timeout_s=settings.platform_call_timeout_seconds,
            )
            raise AnalysisParseError(
                f"analysis call timed out after {settings.platform_call_timeout_seconds:g}s"
            ) from exc

    async def _invoke_llm(
        self, messages: list[dict]
    ) -> tuple[str, int | None, int | None]:
        # max_tokens is intentionally sourced from settings, not hardcoded: a low
        # cap starves reasoning ("thinking") models — they spend the budget on
        # internal reasoning and return an empty completion, failing the analysis.
        max_tokens = settings.analysis_max_tokens
        if self._platform == "anthropic":
            client = AsyncAnthropic(api_key=settings.anthropic_api_key)
            resp = await client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                messages=messages,
            )
            content = resp.content[0].text if resp.content else ""
            input_tokens = resp.usage.input_tokens if resp.usage else None
            output_tokens = resp.usage.output_tokens if resp.usage else None
        elif self._platform == "gemini":
            from app.platforms.llm_client import gemini_chat
            content, input_tokens, output_tokens = await gemini_chat(
                self._model, messages, json_mode=True, max_tokens=max_tokens
            )
        elif self._platform == "perplexity":
            from app.platforms.llm_client import perplexity_chat
            content, input_tokens, output_tokens = await perplexity_chat(
                self._model, messages, temperature=_TEMPERATURE, max_tokens=max_tokens
            )
        else:
            from app.platforms.model_registry import (
                model_supports_json_object_mode,
                model_supports_temperature,
            )
            client = AsyncOpenAI(api_key=settings.openai_api_key)
            kwargs: dict = {"model": self._model, "messages": messages}
            if model_supports_temperature(self._model):
                kwargs["temperature"] = _TEMPERATURE
            if model_supports_json_object_mode(self._model):
                kwargs["response_format"] = {"type": "json_object"}
            resp = await client.chat.completions.create(**kwargs)
            content = resp.choices[0].message.content or ""
            input_tokens = resp.usage.prompt_tokens if resp.usage else None
            output_tokens = resp.usage.completion_tokens if resp.usage else None
        return content, input_tokens, output_tokens


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse(raw_text: str) -> AnalysisResult:
    """Parse and validate LLM output. Strips markdown fences if present."""
    text = raw_text.strip()
    if text.startswith("```"):
        # Strip ```json ... ``` fences
        lines = text.splitlines()
        text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
    data = json.loads(text)
    return AnalysisResult.model_validate(data)


def _compute_cost(
    input_tokens: int | None, output_tokens: int | None
) -> float | None:
    if input_tokens is None:
        return None
    return (
        input_tokens * _INPUT_COST_PER_TOKEN
        + (output_tokens or 0) * _OUTPUT_COST_PER_TOKEN
    )


def _to_orm(
    result: AnalysisResult, response: Response, cost_usd: float | None = None
) -> Analysis:
    """Map a validated AnalysisResult to an Analysis ORM object."""
    # Filter out competitors the LLM listed but then marked as "not_cited" —
    # they shouldn't be in the cited list at all.
    cited_competitors = [
        c.model_dump()
        for c in result.competitors_cited
        if c.prominence != "not_cited"
    ]
    client_cited, citation_type = _reconcile_citation(result)
    return Analysis(
        client_id=response.client_id,
        response_id=response.id,
        cost_usd=cost_usd,
        client_cited=client_cited,
        client_prominence=Prominence(result.client_prominence),
        client_sentiment=Sentiment(result.client_sentiment),
        citation_type=citation_type,
        client_characterization=result.client_characterization,
        competitors_cited=cited_competitors,
        content_gaps=result.content_gaps,
        citation_opportunity=CitationOpportunity(result.citation_opportunity),
        reasoning=result.reasoning,
    )


def _reconcile_citation(result: AnalysisResult) -> tuple[bool, CitationType]:
    """Derive a coherent (client_cited, citation_type) pair from the model output.

    Product rule: if the brand appears in the response in ANY form it counts as
    cited. The only "not cited" (blank) case is when the brand is absent.

    The model sometimes disagrees with itself, so we reconcile:
    - hollow: the name appears by definition, so it is ALWAYS cited — even when
      the model contradictorily also set client_cited=false (this was the cause
      of cited brands showing up blank).
    - brand absent (client_cited=false, not hollow): not_cited wins; ignore any
      substantive label the model may have returned.
    - cited but the model typed it not_cited: fall back to a neutral 'mentioned'.
    """
    if result.citation_type == "hollow":
        return True, CitationType.hollow
    if not result.client_cited:
        return False, CitationType.not_cited
    if result.citation_type == "not_cited":
        return True, CitationType.mentioned
    return True, CitationType(result.citation_type)
