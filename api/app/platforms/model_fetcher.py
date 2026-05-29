"""
Fetch available models from each AI platform API and persist to the
platform_model_cache table.  Called once at startup; skipped if the table
already has data.  A manual refresh is available via POST /admin/platforms/refresh-models.

Hierarchy:
  1. DB cache (platform_model_cache table)  — used when present
  2. Live API fetch                          — writes to DB, replaces cache
  3. Hardcoded AVAILABLE_MODELS fallback    — used if API and DB both unavailable
"""
import asyncio
import re

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models.platform_model_cache import PlatformModelCache
from app.platforms.model_registry import AVAILABLE_MODELS, set_live_models

logger = structlog.get_logger()

# ── Per-platform fetch functions ──────────────────────────────────────────────

async def _fetch_openai(api_key: str) -> list[str]:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    response = await client.models.list()
    keep = re.compile(r"^(gpt-|o[0-9])")
    skip = re.compile(r"(realtime|audio|transcribe|tts|image|codex|search|instruct|vision-preview|-chat-latest|\d{4}-\d{2}-\d{2}|-[01]\d{3}$)")
    models = sorted(
        {m.id for m in response.data if keep.match(m.id) and not skip.search(m.id)},
        reverse=True,
    )
    return models or AVAILABLE_MODELS["openai"]


async def _fetch_anthropic(api_key: str) -> list[str]:
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=api_key)
    # Pass limit=1000 to avoid the default 20-item page cap
    response = await client.models.list(limit=1000)
    models = sorted(
        {m.id for m in response.data if m.id.startswith("claude-")},
        reverse=True,
    )
    return models or AVAILABLE_MODELS["anthropic"]


async def _fetch_perplexity(api_key: str) -> list[str]:
    async with httpx.AsyncClient(timeout=10.0) as http:
        r = await http.get(
            "https://api.perplexity.ai/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        r.raise_for_status()
        data = r.json()
        # Only keep Perplexity-native models (prefixed "perplexity/...").
        # Proxied models (openai/..., anthropic/..., etc.) are tracked
        # separately under their own platforms.
        models = [
            m["id"]
            for m in data.get("data", [])
            if str(m.get("id", "")).startswith("perplexity/")
        ]
        return models or AVAILABLE_MODELS["perplexity"]


async def _fetch_gemini(api_key: str) -> list[str]:
    models: list[str] = []
    page_token: str | None = None
    async with httpx.AsyncClient(timeout=10.0) as http:
        while True:
            params: dict = {"key": api_key, "pageSize": 1000}
            if page_token:
                params["pageToken"] = page_token
            r = await http.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params=params,
            )
            r.raise_for_status()
            data = r.json()
            for m in data.get("models", []):
                if (
                    "generateContent" in m.get("supportedGenerationMethods", [])
                    and "gemini" in m.get("name", "").lower()
                ):
                    models.append(m["name"].replace("models/", ""))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return sorted(models, reverse=True) or AVAILABLE_MODELS["gemini"]


_FETCHERS = {
    "openai": (_fetch_openai, lambda: settings.openai_api_key),
    "anthropic": (_fetch_anthropic, lambda: settings.anthropic_api_key),
    "perplexity": (_fetch_perplexity, lambda: settings.perplexity_api_key),
    "gemini": (_fetch_gemini, lambda: settings.gemini_api_key),
}


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _load_from_db(db: AsyncSession) -> dict[str, list[str]] | None:
    """Return the cached model lists if all platforms are present, else None."""
    rows = (await db.execute(select(PlatformModelCache))).scalars().all()
    cached = {row.platform: row.models for row in rows}
    if set(cached) >= set(AVAILABLE_MODELS):
        return cached
    return None


async def _save_to_db(db: AsyncSession, platform: str, models: list[str]) -> None:
    stmt = (
        pg_insert(PlatformModelCache)
        .values(platform=platform, models=models)
        .on_conflict_do_update(
            index_elements=["platform"],
            set_={"models": models, "fetched_at": __import__("sqlalchemy").text("now()")},
        )
    )
    await db.execute(stmt)


# ── Public API ────────────────────────────────────────────────────────────────

async def fetch_all_and_store(db: AsyncSession) -> dict[str, list[str]]:
    """Fetch models from all platform APIs, persist results, update in-memory cache."""
    results: dict[str, list[str]] = {}

    async def _fetch_one(platform: str) -> None:
        fn, get_key = _FETCHERS[platform]
        api_key = get_key()
        try:
            models = await fn(api_key)
            logger.info("platform_models_fetched", platform=platform, count=len(models))
        except Exception as exc:
            logger.warning("platform_models_fetch_failed_using_fallback", platform=platform, error=str(exc))
            models = AVAILABLE_MODELS[platform]
        results[platform] = models
        await _save_to_db(db, platform, models)

    await asyncio.gather(*[_fetch_one(p) for p in _FETCHERS])
    await db.commit()

    set_live_models(results)
    return results


async def ensure_models_loaded(session_factory: async_sessionmaker) -> None:
    """
    Called at startup.  Loads from DB if already cached; otherwise fetches
    from all platform APIs, stores results, then loads.  Safe to call multiple
    times — skips fetch when cache is complete.
    """
    async with session_factory() as db:
        cached = await _load_from_db(db)
        if cached:
            set_live_models(cached)
            logger.info("platform_models_loaded_from_cache", platforms=list(cached))
            return

        logger.info("platform_models_cache_empty_fetching")
        await fetch_all_and_store(db)
