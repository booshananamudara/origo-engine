"""
LLM-based citation analyzer.

Calls gpt-4o-mini (temperature=0, JSON mode) to analyze each platform response.
On JSON parse / validation failure, retries once with corrective context.
Logs estimated cost on every call.
Persists results to the analyses table.
"""
import json
import uuid

import structlog
from openai import AsyncOpenAI
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.prompt_template import build_prompt, build_retry_prompt
from app.analysis.schemas import AnalysisResult
from app.config import settings
from app.models.analysis import Analysis, CitationOpportunity, Prominence, Sentiment
from app.models.response import Response

logger = structlog.get_logger()

_MODEL = "gpt-4o-mini"
_TEMPERATURE = 0
# gpt-4o-mini pricing: $0.15/1M input, $0.60/1M output
_INPUT_COST_PER_TOKEN = 0.15 / 1_000_000
_OUTPUT_COST_PER_TOKEN = 0.60 / 1_000_000


class AnalysisParseError(Exception):
    """Raised when the LLM output cannot be parsed after all retries."""


class ResponseAnalyzer:
    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

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

        result = await self._call_with_retry(
            prompt_text=prompt_text,
            raw_response=response.raw_response,
            client_brand=client_brand,
            competitor_names=competitor_names,
            log=log,
        )

        analysis = _to_orm(result, response)
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
    ) -> AnalysisResult:
        """Call the LLM. On parse failure, retry once with corrective context."""
        messages = [
            {
                "role": "user",
                "content": build_prompt(
                    original_prompt=prompt_text,
                    raw_response=raw_response,
                    client_brand=client_brand,
                    competitor_names=competitor_names,
                ),
            }
        ]

        raw_text, input_tokens, output_tokens = await self._call_llm(messages, log)
        cost = _compute_cost(input_tokens, output_tokens)
        log.info(
            "analyzer_llm_call",
            model=_MODEL,
            attempt=1,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 6) if cost else None,
        )

        first_err_msg: str | None = None
        try:
            return _parse(raw_text)
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
            model=_MODEL,
            attempt=2,
            input_tokens=input_tokens2,
            output_tokens=output_tokens2,
            cost_usd=round(cost2, 6) if cost2 else None,
        )

        try:
            return _parse(raw_text2)
        except (json.JSONDecodeError, ValidationError, ValueError) as second_err:
            log.error("analysis_parse_failed_attempt_2", error=str(second_err)[:200])
            raise AnalysisParseError(
                f"LLM output unparseable after 2 attempts: {second_err}"
            ) from second_err

    async def _call_llm(
        self, messages: list[dict], log
    ) -> tuple[str, int | None, int | None]:
        resp = await self._client.chat.completions.create(
            model=_MODEL,
            temperature=_TEMPERATURE,
            response_format={"type": "json_object"},
            messages=messages,
        )
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


def _to_orm(result: AnalysisResult, response: Response) -> Analysis:
    """Map a validated AnalysisResult to an Analysis ORM object."""
    # Filter out competitors the LLM listed but then marked as "not_cited" —
    # they shouldn't be in the cited list at all.
    cited_competitors = [
        c.model_dump()
        for c in result.competitors_cited
        if c.prominence != "not_cited"
    ]
    return Analysis(
        client_id=response.client_id,
        response_id=response.id,
        client_cited=result.client_cited,
        client_prominence=Prominence(result.client_prominence),
        client_sentiment=Sentiment(result.client_sentiment),
        client_characterization=result.client_characterization,
        competitors_cited=cited_competitors,
        content_gaps=result.content_gaps,
        citation_opportunity=CitationOpportunity(result.citation_opportunity),
        reasoning=result.reasoning,
    )
