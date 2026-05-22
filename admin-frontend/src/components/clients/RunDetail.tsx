import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { runsApi, costApi } from "../../api/client";
import type { Platform, PromptAnalysisItem, PromptDetail, PlatformStats, CompetitorStats, RunCostSummary } from "../../types";

function fmtTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}
function fmtCost(usd: number | null | undefined, decimals = 3): string {
  if (usd == null) return "—";
  return `$${usd.toFixed(decimals)}`;
}

function CostSection({ clientId, runId }: { clientId: string; runId: string }) {
  const [showPlatform, setShowPlatform] = useState(false);
  const { data: cost } = useQuery<RunCostSummary>({
    queryKey: ["admin-run-costs", clientId, runId],
    queryFn: () => costApi.getRunCosts(clientId, runId),
    enabled: !!clientId && !!runId,
  });

  if (!cost) return null;
  if (cost.total_cost_usd == null && !cost.cost_by_platform) return null;

  const mon = cost.breakdown?.monitoring;
  const gen = cost.breakdown?.generation;
  const totalCalls = (mon?.api_calls ?? 0) + (gen?.api_calls ?? 0);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost &amp; Usage</h3>
        <div className="flex gap-3 text-right">
          <div>
            <p className="text-[10px] text-gray-500">Tokens</p>
            <p className="text-sm font-mono font-semibold text-white">{fmtTokens(cost.total_tokens)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Total Cost</p>
            <p className="text-sm font-mono font-semibold text-indigo-300">{fmtCost(cost.total_cost_usd)}</p>
          </div>
        </div>
      </div>

      {/* Phase breakdown table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="text-left py-1.5 pr-4">Phase</th>
              <th className="text-right py-1.5 px-3">API Calls</th>
              <th className="text-right py-1.5 px-3">Tokens</th>
              <th className="text-right py-1.5 pl-3">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {mon && (
              <tr>
                <td className="py-2 pr-4 text-gray-300">Monitoring</td>
                <td className="text-right px-3 font-mono text-gray-400">{mon.api_calls}</td>
                <td className="text-right px-3 font-mono text-gray-400">{fmtTokens(mon.tokens)}</td>
                <td className="text-right pl-3 font-mono text-gray-300">{fmtCost(mon.cost_usd)}</td>
              </tr>
            )}
            {gen && (
              <tr>
                <td className="py-2 pr-4 text-gray-300">Generation</td>
                <td className="text-right px-3 font-mono text-gray-400">{gen.api_calls}</td>
                <td className="text-right px-3 font-mono text-gray-500">—</td>
                <td className="text-right pl-3 font-mono text-gray-300">{fmtCost(gen.cost_usd)}</td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-2 pr-4 text-white">Total</td>
              <td className="text-right px-3 font-mono text-gray-300">{totalCalls}</td>
              <td className="text-right px-3 font-mono text-gray-300">{fmtTokens(cost.total_tokens)}</td>
              <td className="text-right pl-3 font-mono text-indigo-300">{fmtCost(cost.total_cost_usd)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-platform breakdown (collapsible) */}
      {Object.keys(cost.cost_by_platform).length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowPlatform((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showPlatform ? "▼" : "▶"} Per-platform breakdown
          </button>
          {showPlatform && (
            <table className="w-full text-xs mt-2">
              <thead>
                <tr className="text-gray-500 uppercase tracking-wider border-b border-gray-800">
                  <th className="text-left py-1.5 pr-4">Platform</th>
                  <th className="text-right py-1.5 px-3">Tokens</th>
                  <th className="text-right py-1.5 pl-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {Object.entries(cost.cost_by_platform).map(([platform, data]) => (
                  <tr key={platform}>
                    <td className="py-1.5 pr-4 capitalize text-gray-300">{platform}</td>
                    <td className="text-right px-3 font-mono text-gray-400">{fmtTokens(data.tokens)}</td>
                    <td className="text-right pl-3 font-mono text-gray-300">{fmtCost(data.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ACTIVE = new Set(["pending", "running"]);

// ── Platform meta ─────────────────────────────────────────────────────────────

const PLATFORM_META: Record<Platform, { label: string; dot: string; bar: string; border: string }> = {
  perplexity: { label: "Perplexity", dot: "bg-purple-400", bar: "bg-purple-400", border: "border-purple-500/30" },
  openai:     { label: "OpenAI",     dot: "bg-emerald-400", bar: "bg-emerald-400", border: "border-emerald-500/30" },
  anthropic:  { label: "Anthropic",  dot: "bg-orange-400", bar: "bg-orange-400", border: "border-orange-500/30" },
  gemini:     { label: "Gemini",     dot: "bg-blue-400", bar: "bg-blue-400", border: "border-blue-500/30" },
};

const OPP_PILL: Record<string, string> = {
  high:   "bg-green-500/15 text-green-300 border border-green-500/30",
  medium: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  low:    "bg-red-500/15 text-red-400 border border-red-500/30",
};

// ── Prompt drill-down ────────────────────────────────────────────────────────

function PlatformResult({ item }: { item: PromptAnalysisItem }) {
  const [showFull, setShowFull] = useState(false);
  const meta = PLATFORM_META[item.platform] ?? { label: item.platform, dot: "bg-gray-400", bar: "bg-gray-400", border: "" };
  const truncated = item.raw_response.length > 280 && !showFull;
  const displayText = truncated ? item.raw_response.slice(0, 280) + "…" : item.raw_response;

  return (
    <div className="rounded-xl border border-gray-700 overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-800/60 border-b border-gray-700`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
        <span className="text-xs font-semibold text-gray-200">{meta.label}</span>
        {item.model_used && <span className="text-xs text-gray-500">{item.model_used}</span>}
        {item.latency_ms != null && <span className="ml-auto text-xs text-gray-500">{item.latency_ms}ms</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-700">
        <div className="p-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Response</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            {displayText}
            {item.raw_response.length > 280 && (
              <button onClick={() => setShowFull(!showFull)} className="ml-1 text-indigo-400 hover:text-indigo-300 font-medium">
                {showFull ? "less" : "more"}
              </button>
            )}
          </p>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Analysis</p>
          {item.client_cited == null ? (
            <p className="text-xs text-gray-600 italic">Pending…</p>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-1.5">
                <span className={`px-2 py-0.5 rounded-full font-semibold ${item.client_cited ? "bg-green-500/15 text-green-300 border border-green-500/30" : "bg-gray-800 text-gray-500 border border-gray-700"}`}>
                  {item.client_cited ? "✓ Cited" : "Not cited"}
                </span>
                {item.client_prominence && item.client_prominence !== "not_cited" && (
                  <span className={`px-2 py-0.5 rounded-full capitalize ${item.client_prominence === "primary" ? "bg-indigo-900/50 text-indigo-300" : "bg-gray-800 text-gray-400"}`}>
                    {item.client_prominence}
                  </span>
                )}
                {item.citation_opportunity && (
                  <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${OPP_PILL[item.citation_opportunity] ?? ""}`}>
                    {item.citation_opportunity} opp.
                  </span>
                )}
              </div>
              {item.client_sentiment && item.client_sentiment !== "not_cited" && (
                <p className={`capitalize font-medium ${item.client_sentiment === "positive" ? "text-green-400" : item.client_sentiment === "negative" ? "text-red-400" : "text-gray-400"}`}>
                  {item.client_sentiment} sentiment
                </p>
              )}
              {item.client_characterization && (
                <p className="text-gray-400 italic leading-relaxed">"{item.client_characterization}"</p>
              )}
              {item.reasoning && (
                <p className="text-gray-500 leading-relaxed border-l-2 border-gray-700 pl-2">{item.reasoning}</p>
              )}
              {item.competitors_cited.length > 0 && (
                <div>
                  <p className="text-gray-500 mb-1">Competitors cited:</p>
                  <div className="flex flex-wrap gap-1">
                    {item.competitors_cited.map((c, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-red-950/40 text-red-400 rounded text-[10px] border border-red-900/50">{c.brand}</span>
                    ))}
                  </div>
                </div>
              )}
              {item.content_gaps.length > 0 && (
                <div>
                  <p className="text-gray-500 mb-1">Gaps:</p>
                  <ul className="space-y-0.5">
                    {item.content_gaps.slice(0, 2).map((g, i) => <li key={i} className="text-gray-500">· {g}</li>)}
                    {item.content_gaps.length > 2 && <li className="text-gray-600">+{item.content_gaps.length - 2} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PromptRow({ detail }: { detail: PromptDetail }) {
  const [expanded, setExpanded] = useState(false);
  const citedCount = detail.results.filter((r) => r.client_cited).length;
  const total = detail.results.length;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start gap-3 p-4 hover:bg-gray-800/40 transition-colors text-left">
        <span className="mt-0.5 text-gray-600 text-xs shrink-0">{expanded ? "▼" : "▶"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 leading-snug">{detail.prompt_text}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded uppercase tracking-wide font-medium">{detail.category}</span>
            <span className={`text-xs font-medium ${citedCount === total ? "text-green-400" : citedCount === 0 ? "text-gray-500" : "text-amber-400"}`}>
              {citedCount}/{total} cited
            </span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0 mt-0.5">
          {detail.results.map((r) => {
            const m = PLATFORM_META[r.platform];
            return (
              <span key={r.platform} title={`${m?.label}: ${r.client_cited == null ? "pending" : r.client_cited ? "cited" : "not cited"}`}
                className={`w-2.5 h-2.5 rounded-full border-2 ${r.client_cited == null ? "bg-gray-700 border-gray-700" : r.client_cited ? `${m?.dot ?? "bg-green-400"} border-transparent` : "bg-transparent border-gray-600"}`} />
            );
          })}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-800 bg-gray-950/50 p-3 space-y-3">
          {detail.results.map((item) => <PlatformResult key={item.response_id} item={item} />)}
        </div>
      )}
    </div>
  );
}

// ── Main RunDetail ─────────────────────────────────────────────────────────────

export function RunDetail() {
  const { clientId, runId } = useParams<{ clientId: string; runId: string }>();
  const [promptFilter, setPromptFilter] = useState<"all" | "cited" | "not_cited">("all");
  const [downloading, setDownloading] = useState<"json" | "pdf" | null>(null);

  async function handleDownload(format: "json" | "pdf") {
    if (!clientId || !runId) return;
    setDownloading(format);
    try {
      const blob = format === "json"
        ? await runsApi.downloadJson(clientId, runId)
        : await runsApi.downloadPdf(clientId, runId);
      const base = (run as any)?.display_id ?? runId.slice(0, 8);
      triggerDownload(blob, `${base}-report.${format}`);
    } finally {
      setDownloading(null);
    }
  }

  const { data: summary } = useQuery({
    queryKey: ["admin-run-detail", clientId, runId],
    queryFn: () => runsApi.get(clientId!, runId!),
    enabled: !!clientId && !!runId,
    refetchInterval: (q) => ACTIVE.has(q.state.data?.run?.status ?? "") ? 2000 : false,
  });

  const { data: prompts } = useQuery({
    queryKey: ["admin-run-prompts", clientId, runId],
    queryFn: () => runsApi.getPrompts(clientId!, runId!),
    enabled: summary?.run?.status === "completed",
  });

  const run = summary?.run;
  const overallPct = summary ? Math.round(summary.overall_citation_rate * 100) : null;

  const filteredPrompts = (prompts ?? []).filter((p) => {
    if (promptFilter === "cited") return p.results.some((r) => r.client_cited);
    if (promptFilter === "not_cited") return p.results.every((r) => !r.client_cited);
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb + download */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Link to={`/clients/${clientId}/runs`} className="hover:text-gray-200">← Runs</Link>
          <span>/</span>
          <span className="text-gray-300 font-mono">{(run as any)?.display_id ?? (runId?.slice(0, 8) + "…")}</span>
        </div>
        {run?.status === "completed" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownload("json")}
              disabled={!!downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {downloading === "json" ? "…" : "↓ JSON"}
            </button>
            <button
              onClick={() => handleDownload("pdf")}
              disabled={!!downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {downloading === "pdf" ? "…" : "↓ PDF"}
            </button>
          </div>
        )}
      </div>

      {/* Progress (if active) */}
      {run && ACTIVE.has(run.status) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <p className="text-sm font-semibold text-white">Run in progress</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30">
              {run.status}
            </span>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{run.completed_prompts} / {run.total_prompts} tasks</span>
              <span className="font-semibold text-gray-300">{run.total_prompts > 0 ? Math.round(run.completed_prompts / run.total_prompts * 100) : 0}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${run.total_prompts > 0 ? (run.completed_prompts / run.total_prompts) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Platform error banner */}
      {summary && Object.keys(summary.platform_errors ?? {}).length > 0 && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-400">
            {Object.keys(summary.platform_errors).length} platform{Object.keys(summary.platform_errors).length !== 1 ? "s" : ""} failed — results are partial
          </p>
          <ul className="space-y-1">
            {Object.entries(summary.platform_errors).map(([p, msg]) => (
              <li key={p} className="text-xs text-amber-300"><span className="font-semibold capitalize">{p}:</span> {msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary stats */}
      {summary && run?.status === "completed" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Citation Rate</p>
            <p className="text-3xl font-bold text-white">{overallPct}%</p>
            <p className="text-xs text-gray-500">{summary.total_analyses} responses</p>
          </div>
          {summary.platform_stats.map((ps: PlatformStats) => {
            const meta = PLATFORM_META[ps.platform];
            return (
              <div key={ps.platform} className={`bg-gray-900 border ${meta.border} rounded-xl p-4`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  <p className="text-xs text-gray-400">{meta.label}</p>
                </div>
                {ps.model_used && <p className="text-[10px] text-gray-600 mb-1">{ps.model_used}</p>}
                <p className="text-2xl font-bold text-white">{Math.round(ps.citation_rate * 100)}%</p>
                <p className="text-xs text-gray-500">{ps.cited_count}/{ps.total_responses}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Cost & Usage */}
      {run?.status === "completed" && clientId && runId && (
        <CostSection clientId={clientId} runId={runId} />
      )}

      {/* Competitor SoV */}
      {summary && summary.competitor_stats.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Competitor Share of Voice</h3>
          <div className="space-y-3">
            {summary.competitor_stats.slice(0, 5).map((c: CompetitorStats) => {
              const maxSoV = Math.max(...summary.competitor_stats.map((x) => x.share_of_voice), 0.01);
              return (
                <div key={c.brand}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300 font-medium">{c.brand}</span>
                    <span className="text-gray-500 font-mono text-xs">{Math.round(c.share_of_voice * 100)}% · {c.cited_count}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div className="bg-red-400/70 h-1.5 rounded-full" style={{ width: `${Math.round((c.share_of_voice / maxSoV) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prompt drill-down */}
      {run?.status === "completed" && prompts && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Prompt Drill-Down</h2>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5">
              {(["all", "cited", "not_cited"] as const).map((f) => (
                <button key={f} onClick={() => setPromptFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${promptFilter === f ? "bg-gray-700 text-white shadow-sm" : "text-gray-500 hover:text-gray-200"}`}>
                  {f === "all" ? `All (${prompts.length})` : f === "cited" ? "Cited" : "Not cited"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {filteredPrompts.map((p) => <PromptRow key={p.prompt_id} detail={p} />)}
            {filteredPrompts.length === 0 && (
              <p className="text-center py-8 text-sm text-gray-500">No prompts match this filter.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
