import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import { runsApi, costApi } from "../../api/client";
import type { RunMode, RunSummaryItem, RunStatsPeriod } from "../../types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell,
} from "recharts";

// Group runs by week for outcomes chart
function groupByWeek(items: RunSummaryItem[]) {
  const weeks: Record<string, { completed: number; partial: number; failed: number }> = {};
  items.forEach((r) => {
    const d = new Date(r.created_at);
    const weekNum = Math.ceil(d.getDate() / 7);
    const key = `W${weekNum}`;
    if (!weeks[key]) weeks[key] = { completed: 0, partial: 0, failed: 0 };
    if (r.status === "completed") weeks[key].completed++;
    else if (r.status === "partial") weeks[key].partial++;
    else if (r.status === "failed") weeks[key].failed++;
  });
  return Object.entries(weeks).map(([label, v]) => ({ label, ...v }));
}

function fmtCost(usd: number | null | undefined): string {
  if (usd == null) return "-";
  return `$${usd.toFixed(3)}`;
}

// Actual engine working time. Staged runs sit idle between admin clicks, so
// updated_at - created_at overstates them — prefer the per-phase sum.
function workedMs(run: RunSummaryItem): number | null {
  const t = run.phase_timings;
  if (t) {
    const sum = (t.monitoring_ms ?? 0) + (t.analysis_ms ?? 0) + (t.generation_ms ?? 0);
    if (sum > 0) return sum;
  }
  const diff = new Date(run.updated_at).getTime() - new Date(run.created_at).getTime();
  return diff > 0 ? diff : null;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "-";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtDurationSecs(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const PERIOD_LABELS: Record<RunStatsPeriod, string> = {
  today: "Today", "7d": "7d", "30d": "30d", "90d": "90d",
};

const STATUS_STYLE: Record<string, string> = {
  pending:         "bg-amber-50 text-amber-700 border border-amber-200",
  running:         "bg-blue-50 text-blue-700 border border-blue-200",
  responses_ready: "bg-violet-50 text-violet-700 border border-violet-200",
  completed:       "bg-emerald-50 text-emerald-700 border border-emerald-200",
  partial:         "bg-orange-50 text-orange-700 border border-orange-200",
  failed:          "bg-red-50 text-red-700 border border-red-200",
  cancelled:       "bg-gray-100 text-gray-600 border border-gray-300",
};

// Human badge text where the raw enum value would read poorly.
const STATUS_LABEL: Record<string, string> = {
  responses_ready: "awaiting analysis",
};

const ACTIVE = new Set(["pending", "running"]);
// Terminal statuses that carry viewable results (partial = finished with drops).
const HAS_RESULTS = new Set(["completed", "partial"]);
// Statuses an admin can cancel: in-flight, or a staged run awaiting analysis.
const CANCELLABLE = new Set(["pending", "running", "responses_ready"]);

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatCard({ label, value, sub, subColor }: { label: string; value: string | number; sub?: ReactNode; subColor?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subColor ?? "text-gray-500"}`}>{sub}</p>}
    </div>
  );
}

export function ClientRuns() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-runs", clientId, page],
    queryFn: () => runsApi.list(clientId!, page),
    refetchInterval: (query) => {
      const items: RunSummaryItem[] = query.state.data?.items ?? [];
      return items.some((r) => ACTIVE.has(r.status)) ? 3000 : false;
    },
  });

  const { data: costSummary } = useQuery({
    queryKey: ["admin-client-cost-summary", clientId],
    queryFn: () => costApi.getClientCostSummary(clientId!),
    enabled: !!clientId,
  });

  // Windowed cost + P95 duration for the selected period. Drives the
  // Total cost card, its "vs prior" comparison, and the P95 sub-text.
  const [costPeriod, setCostPeriod] = useState<RunStatsPeriod>("7d");
  const { data: runStats } = useQuery({
    queryKey: ["admin-client-run-stats", clientId, costPeriod],
    queryFn: () => costApi.getClientRunStats(clientId!, costPeriod),
    enabled: !!clientId,
  });

  const triggerMut = useMutation({
    mutationFn: (mode: RunMode) => runsApi.trigger(clientId!, mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-runs", clientId] });
      setTriggerError(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setTriggerError(err.response?.data?.detail ?? "Failed to start run");
    },
  });

  // Staged runs: advance a parked run (responses_ready) into analysis.
  const analyzeMut = useMutation({
    mutationFn: (runId: string) => runsApi.analyze(clientId!, runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-runs", clientId] }),
  });

  // Kill switch (R4): cancel an in-flight run straight from the list.
  const cancelMut = useMutation({
    mutationFn: (runId: string) => runsApi.cancel(clientId!, runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-runs", clientId] }),
  });
  function confirmCancel(runId: string) {
    if (window.confirm("Cancel this run? No new API calls will be made. This cannot be undone.")) {
      cancelMut.mutate(runId);
    }
  }

  const totalPages = data ? Math.ceil(data.total / 20) : 1;
  const hasActive = (data?.items ?? []).some((r) => ACTIVE.has(r.status));
  const [outcomesRange, setOutcomesRange] = useState<"7d" | "30d">("30d");

  const items = data?.items ?? [];

  const completedCount = items.filter((r) => r.status === "completed").length;
  const partialCount = items.filter((r) => r.status === "partial").length;
  const failedCount = items.filter((r) => r.status === "failed").length;
  const completedWithDuration = items.filter((r) => HAS_RESULTS.has(r.status) && workedMs(r) != null);
  const avgDurationMs = completedWithDuration.length > 0
    ? completedWithDuration.reduce((s, r) => s + (workedMs(r) ?? 0), 0) / completedWithDuration.length
    : null;
  const avgDurationStr = avgDurationMs
    ? avgDurationMs >= 60000 ? `${Math.floor(avgDurationMs / 60000)}m ${Math.floor((avgDurationMs % 60000) / 1000)}s` : `${Math.floor(avgDurationMs / 1000)}s`
    : "-";
  // P95 duration — real 95th percentile over the selected window (backend).
  const p95Str = runStats?.p95_duration_seconds != null
    ? `P95 ${fmtDurationSecs(runStats.p95_duration_seconds)}`
    : "";

  // Windowed total cost + "vs prior period" comparison (backend).
  const priorLabel = costPeriod === "today" ? "vs yesterday" : `vs prior ${costPeriod}`;
  const costValue = runStats ? `$${runStats.total_cost_usd.toFixed(2)}` : "...";
  let costSub: ReactNode = "";
  let costSubColor = "text-gray-400";
  if (runStats) {
    if (runStats.run_count === 0) {
      costSub = "No runs in this period";
    } else if (runStats.prior_total_cost_usd <= 0) {
      costSub = `no prior spend ${priorLabel}`;
    } else {
      const change = (runStats.total_cost_usd - runStats.prior_total_cost_usd) / runStats.prior_total_cost_usd;
      const pctNum = Math.round(change * 100);
      const up = pctNum >= 0;
      costSub = (
        <span className="inline-flex items-center gap-0.5">
          {up
            ? <TrendingUpRoundedIcon style={{ fontSize: 13 }} />
            : <TrendingDownRoundedIcon style={{ fontSize: 13 }} />}
          {Math.abs(pctNum)}% {priorLabel}
        </span>
      );
      costSubColor = up ? "text-emerald-600" : "text-red-500";
    }
  }

  // Weekly grouped outcomes chart
  const rangeItems = outcomesRange === "7d" ? items.slice(0, 7) : items;
  const outcomesData = groupByWeek(rangeItems);

  // Cost trend chart (green)
  const costChartData = (costSummary?.cost_trend ?? []).map((p, i) => ({
    index: `#${i + 1}`,
    cost: p.cost_usd ?? 0,
  }));

  return (
    <div className="space-y-5">
      {/* Period filter — drives windowed cost + P95 */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(["today", "7d", "30d", "90d"] as const).map((p) => (
            <button key={p} onClick={() => setCostPeriod(p)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${costPeriod === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Completed"
          value={completedCount}
          sub={partialCount > 0
            ? `+ ${partialCount} partial (dropped calls)`
            : data?.total ? `${Math.round((completedCount / items.length) * 100)}% success rate` : undefined}
          subColor={partialCount > 0 ? "text-orange-600" : "text-emerald-600"}
        />
        <StatCard label="Failed" value={failedCount} sub="retry queue 0" subColor={failedCount > 0 ? "text-red-500" : "text-gray-400"} />
        <StatCard
          label="Total cost"
          value={costValue}
          sub={costSub || undefined}
          subColor={costSubColor}
        />
        <StatCard label="Avg duration" value={avgDurationStr} sub={p95Str || "completed runs"} />
      </div>

      {/* Charts row */}
      {(outcomesData.length > 0 || costChartData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Run outcomes stacked bar — weekly */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Run outcomes (last 30 days)</p>
                <p className="text-xs text-gray-400">Completed vs failed</p>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {(["7d", "30d"] as const).map((r) => (
                  <button key={r} onClick={() => setOutcomesRange(r)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${outcomesRange === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={outcomesData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="partial"   name="Partial"   stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed"    name="Failed"    stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />Completed</div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />Partial</div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />Failed</div>
            </div>
          </div>

          {/* Cost trend — green area chart */}
          {costChartData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-gray-900">Cost trend</p>
              <p className="text-xs text-gray-400 mb-4">USD per run, last {costChartData.length}</p>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={costChartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="index" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    formatter={(v) => [`$${Number(v).toFixed(3)}`, "Cost"]} />
                  <Area type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2}
                    fill="url(#costGreen)" dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#10b981" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Run history table */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-gray-900">Run history</span>
          <span className="text-xs text-gray-400 ml-2">Showing {items.length}</span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            {/* Secondary (staged): collect responses only, analyze/generate later */}
            <button
              onClick={() => triggerMut.mutate("staged")}
              disabled={triggerMut.isPending || hasActive}
              title="Collect AI responses only; run analysis and recommendations later, one click each"
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50
                text-gray-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors"
            >
              Prompt Run
            </button>
            {/* Primary: full package (monitoring → analysis → recommendations) */}
            <button
              onClick={() => triggerMut.mutate("full")}
              disabled={triggerMut.isPending || hasActive}
              className="shiny-btn flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700
                text-white text-sm font-semibold disabled:bg-gray-200 disabled:text-gray-400
                disabled:cursor-not-allowed transition-colors"
            >
              <PlayArrowRoundedIcon style={{ fontSize: 16 }} />
              {hasActive ? "Run in progress..." : "Analyze"}
            </button>
          </div>
          {triggerError && <p className="text-xs text-red-500 text-right max-w-[220px]">{triggerError}</p>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400">Loading...</p>
        ) : !data?.items.length ? (
          <p className="p-6 text-sm text-gray-400">No runs yet. Trigger the first run above.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold">Run ID</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Progress</th>
                    <th className="text-left px-4 py-3 font-semibold">Citation</th>
                    <th className="text-left px-4 py-3 font-semibold">Cost</th>
                    <th className="text-left px-4 py-3 font-semibold">Duration</th>
                    <th className="text-left px-4 py-3 font-semibold">Started</th>
                    <th className="text-left px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((run) => (
                    <tr key={run.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-500 font-semibold">
                        {run.display_id ?? run.id.slice(0, 8) + "..."}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${STATUS_STYLE[run.status] ?? ""}`}>
                          {ACTIVE.has(run.status) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                          {STATUS_LABEL[run.status] ?? run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-400"
                              style={{ width: `${(run.completed_prompts / Math.max(run.total_prompts, 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{run.completed_prompts}/{run.total_prompts}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {run.overall_citation_rate != null ? (
                          <span className={`font-mono text-sm font-semibold ${
                            run.overall_citation_rate >= 0.5 ? "text-emerald-600" :
                            run.overall_citation_rate >= 0.1 ? "text-amber-600" : "text-red-500"
                          }`}>
                            {Math.round(run.overall_citation_rate * 100)}%
                          </span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-500">{fmtCost(run.cost_usd)}</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {ACTIVE.has(run.status) ? "..." : fmtMs(workedMs(run))}
                      </td>
                      <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">{relTime(run.created_at)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Link
                            to={`/clients/${clientId}/runs/${run.id}`}
                            className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View <ArrowForwardRoundedIcon style={{ fontSize: 13 }} />
                          </Link>
                          {run.status === "responses_ready" && (
                            <button
                              onClick={() => analyzeMut.mutate(run.id)}
                              disabled={analyzeMut.isPending}
                              className="inline-flex items-center gap-0.5 text-xs text-violet-700 hover:text-violet-900 font-medium disabled:opacity-50"
                            >
                              <PlayArrowRoundedIcon style={{ fontSize: 14 }} /> Analyze
                            </button>
                          )}
                          {CANCELLABLE.has(run.status) && (
                            <button
                              onClick={() => confirmCancel(run.id)}
                              disabled={cancelMut.isPending}
                              className="inline-flex items-center gap-0.5 text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                            >
                              <CloseRoundedIcon style={{ fontSize: 13 }} /> Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-100">
              {data.items.map((run) => (
                <div key={run.id} className="px-4 py-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-500 font-semibold">
                      {run.display_id ?? run.id.slice(0, 8) + "..."}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${STATUS_STYLE[run.status] ?? ""}`}>
                      {ACTIVE.has(run.status) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                      {STATUS_LABEL[run.status] ?? run.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-500">{run.completed_prompts}/{run.total_prompts} tasks</span>
                    <span className="text-gray-400">{relTime(run.created_at)}</span>
                    {run.cost_usd != null && (
                      <span className="font-mono text-gray-500">{fmtCost(run.cost_usd)}</span>
                    )}
                    {!ACTIVE.has(run.status) && (
                      <span className="font-mono text-gray-500">{fmtMs(workedMs(run))}</span>
                    )}
                    {run.overall_citation_rate != null && (
                      <span className={`font-mono font-semibold ml-auto ${
                        run.overall_citation_rate >= 0.5 ? "text-emerald-600" :
                        run.overall_citation_rate >= 0.1 ? "text-amber-600" : "text-red-500"
                      }`}>
                        {Math.round(run.overall_citation_rate * 100)}%
                      </span>
                    )}
                    <Link to={`/clients/${clientId}/runs/${run.id}`} className="inline-flex items-center gap-0.5 text-blue-600 font-medium ml-auto">
                      View <ArrowForwardRoundedIcon style={{ fontSize: 13 }} />
                    </Link>
                    {run.status === "responses_ready" && (
                      <button
                        onClick={() => analyzeMut.mutate(run.id)}
                        disabled={analyzeMut.isPending}
                        aria-label="Start analysis"
                        className="text-violet-700 font-medium disabled:opacity-50"
                      >
                        <PlayArrowRoundedIcon style={{ fontSize: 16 }} />
                      </button>
                    )}
                    {CANCELLABLE.has(run.status) && (
                      <button
                        onClick={() => confirmCancel(run.id)}
                        disabled={cancelMut.isPending}
                        aria-label="Cancel run"
                        className="text-red-600 font-medium disabled:opacity-50"
                      >
                        <CloseRoundedIcon style={{ fontSize: 15 }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="px-4 sm:px-5 py-3 flex items-center justify-between border-t border-gray-100 text-sm text-gray-500">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-0.5 disabled:opacity-40 hover:text-gray-900 transition-colors px-2 py-1 rounded hover:bg-gray-100"
            >
              <ChevronLeftRoundedIcon style={{ fontSize: 16 }} /> Prev
            </button>
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-0.5 disabled:opacity-40 hover:text-gray-900 transition-colors px-2 py-1 rounded hover:bg-gray-100"
            >
              Next <ChevronRightRoundedIcon style={{ fontSize: 16 }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
