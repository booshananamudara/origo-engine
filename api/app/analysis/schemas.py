"""
Pydantic schema for the LLM analysis response.
Mirrors the exact JSON structure required by the analysis prompt.
"""
from typing import Literal

from pydantic import BaseModel, field_validator


class CompetitorCitedItem(BaseModel):
    brand: str
    prominence: Literal["primary", "secondary", "mentioned"]
    sentiment: Literal["positive", "neutral", "negative"]


class AnalysisResult(BaseModel):
    client_cited: bool
    client_prominence: Literal["primary", "secondary", "mentioned", "not_cited"]
    client_sentiment: Literal["positive", "neutral", "negative", "not_cited"]
    client_characterization: str | None = None
    competitors_cited: list[CompetitorCitedItem] = []
    content_gaps: list[str] = []
    citation_opportunity: Literal["high", "medium", "low"]
    reasoning: str

    @field_validator("client_characterization", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v
