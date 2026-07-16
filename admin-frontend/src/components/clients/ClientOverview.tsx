import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { clientsApi, runsApi, costApi } from "../../api/client";
import type { KnowledgeBase } from "../../types";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function countKbSections(kb: KnowledgeBase | null): number {
  if (!kb) return 0;
  return [kb.brand_profile, kb.target_audience, kb.brand_voice, kb.industry_context]
    .reduce((n, s) => n + Object.keys(s ?? {}).length, 0);
}

function kbLastEdit(kb: KnowledgeBase | null): string {
  if (!kb) return "";
  const days = Math.floor((Date.now() - new Date(kb.updated_at).getTime()) / 86400000);
  return `v${kb.version}, last edit ${days}d ago`;
}

function fmtPausedAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeUntil(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime() - Date.now();
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  return `in ${Math.floor(h / 24)}d`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ dot, label, value, sub, trend }: {
  dot: string; label: string; value: string | number;
  sub?: string; trend?: { dir: "up" | "down"; label: string };
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <p className="text-xs text-gray-500 font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 flex items-center gap-0.5 font-medium ${trend.dir === "up" ? "text-emerald-600" : "text-red-500"}`}>
          {trend.dir === "up"
            ? <TrendingUpRoundedIcon style={{ fontSize: 13 }} />
            : <TrendingDownRoundedIcon style={{ fontSize: 13 }} />} {trend.label}
        </p>
      )}
      {sub && !trend && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// Terminal statuses that carry viewable results (partial = finished with drops).
const HAS_RESULTS = new Set(["completed", "partial"]);

const STATUS_HEX: Record<string, string> = {
  completed: "#10b981", partial: "#f97316", running: "#3b82f6",
  failed: "#ef4444", cancelled: "#9ca3af",
};
const STATUS_TEXT: Record<string, string> = {
  completed: "text-emerald-600", partial: "text-orange-600",
  running: "text-blue-600", failed: "text-red-500", cancelled: "text-gray-500",
};

function CircularProgress({ completed, total, status }: { completed: number; total: number; status: string }) {
  const pct = total > 0 ? Math.min(1, completed / total) : 0;
  const r = 44, circ = 2 * Math.PI * r;
  const color = STATUS_HEX[status] ?? "#9ca3af";
  return (
    <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-gray-900 leading-none">{Math.round(pct * 100)}%</span>
        <span className="text-[10px] text-gray-400 mt-0.5">{completed} of {total}</span>
      </div>
    </div>
  );
}

const PLATFORM_COLORS: Record<string, string> = {
  perplexity: "#3b82f6", openai: "#f59e0b", anthropic: "#10b981", gemini: "#ef4444",
};

// ── Main ──────────────────────────────────────────────────────────────────────

export function ClientOverview() {
  const { clientId } = useParams<{ clientId: string }>();
  const [citRange, setCitRange] = useState<"7d" | "30d" | "All">("30d");

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const { data: runs } = useQuery({
    queryKey: ["admin-runs", clientId, "overview"],
    queryFn: () => runsApi.list(clientId!, 1, 50),
    enabled: !!clientId,
  });

  const { data: costSummary } = useQuery({
    queryKey: ["admin-client-cost-summary", clientId],
    queryFn: () => costApi.getClientCostSummary(clientId!),
    enabled: !!clientId,
  });

  const lastRun = runs?.items[0];

  const { data: latestRunSummary } = useQuery({
    queryKey: ["admin-run-detail", clientId, lastRun?.id],
    queryFn: () => runsApi.get(clientId!, lastRun!.id),
    enabled: !!clientId && !!lastRun?.id && HAS_RESULTS.has(lastRun.status),
  });

  if (!client) return <div className="text-gray-400 text-sm">Loading...</div>;

  const schedEnabled  = client.schedule_enabled;
  const schedCadence  = client.schedule_cadence;
  const nextRun       = client.next_scheduled_run_at;
  const kbCount       = countKbSections(client.knowledge_base);
  const kbEdit        = kbLastEdit(client.knowledge_base);

  // Citation chart
  const allCitData = (runs?.items ?? [])
    .slice().reverse()
    .map((r, i) => ({
      index: i + 1,
      rate: r.overall_citation_rate != null ? Math.round(r.overall_citation_rate * 100) : null,
    }))
    .filter((d) => d.rate != null);

  const citData = citRange === "7d" ? allCitData.slice(-7) :
                  citRange === "30d" ? allCitData.slice(-30) : allCitData;

  const latestRate = citData[citData.length - 1]?.rate ?? 0;
  const bestRate   = citData.length ? Math.max(...citData.map(d => d.rate ?? 0)) : 0;
  const avgRate    = citData.length ? Math.round(citData.reduce((s, d) => s + (d.rate ?? 0), 0) / citData.length * 10) / 10 : 0;

  // Last-5 citation avg
  const last5 = (runs?.items ?? []).slice(0, 5).filter(r => r.overall_citation_rate != null);
  const last5Avg = last5.length
    ? `${Math.round(last5.reduce((s, r) => s + (r.overall_citation_rate ?? 0), 0) / last5.length * 100)}%`
    : "-";

  // Platform mix from latest run
  const platformMix = (latestRunSummary?.platform_stats ?? [])
    .map(ps => ({
      name: ps.platform.charAt(0).toUpperCase() + ps.platform.slice(1),
      value: ps.total_responses,
      pct:  Math.round(ps.citation_rate * 100),
      color: PLATFORM_COLORS[ps.platform] ?? "#9ca3af",
    }))
    .sort((a, b) => b.value - a.value);

  const totalPrompts = latestRunSummary?.run?.total_prompts ?? client.total_prompts;

  // Cost chart
  const costData = (costSummary?.cost_trend ?? []).slice(-7).map((p, i) => ({
    index: `#${i + 1}`,
    cost: p.cost_usd ?? 0,
  }));

  return (
    <div className="space-y-5">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          dot="bg-blue-500" label="Prompts" value={client.total_prompts}
          trend={{ dir: "up", label: "2 added this week" }}
        />
        <StatCard
          dot="bg-amber-400" label="Competitors" value={client.total_competitors}
          sub="add +3 to unlock SoV"
        />
        <StatCard
          dot="bg-emerald-500" label="KB sections" value={kbCount || "-"}
          sub={kbEdit || "not configured"}
        />
        <StatCard
          dot="bg-rose-400" label="Last 5 citation avg" value={last5Avg}
          trend={{ dir: "down", label: "1.4% vs prior" }}
        />
      </div>

      {/* ── Schedule banner ── */}
      {schedCadence !== "manual" && (
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          schedEnabled
            ? "bg-emerald-50 border-emerald-200"
            : "bg-amber-50 border-amber-200"
        }`}>
          {schedEnabled ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-600 shrink-0">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-amber-500 shrink-0">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          )}
          <div className="flex-1 min-w-0">
            {schedEnabled ? (
              <p className="text-sm font-semibold text-emerald-800">
                Schedule active
                {nextRun && <span className="font-normal text-emerald-700 ml-1">(next run {timeUntil(nextRun)})</span>}
              </p>
            ) : (
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Schedule paused</span>
                {client.last_scheduled_run_at && (
                  <span className="font-normal"> since {fmtPausedAt(client.last_scheduled_run_at)}</span>
                )}
                <span className="font-normal">, resume to fire next run on cadence</span>
              </p>
            )}
          </div>
          <Link
            to="schedule"
            className="shrink-0 px-4 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {schedEnabled ? "Pause" : "Resume"}
          </Link>
        </div>
      )}

      {/* ── Citation rate + Platform mix ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Citation rate chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Citation rate (last {citData.length} runs)</p>
              <p className="text-xs text-gray-400">% of prompts where {client.slug} was cited</p>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["7d", "30d", "All"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setCitRange(r)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    citRange === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {/* Stats row */}
          <div className="flex items-baseline gap-6 mb-4">
            {[
              { label: "Latest", value: `${latestRate}%` },
              { label: "Best",   value: `${bestRate}%`   },
              { label: "Avg",    value: `${avgRate}%`    },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
              </div>
            ))}
          </div>
          {citData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={citData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="citOvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="index" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                  formatter={(v) => [`${v}%`, "Citation rate"]}
                  labelFormatter={(l) => `Run #${l}`}
                />
                <Area type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2}
                  fill="url(#citOvGrad)" dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#3b82f6" }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-gray-400">No run data yet</div>
          )}
        </div>

        {/* Platform mix donut */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Platform mix</p>
          <p className="text-xs text-gray-400 mb-4">Citations by platform</p>
          {platformMix.length > 0 ? (
            <div className="flex items-center gap-5">
              <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
                <PieChart width={140} height={140}>
                  <Pie data={platformMix} cx={66} cy={66} innerRadius={48} outerRadius={66}
                    dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    {platformMix.map((_, i) => <Cell key={i} fill={platformMix[i].color} />)}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold text-gray-900">{totalPrompts}</span>
                  <span className="text-[10px] text-gray-400">prompts</span>
                </div>
              </div>
              <div className="space-y-2 flex-1">
                {platformMix.map((p) => (
                  <div key={p.name} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="text-xs text-gray-600">{p.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-900">{p.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-36 flex items-center justify-center text-sm text-gray-400">
              {lastRun ? "Loading..." : "No run data yet"}
            </div>
          )}
        </div>
      </div>

      {/* ── Latest run + Cost chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Latest run */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-900">Latest run</p>
            {lastRun && HAS_RESULTS.has(lastRun.status) && (
              <Link to={`/clients/${clientId}/runs/${lastRun.id}`}
                className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
                View run <ChevronRightRoundedIcon style={{ fontSize: 15 }} />
              </Link>
            )}
          </div>
          {lastRun ? (
            <>
              <p className="text-xs text-gray-400 mb-4">
                {lastRun.display_id ?? lastRun.id.slice(0, 12)}
                {", "}
                {new Date(lastRun.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
              <div className="flex items-center gap-6">
                <CircularProgress
                  completed={lastRun.completed_prompts}
                  total={lastRun.total_prompts}
                  status={lastRun.status}
                />
                <div className="space-y-3 flex-1">
                  {[
                    {
                      label: "Status",
                      value: (
                        <span className={`font-semibold capitalize flex items-center gap-1.5 ${
                          STATUS_TEXT[lastRun.status] ?? "text-gray-500"
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {lastRun.status.charAt(0).toUpperCase() + lastRun.status.slice(1)}
                        </span>
                      ),
                    },
                    {
                      label: "Citation",
                      value: lastRun.overall_citation_rate != null
                        ? `${Math.round(lastRun.overall_citation_rate * 100)}% (${Math.round(lastRun.overall_citation_rate * lastRun.total_prompts)}/${lastRun.total_prompts})`
                        : "-",
                    },
                    {
                      label: "Cost",
                      value: lastRun.cost_usd != null ? `$${lastRun.cost_usd.toFixed(3)}` : "-",
                    },
                    {
                      label: "Tokens",
                      value: costSummary?.avg_tokens_per_run != null
                        ? costSummary.avg_tokens_per_run.toLocaleString()
                        : "-",
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400 text-xs">{label}</span>
                      <span className="text-gray-900 text-xs font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-4">No runs yet.</p>
          )}
        </div>

        {/* Cost · last 7 runs */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Cost (last {costData.length} runs)</p>
          <p className="text-xs text-gray-400 mb-4">Per-run USD spend</p>
          {costData.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={costData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="index" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v) => [`$${Number(v).toFixed(3)}`, "Cost"]}
                />
                <Bar dataKey="cost" radius={[3, 3, 0, 0]}>
                  {costData.map((_, i) => (
                    <Cell key={i} fill={i === costData.length - 1 ? "#3b82f6" : "#bfdbfe"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-36 flex items-center justify-center text-sm text-gray-400">No cost data yet</div>
          )}
        </div>
      </div>

      {/* ── Usage & Cost ── */}
      {costSummary && costSummary.total_runs > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Usage &amp; Cost</p>
          <p className="text-xs text-gray-400 mb-4">All time</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              {
                label: "All-time cost",
                value: costSummary.total_cost_all_time_usd != null
                  ? `$${costSummary.total_cost_all_time_usd >= 1 ? costSummary.total_cost_all_time_usd.toFixed(2) : costSummary.total_cost_all_time_usd.toFixed(3)}`
                  : "-",
              },
              {
                label: "Tokens",
                value: costSummary.avg_tokens_per_run != null
                  ? (costSummary.avg_tokens_per_run * costSummary.total_runs).toLocaleString()
                  : "-",
              },
              {
                label: "30-day cost",
                value: costSummary.avg_cost_per_run_usd != null
                  ? `$${(costSummary.avg_cost_per_run_usd * costSummary.total_runs).toFixed(3)}`
                  : "-",
              },
              { label: "Runs", value: costSummary.total_runs },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
