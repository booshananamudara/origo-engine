"""
Generates content brief recommendations from citation analysis data.

Trigger: analyses where the client is not cited (or weakly cited) and
citation_opportunity is high or medium.
"""
import json
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.analysis import Analysis, CitationOpportunity, Prominence
from app.models.client import Client
from app.models.client_knowledge_base import ClientKnowledgeBase
from app.models.prompt import Prompt
from app.models.recommendation import (
    Recommendation,
    RecommendationPriority,
    RecommendationStatus,
    RecommendationType,
)
from app.models.response import Response

logger = structlog.get_logger()

_INPUT_COST_PER_TOKEN = 0.15 / 1_000_000
_OUTPUT_COST_PER_TOKEN = 0.60 / 1_000_000

CONTENT_BRIEF_PROMPT = """\
You are a GEO (Generative Engine Optimization) content strategist.

## Context
Client: {client_name}
Industry: {industry_context}
Brand Profile: {brand_profile}
Target Audience: {target_audience}

## The Problem
The following AI query does NOT adequately cite the client:
- Query: "{original_prompt}"
- Platform: {platform}
- Current AI response summary: "{raw_response_truncated}"
- Client currently cited: {client_cited} (prominence: {client_prominence})
- Competitors currently cited: {competitors_cited_summary}
- Citation opportunity: {citation_opportunity}
- Content gaps identified: {content_gaps}

## Your Task
Generate a structured content brief that, if implemented, would make the client citation-worthy for this query.

Return ONLY valid JSON with this exact structure:
{{
  "target_query": "the exact query this content should address",
  "content_type": "definitional_article",
  "headline_suggestion": "suggested H1 for the content piece",
  "key_questions": ["3-5 specific questions the content MUST answer to be citation-worthy"],
  "eeat_signals": ["specific E-E-A-T signals to include — author credentials, data sources, experience indicators"],
  "competitor_analysis": "what the currently cited competitors are doing that this content should match or exceed",
  "recommended_word_count": 1500,
  "recommended_structure": ["Introduction", "Section 1 title", "Section 2 title"],
  "schema_types": ["schema.org types to apply — e.g., Article, FAQPage, HowTo"],
  "priority": "high",
  "reasoning": "one paragraph explaining why this brief matters and what citation improvement to expect"
}}

content_type must be one of: definitional_article, comparison_piece, faq_cluster, thought_leadership, how_to_guide
priority must be one of: high, medium
"""


def _should_trigger(analysis: Analysis) -> bool:
    """Return True if this analysis warrants a content brief."""
    opp = analysis.citation_opportunity
    if not analysis.client_cited and opp in (CitationOpportunity.high, CitationOpportunity.medium):
        return True
    if (
        analysis.client_cited
        and analysis.client_prominence == Prominence.mentioned
        and opp == CitationOpportunity.high
    ):
        return True
    return False


async def _is_duplicate(
    session: AsyncSession,
    client_id: uuid.UUID,
    prompt_id: uuid.UUID,
    platform: str,
    dedup_days: int,
) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(days=dedup_days)
    existing = (
        await session.execute(
            select(Recommendation).where(
                and_(
                    Recommendation.client_id == client_id,
                    Recommendation.prompt_id == prompt_id,
                    Recommendation.platform == platform,
                    Recommendation.type == RecommendationType.content_brief,
                    Recommendation.created_at >= cutoff,
                    Recommendation.status.in_([
                        RecommendationStatus.pending,
                        RecommendationStatus.approved,
                        RecommendationStatus.implemented,
                    ]),
                )
            )
        )
    ).scalar_one_or_none()
    return existing is not None


async def generate_content_brief(
    session: AsyncSession,
    analysis: Analysis,
    client: Client,
    kb: ClientKnowledgeBase | None,
    prompt_text: str,
    raw_response: str,
    platform: str,
    client_model_config: dict | None = None,
) -> Recommendation | None:
    """
    Generate a content brief for one analysis row.
    Returns the persisted Recommendation or None if skipped/errored.
    """
    log = logger.bind(
        analysis_id=str(analysis.id),
        client_id=str(client.id),
        platform=platform,
    )

    if not _should_trigger(analysis):
        return None

    dedup_days = settings.generation_dedup_days
    if await _is_duplicate(session, client.id, analysis.response.prompt_id, platform, dedup_days):
        log.info("content_brief_skipped_duplicate")
        return None

    brand_profile = str(kb.brand_profile) if kb else "Not provided"
    target_audience = str(kb.target_audience) if kb else "Not provided"
    industry_context = str(kb.industry_context) if kb else (client.industry or "Not provided")

    competitors_summary = ", ".join(
        f"{c.get('brand', '?')} ({c.get('prominence', '?')})"
        for c in (analysis.competitors_cited or [])
    ) or "None"

    from app.platforms.model_registry import get_recommendation_config_for_client
    rec_platform, rec_model, custom_prompt = get_recommendation_config_for_client(client_model_config)

    fmt_kwargs = dict(
        client_name=client.name,
        industry_context=industry_context,
        brand_profile=brand_profile,
        target_audience=target_audience,
        original_prompt=prompt_text,
        platform=platform,
        raw_response_truncated=raw_response[:2000],
        client_cited=analysis.client_cited,
        client_prominence=analysis.client_prominence.value,
        competitors_cited_summary=competitors_summary,
        citation_opportunity=analysis.citation_opportunity.value,
        content_gaps=", ".join(analysis.content_gaps or []) or "None identified",
    )
    if custom_prompt:
        try:
            prompt_str = custom_prompt.format(**fmt_kwargs)
        except (KeyError, ValueError):
            log.warning("recommendation_custom_prompt_format_error_using_default")
            prompt_str = CONTENT_BRIEF_PROMPT.format(**fmt_kwargs)
    else:
        prompt_str = CONTENT_BRIEF_PROMPT.format(**fmt_kwargs)

    try:
        if rec_platform == "anthropic":
            from anthropic import AsyncAnthropic
            ant = AsyncAnthropic(api_key=settings.anthropic_api_key)
            ant_resp = await ant.messages.create(
                model=rec_model,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt_str}],
            )
            raw_text = ant_resp.content[0].text if ant_resp.content else "{}"
            input_tokens = ant_resp.usage.input_tokens if ant_resp.usage else 0
            output_tokens = ant_resp.usage.output_tokens if ant_resp.usage else 0
        else:
            from openai import AsyncOpenAI
            from app.platforms.model_registry import model_supports_temperature, model_supports_json_object_mode
            oai = AsyncOpenAI(api_key=settings.openai_api_key)
            oai_kwargs: dict = {
                "model": rec_model,
                "messages": [{"role": "user", "content": prompt_str}],
            }
            if model_supports_temperature(rec_model):
                oai_kwargs["temperature"] = settings.generation_temperature
            if model_supports_json_object_mode(rec_model):
                oai_kwargs["response_format"] = {"type": "json_object"}
            oai_resp = await oai.chat.completions.create(**oai_kwargs)
            raw_text = oai_resp.choices[0].message.content or "{}"
            input_tokens = oai_resp.usage.prompt_tokens if oai_resp.usage else 0
            output_tokens = oai_resp.usage.completion_tokens if oai_resp.usage else 0
    except Exception as exc:
        log.error("content_brief_llm_error", error=str(exc))
        raise

    cost = input_tokens * _INPUT_COST_PER_TOKEN + output_tokens * _OUTPUT_COST_PER_TOKEN

    log.info(
        "content_brief_llm_call",
        platform=rec_platform,
        model=rec_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=round(cost, 6),
    )

    try:
        content = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        log.error("content_brief_parse_error", error=str(exc))
        raise

    priority_str = content.get("priority", "medium")
    priority = RecommendationPriority.high if priority_str == "high" else RecommendationPriority.medium

    target_query = content.get("target_query", prompt_text)
    title = f"Content brief: {target_query[:150]}"

    trigger_snapshot = {
        "client_cited": analysis.client_cited,
        "client_prominence": analysis.client_prominence.value,
        "client_sentiment": analysis.client_sentiment.value,
        "citation_opportunity": analysis.citation_opportunity.value,
        "competitors_cited": analysis.competitors_cited,
        "content_gaps": analysis.content_gaps,
        "reasoning": analysis.reasoning,
    }

    rec = Recommendation(
        client_id=client.id,
        run_id=analysis.response.run_id,
        analysis_id=analysis.id,
        prompt_id=analysis.response.prompt_id,
        type=RecommendationType.content_brief,
        status=RecommendationStatus.pending,
        priority=priority,
        title=title,
        content=content,
        trigger_data=trigger_snapshot,
        platform=platform,
        target_query=target_query,
        generation_model=settings.generation_model,
        generation_cost_usd=round(cost, 6),
    )
    session.add(rec)
    log.info("content_brief_created", title=title)
    return rec
