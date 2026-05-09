import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { runsApi } from "../../api/client";
import type { Platform, PromptAnalysisItem, PromptDetail, PlatformStats, CompetitorStats } from "../../types";

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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link to={`/clients/${clientId}/runs`} className="hover:text-gray-200">← Runs</Link>
        <span>/</span>
        <span className="text-gray-300 font-mono">{runId?.slice(0, 8)}…</span>
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
