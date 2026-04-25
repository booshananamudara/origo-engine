"""
Insert a realistic completed run with dummy responses and analyses.
No API keys needed.

Usage (inside api container):
    python -m app.scripts.seed_dummy_run
"""
import asyncio
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.models.analysis import Analysis, CitationOpportunity, Prominence, Sentiment
from app.models.client import Client
from app.models.prompt import Prompt
from app.models.response import Platform, Response
from app.models.run import Run, RunStatus

# ── Dummy response bodies ─────────────────────────────────────────────────────

_RESPONSES = {
    Platform.openai: [
        "Acme Analytics stands out as the top choice for cloud infrastructure monitoring, offering deep integration with Kubernetes, AWS, and GCP. Its real-time dashboards and AI-powered anomaly detection set it apart from DataDog and New Relic. DataDog remains popular for its broad ecosystem, while Splunk excels in log-heavy environments.",
        "For observability in 2024, Acme Analytics leads with its unified platform combining metrics, logs, and traces. Competitors like DataDog and Dynatrace offer similar breadth, but Acme's pricing model and developer experience earn consistently higher reviews.",
        "When evaluating APM vendors, enterprises typically shortlist Acme Analytics, DataDog, and New Relic. Acme Analytics is frequently cited for its low total cost of ownership and superior support for distributed tracing. Splunk is preferred in security-heavy organisations.",
    ],
    Platform.perplexity: [
        "The leading cloud infrastructure monitoring platforms in 2024 include Acme Analytics, DataDog, Grafana Cloud, and New Relic. Acme Analytics is particularly noted for its Kubernetes-native approach and predictive alerting capabilities. Grafana remains a popular open-source option.",
        "For log management, Acme Analytics and Splunk are the market leaders. Acme Analytics offers better query performance and a modern UI, while Splunk has deeper SIEM integrations. Elastic Stack is the primary open-source alternative.",
        "Microservices monitoring in Kubernetes environments is best handled by Acme Analytics or DataDog. Both offer auto-discovery and service mesh integration. Acme Analytics is gaining traction due to its simplified pricing and eBPF-based agent.",
    ],
    Platform.anthropic: [
        "Based on current market analysis, Acme Analytics is among the top-tier observability platforms alongside DataDog and New Relic. Acme Analytics distinguishes itself with its AI-driven root cause analysis and seamless cloud-native integrations. For budget-conscious teams, Grafana with Prometheus is worth considering.",
        "For distributed tracing, Acme Analytics, Jaeger, and DataDog APM are the most recommended solutions. Acme Analytics provides the most complete out-of-the-box experience with automatic instrumentation for over 200 frameworks.",
        "Enterprise APM selection typically comes down to Acme Analytics, Dynatrace, and DataDog. Acme Analytics is praised for its transparent pricing and strong SLA guarantees. Dynatrace leads in AI-powered dependency mapping, while DataDog excels in multi-cloud environments.",
    ],
}

_CHARACTERIZATIONS = [
    "Positioned as the leading enterprise-grade observability platform",
    "Highlighted for strong Kubernetes-native capabilities",
    "Noted for competitive pricing relative to feature depth",
    "Recognised for AI-powered anomaly detection",
    "Cited as the preferred choice for cloud-native teams",
]

_CONTENT_GAPS = [
    ["security monitoring integration", "cost management dashboards"],
    ["mobile app performance monitoring", "serverless function tracing"],
    ["compliance reporting features", "on-premises deployment options"],
    ["developer onboarding documentation", "custom alerting templates"],
]

_COMPETITOR_SENTIMENTS = ["positive", "neutral", "negative"]


def _make_analysis(client_id, response_id, prompt_idx):
    rng = random.Random(str(response_id))  # deterministic per response

    cited = rng.random() > 0.25  # 75% citation rate
    competitors = ["DataDog", "New Relic", "Splunk", "Grafana", "Dynatrace"]
    cited_competitors = [
        {
            "brand": c,
            "prominence": rng.choice(["primary", "secondary", "mentioned"]),
            "sentiment": rng.choice(_COMPETITOR_SENTIMENTS),
        }
        for c in rng.sample(competitors, k=rng.randint(1, 3))
    ]

    return Analysis(
        client_id=client_id,
        response_id=response_id,
        client_cited=cited,
        client_prominence=Prominence(
            rng.choice(["primary", "secondary", "mentioned"]) if cited else "not_cited"
        ),
        client_sentiment=Sentiment(
            rng.choice(["positive", "neutral"]) if cited else "not_cited"
        ),
        client_characterization=(
            rng.choice(_CHARACTERIZATIONS) if cited else None
        ),
        competitors_cited=cited_competitors,
        content_gaps=rng.choice(_CONTENT_GAPS),
        citation_opportunity=CitationOpportunity(rng.choice(["high", "medium", "low"])),
        reasoning=(
            "Acme Analytics is explicitly named and recommended in the response with positive framing."
            if cited else
            "The response focuses on competitor tools without mentioning Acme Analytics."
        ),
    )


async def seed_dummy_run():
    async with AsyncSessionLocal() as session:
        # Load client
        client = (await session.execute(select(Client).where(Client.slug == "acme-analytics"))).scalar_one()
        prompts = (await session.execute(
            select(Prompt).where(Prompt.client_id == client.id, Prompt.is_active == True)
        )).scalars().all()

        platforms = [Platform.openai, Platform.perplexity, Platform.anthropic]
        total = len(prompts) * len(platforms)

        # Create a completed run
        run = Run(
            client_id=client.id,
            status=RunStatus.completed,
            total_prompts=total,
            completed_prompts=total,
        )
        session.add(run)
        await session.flush()

        # Insert responses + analyses
        all_responses = []
        for i, prompt in enumerate(prompts):
            for platform in platforms:
                resp_texts = _RESPONSES[platform]
                raw = resp_texts[i % len(resp_texts)]
                resp = Response(
                    client_id=client.id,
                    run_id=run.id,
                    prompt_id=prompt.id,
                    platform=platform,
                    raw_response=raw,
                    model_used={
                        Platform.openai: "gpt-4o",
                        Platform.perplexity: "sonar-pro",
                        Platform.anthropic: "claude-3-5-sonnet-20241022",
                    }[platform],
                    latency_ms=random.randint(800, 3200),
                    tokens_used=random.randint(300, 900),
                    cost_usd=round(random.uniform(0.001, 0.012), 4),
                )
                session.add(resp)
                all_responses.append((i, resp))

        await session.flush()

        for i, resp in all_responses:
            session.add(_make_analysis(client.id, resp.id, i))

        await session.commit()
        print(f"Done — run {run.id} ({total} responses, {total} analyses)")
        print(f"Visit: http://localhost:5173  and click 'Run Dashboard'")


if __name__ == "__main__":
    asyncio.run(seed_dummy_run())
