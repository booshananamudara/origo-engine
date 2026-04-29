"""
Pydantic response schemas for aggregated run data.
"""
import uuid
from typing import Any

from pydantic import BaseModel

from app.models.response import Platform
from app.schemas.common import ORMBase
from app.schemas.run import RunRead


class PlatformStats(BaseModel):
    platform: Platform
    model_used: str = ""
    total_responses: int
    cited_count: int
    citation_rate: float
    prominence_breakdown: dict[str, int]


class CompetitorStats(BaseModel):
    brand: str
    cited_count: int
    share_of_voice: float  # cited_count / total_analyses, 0–1


class RunSummaryResponse(BaseModel):
    run: RunRead
    total_analyses: int
    overall_citation_rate: float
    platform_stats: list[PlatformStats]
    competitor_stats: list[CompetitorStats]
    # Keyed by platform name; present when one or more platforms failed.
    # Stored as JSON in run.error_message and parsed here.
    platform_errors: dict[str, str] = {}


class PromptAnalysisItem(BaseModel):
    """Single platform result within a prompt drill-down."""
    platform: Platform
    response_id: uuid.UUID
    raw_response: str
    model_used: str
    latency_ms: int | None = None
    cost_usd: float | None = None
    # Analysis fields — None if analysis not yet complete
    client_cited: bool | None = None
    client_prominence: str | None = None
    client_sentiment: str | None = None
    client_characterization: str | None = None
    competitors_cited: list[Any] = []
    content_gaps: list[Any] = []
    citation_opportunity: str | None = None
    reasoning: str | None = None


class PromptDetail(BaseModel):
    prompt_id: uuid.UUID
    prompt_text: str
    category: str
    results: list[PromptAnalysisItem]


class ClientRead(ORMBase):
    name: str
    slug: str
