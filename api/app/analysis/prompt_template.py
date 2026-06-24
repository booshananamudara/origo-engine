"""
Analysis prompt template — used verbatim as specified in the project brief.
"""

ANALYSIS_PROMPT = """\
You are analyzing an AI-generated response to identify brand citations and competitive intelligence.

Query asked to the AI platform: "{original_prompt}"
AI platform response: "{raw_response}"
Client brand to analyze: "{client_brand}"
Known competitors: {competitor_list}

Return ONLY valid JSON with this exact structure:
{{
  "client_cited": true/false,
  "client_prominence": "primary" | "secondary" | "mentioned" | "not_cited",
  "client_sentiment": "positive" | "neutral" | "negative" | "not_cited",
  "citation_type": "recommended" | "mentioned" | "negative" | "hollow" | "not_cited",
  "client_characterization": "brief description of how client is described, or null",
  "competitors_cited": [
    {{"brand": "name", "prominence": "primary|secondary|mentioned", "sentiment": "positive|neutral|negative"}}
  ],
  "content_gaps": ["specific topics in the response not covered by client content"],
  "citation_opportunity": "high" | "medium" | "low",
  "reasoning": "one sentence explaining the citation opportunity rating"
}}

Classify "citation_type" — how the client brand actually appears in the response:
- "recommended": the brand is actively recommended or positioned positively (e.g. presented as a top choice or endorsed).
- "mentioned": the brand is referenced neutrally with real but non-committal information, no clear recommendation.
- "negative": the brand is mentioned in a critical, cautionary, or unfavourable context.
- "hollow": the brand name appears ONLY because it was in the query, with no substantive information about it (e.g. the response merely echoes the name, says it could not find details, or lists it without saying anything meaningful).
- "not_cited": the brand does not appear at all. Use this if and only if "client_cited" is false.

Consistency rule: "recommended", "mentioned", "negative" and "hollow" ALL mean the \
brand appears in the response, so whenever you pick one of those you MUST set \
"client_cited" to true. Only "not_cited" goes with "client_cited": false."""

RETRY_PROMPT = """\
Your previous response could not be parsed as valid JSON matching the required schema.

Previous response: {previous_response}
Parse error: {parse_error}

Please return ONLY valid JSON with the exact structure specified. No markdown, no code blocks, \
no explanation — just the raw JSON object."""


def build_prompt(
    original_prompt: str,
    raw_response: str,
    client_brand: str,
    competitor_names: list[str],
    custom_template: str | None = None,
) -> str:
    competitor_list = ", ".join(f'"{c}"' for c in competitor_names)
    kwargs = dict(
        original_prompt=original_prompt,
        raw_response=raw_response,
        client_brand=client_brand,
        competitor_list=f"[{competitor_list}]",
    )
    if custom_template:
        try:
            return custom_template.format(**kwargs)
        except (KeyError, ValueError):
            pass  # fall through to default
    return ANALYSIS_PROMPT.format(**kwargs)


def build_retry_prompt(previous_response: str, parse_error: str) -> str:
    return RETRY_PROMPT.format(
        previous_response=previous_response,
        parse_error=parse_error,
    )
