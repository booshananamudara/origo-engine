"""
Report assembly service — JSON and PDF run reports.
"""
import io
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.aggregator import compute_run_summary, get_prompt_details


async def assemble_run_report(
    session: AsyncSession,
    run_id: uuid.UUID,
    include_internal: bool = False,
) -> dict:
    """Build the full run report dict (used for both JSON export and PDF data source)."""
    summary = await compute_run_summary(run_id, session)
    prompts = await get_prompt_details(run_id, session)

    run = summary.run

    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run": {
            "id": str(run.id),
            "display_id": run.display_id,
            "status": run.status.value,
            "created_at": run.created_at.isoformat(),
            "total_prompts": run.total_prompts,
            "completed_prompts": run.completed_prompts,
        },
        "summary": {
            "total_analyses": summary.total_analyses,
            "overall_citation_rate": summary.overall_citation_rate,
        },
        "platform_stats": [
            {
                "platform": ps.platform.value,
                "model_used": ps.model_used,
                "total_responses": ps.total_responses,
                "cited_count": ps.cited_count,
                "citation_rate": ps.citation_rate,
                "prominence_breakdown": ps.prominence_breakdown,
            }
            for ps in summary.platform_stats
        ],
        "competitor_stats": [
            {
                "brand": cs.brand,
                "cited_count": cs.cited_count,
                "share_of_voice": cs.share_of_voice,
            }
            for cs in summary.competitor_stats
        ],
        "prompts": [
            {
                "prompt_id": str(p.prompt_id),
                "prompt_text": p.prompt_text,
                "category": p.category,
                "results": [
                    {
                        "platform": r.platform.value,
                        "model_used": r.model_used,
                        "client_cited": r.client_cited,
                        "client_prominence": r.client_prominence,
                        "client_sentiment": r.client_sentiment,
                        "citation_opportunity": r.citation_opportunity,
                        "content_gaps": r.content_gaps,
                        "competitors_cited": r.competitors_cited,
                        **({"raw_response": r.raw_response, "latency_ms": r.latency_ms, "cost_usd": r.cost_usd} if include_internal else {}),
                    }
                    for r in p.results
                ],
            }
            for p in prompts
        ],
    }

    if include_internal and summary.platform_errors:
        report["platform_errors"] = summary.platform_errors

    return report


def build_pdf(report: dict, client_name: str) -> bytes:
    """Render report dict to PDF bytes using reportlab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    h1 = styles["h1"]
    h2 = ParagraphStyle("h2", parent=styles["h2"], spaceAfter=4)
    body = styles["BodyText"]
    small = ParagraphStyle("small", parent=body, fontSize=8, textColor=colors.grey)

    run = report["run"]
    summary = report["summary"]

    story = []

    # ── Cover ────────────────────────────────────────────────────────────────
    story.append(Paragraph("GEO Monitoring Report", h1))
    story.append(Paragraph(f"<b>Client:</b> {client_name}", body))
    story.append(Paragraph(f"<b>Run:</b> {run.get('display_id') or run['id']}", body))
    story.append(Paragraph(f"<b>Date:</b> {run['created_at'][:10]}", body))
    story.append(Paragraph(f"<b>Generated:</b> {report['generated_at'][:19].replace('T', ' ')} UTC", small))
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
    story.append(Spacer(1, 4 * mm))

    # ── Executive Summary ─────────────────────────────────────────────────────
    story.append(Paragraph("Executive Summary", h2))
    story.append(Paragraph(
        f"Overall citation rate: <b>{summary['overall_citation_rate'] * 100:.1f}%</b> "
        f"across {summary['total_analyses']} AI responses.",
        body,
    ))
    story.append(Spacer(1, 4 * mm))

    # ── Platform Breakdown ────────────────────────────────────────────────────
    story.append(Paragraph("Platform Breakdown", h2))
    if report["platform_stats"]:
        data = [["Platform", "Model", "Cited", "Total", "Citation Rate"]]
        for ps in report["platform_stats"]:
            data.append([
                ps["platform"].capitalize(),
                ps["model_used"],
                str(ps["cited_count"]),
                str(ps["total_responses"]),
                f"{ps['citation_rate'] * 100:.1f}%",
            ])
        tbl = Table(data, colWidths=[35 * mm, 55 * mm, 20 * mm, 20 * mm, 30 * mm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F46E5")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(tbl)
    story.append(Spacer(1, 4 * mm))

    # ── Competitor Share of Voice ─────────────────────────────────────────────
    if report["competitor_stats"]:
        story.append(Paragraph("Competitor Share of Voice", h2))
        data = [["Competitor", "Cited", "Share of Voice"]]
        for cs in report["competitor_stats"]:
            data.append([cs["brand"], str(cs["cited_count"]), f"{cs['share_of_voice'] * 100:.1f}%"])
        tbl = Table(data, colWidths=[80 * mm, 30 * mm, 40 * mm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F46E5")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 4 * mm))

    # ── Prompt Results ────────────────────────────────────────────────────────
    story.append(Paragraph("Prompt-Level Results", h2))
    for p in report["prompts"]:
        story.append(Paragraph(
            f"<b>{p['category'].capitalize()}:</b> {p['prompt_text'][:120]}{'…' if len(p['prompt_text']) > 120 else ''}",
            body,
        ))
        cited_platforms = [r["platform"] for r in p["results"] if r.get("client_cited")]
        story.append(Paragraph(
            f"Cited by: {', '.join(cited_platforms) if cited_platforms else 'None'}",
            small,
        ))
        story.append(Spacer(1, 2 * mm))

    doc.build(story)
    return buf.getvalue()
