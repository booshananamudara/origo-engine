"""
Translation tables between the engine's internal vocabulary and the external
/v1 contract. The external pipeline depends on these exact names.
"""
from app.models.recommendation import RecommendationType
from app.models.response import Platform
from app.models.run import RunStatus

# ── Engines ───────────────────────────────────────────────────────────────────
# Internal Platform enum → external engine name used everywhere in /v1 payloads.
# WIRED ENGINES: chatgpt (openai), perplexity, gemini, claude (anthropic).
PLATFORM_TO_ENGINE: dict[Platform, str] = {
    Platform.openai: "chatgpt",
    Platform.anthropic: "claude",
    Platform.gemini: "gemini",
    Platform.perplexity: "perplexity",
}
ENGINE_TO_PLATFORM: dict[str, Platform] = {v: k for k, v in PLATFORM_TO_ENGINE.items()}


def engine_name(platform: Platform | str) -> str:
    """External engine name for an internal Platform (accepts enum or its value)."""
    if isinstance(platform, str):
        platform = Platform(platform)
    return PLATFORM_TO_ENGINE[platform]


# ── Audit status ──────────────────────────────────────────────────────────────
# Internal RunStatus → external audit status. "complete" vs "partial" is
# resolved by the caller using failed_engines (a completed run with failures
# becomes "partial").
_RUN_STATUS_TO_AUDIT: dict[RunStatus, str] = {
    RunStatus.pending: "queued",
    RunStatus.running: "running",
    RunStatus.completed: "complete",
    RunStatus.failed: "failed",
}


def audit_status(run_status: RunStatus, failed_engines: list[str]) -> str:
    """Map a RunStatus to the external audit status vocabulary."""
    base = _RUN_STATUS_TO_AUDIT.get(run_status, "queued")
    if base == "complete" and failed_engines:
        return "partial"
    return base


# ── Recommendation buckets ────────────────────────────────────────────────────
# Internal RecommendationType → external bucket. The four external buckets are:
#   content_creation | content_optimization | technical | authority_building
_TYPE_TO_BUCKET: dict[str, str] = {
    RecommendationType.content_brief.value: "content_creation",
    RecommendationType.on_page_optimization.value: "content_optimization",
    RecommendationType.schema_markup.value: "technical",
    RecommendationType.llms_txt.value: "technical",
    RecommendationType.authority_building.value: "authority_building",
}


def recommendation_bucket(rec_type: str) -> str:
    """External bucket for a recommendation type value (defaults to technical)."""
    return _TYPE_TO_BUCKET.get(rec_type, "technical")
