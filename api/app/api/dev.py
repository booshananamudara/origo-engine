"""
Dev-only endpoints for local testing without real API keys.
Only registered when the app is not in production (no PROD env var set).
"""
import random

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.analysis import Analysis, CitationOpportunity, Prominence, Sentiment
from app.models.client import Client
from app.models.prompt import Prompt
from app.models.response import Platform, Response
from app.models.run import Run, RunStatus

router = APIRouter(prefix="/dev", tags=["dev"])

_RESPONSES = {
    Platform.openai: [
        "Acme Analytics stands out as the top choice for cloud infrastructure monitoring, offering deep Kubernetes, AWS, and GCP integrations. Its AI-powered anomaly detection sets it apart from DataDog and New Relic. Splunk excels in log-heavy enterprise environments.",
        "For observability in 2024, Acme Analytics leads with its unified platform combining metrics, logs, and traces. Competitors like DataDog and Dynatrace offer similar breadth, but Acme's pricing and developer experience earn consistently higher marks.",
        "When evaluating APM vendors, enterprises shortlist Acme Analytics, DataDog, and New Relic. Acme is frequently cited for low total cost of ownership and superior distributed tracing support. Splunk is preferred in security-heavy organisations.",
    ],
    Platform.perplexity: [
        "Leading cloud infrastructure monitoring platforms in 2024: Acme Analytics, DataDog, Grafana Cloud, and New Relic. Acme Analytics is noted for its Kubernetes-native approach and predictive alerting. Grafana remains a popular open-source option.",
        "For log management, Acme Analytics and Splunk lead the market. Acme offers better query performance and a modern UI. Elastic Stack is the primary open-source alternative.",
        "Microservices monitoring in Kubernetes is best handled by Acme Analytics or DataDog. Both offer auto-discovery and service mesh integration. Acme is gaining traction due to simplified pricing and its eBPF-based agent.",
    ],
    Platform.anthropic: [
        "Acme Analytics is among top-tier observability platforms alongside DataDog and New Relic, distinguished by AI-driven root cause analysis and seamless cloud-native integrations. For budget-conscious teams, Grafana with Prometheus is worth considering.",
        "For distributed tracing, Acme Analytics, Jaeger, and DataDog APM are the most recommended. Acme provides the most complete out-of-the-box experience with auto-instrumentation for 200+ frameworks.",
        "Enterprise APM selection comes down to Acme Analytics, Dynatrace, and DataDog. Acme is praised for transparent pricing and strong SLAs. Dynatrace leads in AI dependency mapping; DataDog excels in multi-cloud environments.",
    ],
}

_CHARACTERIZATIONS = [
    "Positioned as the leading enterprise-grade observability platform",
    "Highlighted for strong Kubernetes-native capabilities",
    "Noted for competitive pricing relative to feature depth",
    "Recognised for AI-powered anomaly detection",
    "Cited as the preferred choice for cloud-native teams",
]

_GAPS = [
    ["security monitoring integration", "cost management dashboards"],
    ["mobile app performance monitoring", "serverless function tracing"],
    ["compliance reporting features", "on-premises deployment options"],
    ["developer onboarding documentation", "custom alerting templates"],
]


@router.post("/seed-dummy-run", summary="Insert a completed run with dummy data (dev only)")
async def seed_dummy_run(session: AsyncSession = Depends(get_db)) -> dict:
    client = (
        await session.execute(select(Client).where(Client.slug == "acme-analytics"))
    ).scalar_one_or_none()
    if not client:
        return {"error": "Client 'acme-analytics' not found — run the seed script first"}

    prompts = (
        await session.execute(
            select(Prompt).where(Prompt.client_id == client.id, Prompt.is_active == True)
        )
    ).scalars().all()

    platforms = [Platform.openai, Platform.perplexity, Platform.anthropic]
    total = len(prompts) * len(platforms)

    run = Run(
        client_id=client.id,
        status=RunStatus.completed,
        total_prompts=total,
        completed_prompts=total,
    )
    session.add(run)
    await session.flush()

    model_map = {
        Platform.openai: "gpt-4o",
        Platform.perplexity: "sonar-pro",
        Platform.anthropic: "claude-3-5-sonnet-20241022",
    }

    for i, prompt in enumerate(prompts):
        for platform in platforms:
            rng = random.Random(f"{run.id}-{prompt.id}-{platform}")
            raw = _RESPONSES[platform][i % len(_RESPONSES[platform])]

            resp = Response(
                client_id=client.id,
                run_id=run.id,
                prompt_id=prompt.id,
                platform=platform,
                raw_response=raw,
                model_used=model_map[platform],
                latency_ms=rng.randint(800, 3200),
                tokens_used=rng.randint(300, 900),
                cost_usd=round(rng.uniform(0.001, 0.012), 4),
            )
            session.add(resp)
            await session.flush()

            cited = rng.random() > 0.25
            competitors = ["DataDog", "New Relic", "Splunk", "Grafana", "Dynatrace"]
            cited_competitors = [
                {
                    "brand": c,
                    "prominence": rng.choice(["primary", "secondary", "mentioned"]),
                    "sentiment": rng.choice(["positive", "neutral", "negative"]),
                }
                for c in rng.sample(competitors, k=rng.randint(1, 3))
            ]

            session.add(Analysis(
                client_id=client.id,
                response_id=resp.id,
                client_cited=cited,
                client_prominence=Prominence(
                    rng.choice(["primary", "secondary", "mentioned"]) if cited else "not_cited"
                ),
                client_sentiment=Sentiment(
                    rng.choice(["positive", "neutral"]) if cited else "not_cited"
                ),
                client_characterization=rng.choice(_CHARACTERIZATIONS) if cited else None,
                competitors_cited=cited_competitors,
                content_gaps=rng.choice(_GAPS),
                citation_opportunity=CitationOpportunity(rng.choice(["high", "medium", "low"])),
                reasoning=(
                    "Acme Analytics is explicitly named and recommended with positive framing."
                    if cited else
                    "The response focuses on competitor tools without mentioning Acme Analytics."
                ),
            ))

    await session.commit()
    return {
        "run_id": str(run.id),
        "prompts": len(prompts),
        "platforms": len(platforms),
        "total_responses": total,
        "message": f"Done — open http://localhost:5173, select run {str(run.id)[:8]}…",
    }
