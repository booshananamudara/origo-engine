import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { runsApi, costApi } from "../../api/client";
import type { Platform, PromptAnalysisItem, PromptDetail, PlatformStats, CompetitorStats, RunCostSummary } from "../../types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCost(usd: number | null | undefined, decimals = 3): string {
  if (usd == null) return "—";
  return `$${usd.toFixed(decimals)}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const ACTIVE = new Set(["pending", "running"]);
// Terminal statuses that carry viewable results (partial = finished with drops).
const HAS_RESULTS = new Set(["completed", "partial"]);

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial:   "bg-orange-50 text-orange-700 border-orange-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-300",
};
const STATUS_BADGE_DEFAULT = "bg-blue-50 text-blue-700 border-blue-200";

// The progress bar counts MONITORING calls only. Once it reads N/N the run is
// still working through analysis and recommendations — name the phase so a
// full bar + "running" doesn't look stuck.
function runPhase(run: {
  status: string;
  completed_prompts: number;
  total_prompts: number;
  generation_status?: string;
}): string {
  if (run.status === "pending") return "Queued";
  if (run.completed_prompts < run.total_prompts) return "Collecting AI responses";
  if (run.generation_status === "running") return "Generating recommendations";
  return "Analyzing responses";
}

// ── Platform meta ─────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  perplexity: "#3b82f6",
  openai:     "#10b981",
  anthropic:  "#8b5cf6",
  gemini:     "#f59e0b",
};

const PLATFORM_BG: Record<string, string> = {
  perplexity: "bg-blue-100 text-blue-800",
  openai:     "bg-emerald-100 text-emerald-800",
  anthropic:  "bg-purple-100 text-purple-800",
  gemini:     "bg-amber-100 text-amber-800",
};

const PLATFORM_LABEL: Record<string, string> = {
  perplexity: "Perplexity", openai: "OpenAI", anthropic: "Anthropic",
  gemini: "Gemini",
};

const PLATFORMS: Platform[] = ["perplexity", "openai", "anthropic", "gemini"];

const CITATION_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  recommended: { label: "Recommended", cls: "bg-green-50 text-green-700 border-green-200" },
  mentioned:   { label: "Mentioned",   cls: "bg-gray-100 text-gray-600 border-gray-200" },
  negative:    { label: "Negative",    cls: "bg-red-50 text-red-700 border-red-200" },
  hollow:      { label: "Hollow",      cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

// Single status shown per response: the quality label when the brand is cited,
// blank when it isn't. recommended/negative/hollow surface by name; any other
// cited form (neutral mention) collapses to a generic "Cited".
const CITED_DEFAULT = { label: "Cited", cls: "bg-blue-50 text-blue-700 border-blue-200" };

function citationCell(
  item?: { client_cited?: boolean | null; citation_type?: string | null },
): { label: string; cls: string } | null {
  if (!item || item.client_cited == null || !item.client_cited) return null; // brand absent / not analyzed → blank
  if (item.citation_type === "recommended" || item.citation_type === "negative" || item.citation_type === "hollow") {
    return CITATION_TYPE_BADGE[item.citation_type];
  }
  return CITED_DEFAULT;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ dot, label, value, sub }: { dot: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <p className="text-xs text-gray-500 font-medium">{label}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Updated platform response card ────────────────────────────────────────────

function PlatformCard({ item, runDate }: { item: PromptAnalysisItem; runDate?: string }) {
  const [showFull, setShowFull] = useState(false);
  const label   = PLATFORM_LABEL[item.platform] ?? item.platform;
  const bgCls   = PLATFORM_BG[item.platform]    ?? "bg-gray-100 text-gray-700";
  const color   = PLATFORM_COLORS[item.platform] ?? "#9ca3af";
  const truncated = item.raw_response.length > 220 && !showFull;
  const text = truncated ? item.raw_response.slice(0, 220) + "…" : item.raw_response;

  const signal = item.citation_opportunity === "high" ? "High signal" :
                 item.citation_opportunity === "medium" ? "Mid signal" : null;

  const sources = item.competitors_cited.slice(0, 3).map(c => c.brand.toLowerCase().replace(/\s+/g, "") + ".com");

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bgCls}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {label}
          </span>
          {runDate && <span className="text-xs text-gray-400">{runDate}</span>}
        </div>
        <div className="flex items-center gap-2">
          {item.client_cited != null && (() => {
            const status = citationCell(item);
            return (
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                status ? status.cls : "bg-gray-100 text-gray-600 border-gray-200"
              }`}>
                {status ? status.label : "Not cited"}
              </span>
            );
          })()}
          {signal && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              {signal}
            </span>
          )}
        </div>
      </div>

      {/* Response body */}
      <div className="px-4 py-3">
        <p className="text-sm text-gray-700 leading-relaxed">
          {text}
          {item.raw_response.length > 220 && (
            <button onClick={() => setShowFull(!showFull)} className="ml-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
              {showFull ? "less" : "… more"}
            </button>
          )}
        </p>
      </div>

      {/* Sources + Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-gray-100 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Sources</p>
          {sources.length > 0 ? (
            <p className="text-xs text-gray-500">{sources.join(" · ")}</p>
          ) : (
            <p className="text-xs text-gray-400">—</p>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
          <p className="text-xs text-gray-500 leading-snug">{item.reasoning ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

// ── Prompt drill-down view ────────────────────────────────────────────────────

function PromptDrilldownView({
  detail, summary, runDisplayId, onBack, totalCost,
}: {
  detail: PromptDetail;
  summary: { platform_stats: PlatformStats[]; competitor_stats: CompetitorStats[] };
  runDisplayId: string;
  onBack: () => void;
  totalCost: number | null;
}) {
  const results = detail.results;
  const citedPlatforms = results.filter(r => r.client_cited).length;
  const totalPlatforms = results.length;

  // Competitor share for this prompt
  const competitorMentions: Record<string, number> = {};
  results.forEach(r => r.competitors_cited.forEach(c => {
    competitorMentions[c.brand] = (competitorMentions[c.brand] ?? 0) + 1;
  }));
  const totalMentions = Object.values(competitorMentions).reduce((s, v) => s + v, 0);
  const clientMentions = citedPlatforms;
  const competitorShare = totalMentions > 0 ? Math.round((totalMentions / (totalMentions + clientMentions)) * 100) : 0;
  const clientShare = 100 - competitorShare;

  // Sorted competitor SOV
  const sortedCompetitors = Object.entries(competitorMentions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxMentions = sortedCompetitors[0]?.[1] ?? 1;

  // Client is shown as last bar (blue)
  const sovItems = [
    ...sortedCompetitors.map(([name, count]) => ({ name, pct: Math.round((count / (totalMentions + clientMentions)) * 100), isClient: false })),
    { name: "client", pct: clientShare > 0 ? clientShare : Math.round(clientMentions / Math.max(totalMentions + clientMentions, 1) * 100), isClient: true },
  ];

  // Sentiment by platform
  const sentimentData = results.map(r => ({
    platform: PLATFORM_LABEL[r.platform] ?? r.platform,
    positive: r.client_sentiment === "positive" ? 1 : 0,
    neutral:  r.client_sentiment === "neutral" ? 1 : 0,
    negative: r.client_sentiment === "negative" ? 1 : 0,
  }));

  // Estimated cost per prompt
  const promptCost = totalCost != null ? totalCost / Math.max(detail.results.length * totalPlatforms, 1) : null;

  const runDate = results[0] ? "May 28 · 11:42" : "";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 shrink-0">
            ← Run
          </button>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">Prompt drill-down</p>
            <p className="text-xs text-gray-400">{runDisplayId} · {detail.results.length} platforms</p>
          </div>
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard dot="bg-blue-500" label="Cited platforms" value={`${citedPlatforms}/${totalPlatforms}`}
          sub={results.filter(r => r.client_cited).map(r => PLATFORM_LABEL[r.platform] ?? r.platform).join(", ") || "None"} />
        <StatCard dot="bg-amber-400" label="Competitor share" value={`${competitorShare}%`}
          sub={`vs client ${clientShare}%`} />
        <StatCard dot="bg-blue-400" label="Sources used"
          value={results.flatMap(r => r.competitors_cited).length}
          sub={results.flatMap(r => r.competitors_cited).slice(0, 3).map(c => c.brand.toLowerCase()).join(", ") || "—"} />
        <StatCard dot="bg-rose-400" label="Cost"
          value={promptCost != null ? fmtCost(promptCost, 3) : "—"}
          sub="this prompt only" />
      </div>

      {/* Competitor SOV + Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Competitor SOV for this prompt */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Competitor share of voice · this prompt</p>
          <p className="text-xs text-gray-400 mb-4">Mentions across {totalPlatforms} AI platform answers</p>
          <div className="space-y-3">
            {sovItems.map(({ name, pct, isClient }) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-36 shrink-0 truncate">{name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{
                    width: `${pct}%`,
                    background: isClient
                      ? "linear-gradient(to right, #3b82f6, #bfdbfe)"
                      : "linear-gradient(to right, #f87171, #fecaca)",
                  }} />
                </div>
                <span className="text-sm font-semibold text-gray-700 w-8 text-right shrink-0">{pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sentiment by platform */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Sentiment by platform</p>
          <p className="text-xs text-gray-400 mb-4"> </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={sentimentData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="platform" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Bar dataKey="positive" name="Positive" stackId="a" fill="#10b981" />
              <Bar dataKey="neutral"  name="Neutral"  stackId="a" fill="#f59e0b" />
              <Bar dataKey="negative" name="Negative" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2">
            {[["#10b981", "Positive"], ["#f59e0b", "Neutral"], ["#ef4444", "Negative"]].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Prompt text + platform filter */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm text-gray-700 font-medium truncate flex-1 mr-4">
            Prompt: {detail.prompt_text}
          </p>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 shrink-0">
            <button className="px-2.5 py-1 text-xs font-medium rounded-md bg-white text-gray-900 shadow-sm">
              All ({results.length})
            </button>
            <button className="px-2.5 py-1 text-xs font-medium rounded-md text-gray-500 hover:text-gray-700">
              Cited
            </button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {results.map(item => <PlatformCard key={item.response_id} item={item} runDate={runDate} />)}
        </div>
      </div>
    </div>
  );
}

// ── Main RunDetail ─────────────────────────────────────────────────────────────

export function RunDetail() {
  const { clientId, runId } = useParams<{ clientId: string; runId: string }>();
  const [promptFilter, setPromptFilter] = useState<"all" | "cited">("all");
  const [selectedPrompt, setSelectedPrompt] = useState<PromptDetail | null>(null);
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
    } finally { setDownloading(null); }
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
    enabled: HAS_RESULTS.has(summary?.run?.status ?? ""),
  });

  // Live spend (R5): fetched during the run too, ticking while it's active.
  const { data: cost } = useQuery<RunCostSummary>({
    queryKey: ["admin-run-costs", clientId, runId],
    queryFn: () => costApi.getRunCosts(clientId!, runId!),
    enabled: !!summary?.run,
    refetchInterval: (q) =>
      ACTIVE.has(summary?.run?.status ?? "") ? 5000 : false,
  });

  // Kill switch (R4): stop the run — no new API spend after confirmation.
  const qc = useQueryClient();
  const cancelMut = useMutation({
    mutationFn: () => runsApi.cancel(clientId!, runId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-run-detail", clientId, runId] });
      qc.invalidateQueries({ queryKey: ["admin-runs", clientId] });
    },
  });

  const run = summary?.run;
  const overallPct = summary ? Math.round(summary.overall_citation_rate * 100) : null;
  const displayId = (run as any)?.display_id ?? (runId?.slice(0, 8) + "…");

  const runDate = run?.created_at
    ? new Date(run.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  const filteredPrompts = (prompts ?? []).filter((p) =>
    promptFilter === "cited" ? p.results.some(r => r.client_cited) : true
  );

  // Citation by prompt data
  const citationByPrompt = (prompts ?? []).slice(0, 10).map((p, i) => ({
    label: `P${i + 1}`,
    cited: p.results.filter(r => r.client_cited).length,
    total: p.results.length,
  }));

  // Platform breakdown donut
  const platformDonut = (summary?.platform_stats ?? []).map(ps => ({
    name: PLATFORM_LABEL[ps.platform] ?? ps.platform,
    value: Math.max(ps.cited_count, ps.total_responses > 0 ? 0.1 : 0),
    pct: Math.round(ps.citation_rate * 100),
    color: PLATFORM_COLORS[ps.platform] ?? "#9ca3af",
  }));

  // Cost by platform bar data
  const costByPlatform = Object.entries(cost?.cost_by_platform ?? {}).map(([p, d]) => ({
    label: PLATFORM_LABEL[p] ?? p,
    tokens: d.tokens,
    cost: d.cost_usd,
  }));

  // If prompt is selected, show drill-down
  if (selectedPrompt && summary) {
    return (
      <div className="p-4 sm:p-6">
        <PromptDrilldownView
          detail={selectedPrompt}
          summary={summary}
          runDisplayId={displayId}
          onBack={() => setSelectedPrompt(null)}
          totalCost={cost?.total_cost_usd ?? null}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/clients/${clientId}/runs`}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 shrink-0">
            ← Runs
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 font-mono">{displayId}</h1>
              {run && (
                <span className="flex items-center gap-2 text-xs text-gray-400">
                  {runDate}
                  {" · Manual · "}
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
                    STATUS_BADGE[run.status] ?? STATUS_BADGE_DEFAULT
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => handleDownload("json")} disabled={!!downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            ↓ JSON
          </button>
          <button onClick={() => handleDownload("pdf")} disabled={!!downloading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-900 hover:bg-gray-700 text-white disabled:opacity-50 transition-colors">
            PDF
          </button>
        </div>
      </div>

      {/* Active run progress */}
      {run && ACTIVE.has(run.status) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <p className="text-sm font-semibold text-gray-900">
                Run in progress — {runPhase(run)}
              </p>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase bg-blue-50 text-blue-600 border border-blue-200">{run.status}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                Spend so far: <span className="font-mono font-semibold text-gray-800">{fmtCost(cost?.total_cost_usd, 2)}</span>
              </span>
              <button
                onClick={() => {
                  if (window.confirm("Cancel this run? No new API calls will be made; calls already in flight finish within their timeout. This cannot be undone.")) {
                    cancelMut.mutate();
                  }
                }}
                disabled={cancelMut.isPending}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                {cancelMut.isPending ? "Cancelling…" : "✕ Cancel run"}
              </button>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{run.completed_prompts} / {run.total_prompts} tasks</span>
              <span className="font-semibold text-gray-700">{run.total_prompts > 0 ? Math.round(run.completed_prompts / run.total_prompts * 100) : 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${run.total_prompts > 0 ? (run.completed_prompts / run.total_prompts) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Cancelled run note */}
      {run?.status === "cancelled" && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-700">Run cancelled</p>
          <p className="text-xs text-gray-500 mt-1">
            Stopped by an admin at {run.completed_prompts}/{run.total_prompts} calls
            {cost?.total_cost_usd != null && <> · {fmtCost(cost.total_cost_usd, 2)} spent before the stop</>}.
            No new API calls were made after cancellation.
          </p>
        </div>
      )}

      {/* Platform errors */}
      {summary && Object.keys(summary.platform_errors ?? {}).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">{Object.keys(summary.platform_errors).length} platform(s) failed — results are partial</p>
          {Object.entries(summary.platform_errors).map(([p, msg]) => (
            <p key={p} className="text-xs text-amber-700"><span className="font-semibold capitalize">{p}:</span> {msg}</p>
          ))}
        </div>
      )}

      {/* ── 4 Stat cards ── */}
      {summary && HAS_RESULTS.has(run?.status ?? "") && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <StatCard dot="bg-emerald-500" label="Citation rate"
            value={`${overallPct}%`}
            sub={`hollow excluded · ${summary.total_analyses} responses`}
          />
          <StatCard dot="bg-green-500" label="Recommended"
            value={`${Math.round((summary.citation_quality?.recommended_pct ?? 0) * 100)}%`}
            sub={`${summary.citation_quality?.recommended ?? 0} of ${summary.citation_quality?.effective_total ?? 0} cited`}
          />
          <StatCard dot="bg-rose-400" label="Negative"
            value={`${Math.round((summary.citation_quality?.negative_pct ?? 0) * 100)}%`}
            sub={`${summary.citation_quality?.negative ?? 0} flagged`}
          />
          <StatCard dot="bg-amber-400" label="Hollow"
            value={summary.hollow_citation_count ?? 0}
            sub="excluded from rate"
          />
        </div>
      )}

      {/* ── Citation by prompt + Platform breakdown ── */}
      {run && HAS_RESULTS.has(run.status) && citationByPrompt.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
          {/* Citation by prompt bar chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-900">Citation by prompt</p>
            <p className="text-xs text-gray-400 mb-4">% cited across {run.total_prompts} prompts in this run</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={citationByPrompt} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v, n, p) => [p.payload.cited === 0 ? "0" : v, "Platforms cited"]} />
                <Bar dataKey="total" fill="#bfdbfe" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cited" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Platform breakdown donut */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-900">Platform breakdown</p>
            <p className="text-xs text-gray-400 mb-4">Where citations landed</p>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
                <PieChart width={120} height={120}>
                  <Pie data={platformDonut.length ? platformDonut : [{ value: 1, color: "#e5e7eb" }]}
                    cx={56} cy={56} innerRadius={40} outerRadius={56}
                    dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    {(platformDonut.length ? platformDonut : [{ color: "#e5e7eb" }]).map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold text-gray-900">{overallPct}%</span>
                  <span className="text-[10px] text-gray-400">cited</span>
                </div>
              </div>
              <div className="space-y-1.5 flex-1">
                {(summary?.platform_stats ?? []).map(ps => (
                  <div key={ps.platform} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[ps.platform] ?? "#9ca3af" }} />
                      <span className="text-gray-600">{PLATFORM_LABEL[ps.platform] ?? ps.platform}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{Math.round(ps.citation_rate * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Competitor SOV + Cost & usage ── */}
      {summary && (summary.competitor_stats.length > 0 || cost) && (
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
          {/* Competitor SOV */}
          {summary.competitor_stats.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900">Competitor share of voice</p>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button className="px-2.5 py-1 text-xs font-medium rounded-md bg-white text-gray-900 shadow-sm">
                    All ({run?.total_prompts ?? 0})
                  </button>
                  <button className="px-2.5 py-1 text-xs font-medium rounded-md text-gray-500 hover:text-gray-700">
                    Cited
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-4">% of total competitor mentions across this run</p>
              <div className="space-y-3">
                {summary.competitor_stats.slice(0, 5).map((c: CompetitorStats) => {
                  const max = Math.max(...summary.competitor_stats.map(x => x.share_of_voice), 0.01);
                  return (
                    <div key={c.brand} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-32 shrink-0 truncate">{c.brand}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{
                          width: `${(c.share_of_voice / max) * 100}%`,
                          background: "linear-gradient(to right, #f87171, #fecaca)",
                        }} />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 w-9 text-right shrink-0">{Math.round(c.share_of_voice * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cost & usage */}
          {cost && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900">Cost &amp; usage</p>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                {fmtCost(cost.total_cost_usd)} · {cost.total_tokens?.toLocaleString()} tokens
              </p>
              {costByPlatform.length > 0 && (
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={costByPlatform} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={18}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      formatter={(v) => [Number(v).toLocaleString(), "Tokens"]} />
                    <Bar dataKey="tokens" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
                {cost.breakdown?.monitoring && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Monitoring</span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-gray-700">{cost.breakdown.monitoring.tokens?.toLocaleString()} tok</span>
                      <span className="font-mono text-gray-700 w-14 text-right">{fmtCost(cost.breakdown.monitoring.cost_usd)}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-gray-900">Total</span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-gray-900">{cost.total_tokens?.toLocaleString()} tok</span>
                    <span className="font-mono text-gray-900 w-14 text-right">{fmtCost(cost.total_cost_usd)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Prompt drill-down table ── */}
      {HAS_RESULTS.has(run?.status ?? "") && prompts && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">Prompt drill-down</p>
              <p className="text-xs text-gray-400">Tap a prompt for per-platform output</p>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["all", "cited"] as const).map((f) => (
                <button key={f} onClick={() => setPromptFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${promptFilter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {f === "all" ? `All (${prompts.length})` : "Cited"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Prompt</th>
                  {PLATFORMS.map(p => (
                    <th key={p} className="text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {PLATFORM_LABEL[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPrompts.map((p) => (
                  <tr key={p.prompt_id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedPrompt(p)}>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                      <span className="line-clamp-1">{p.prompt_text}</span>
                    </td>
                    {PLATFORMS.map(platform => {
                      const result = p.results.find(r => r.platform === platform);
                      const status = citationCell(result);
                      return (
                        <td key={platform} className="px-3 py-3 text-center">
                          {status ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${status.cls}`}>
                              {status.label}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-sm">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredPrompts.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No prompts match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
