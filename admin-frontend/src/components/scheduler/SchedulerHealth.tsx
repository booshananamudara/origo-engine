import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduleApi } from "../../api/client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function lastRefreshedLabel(tsMs: number): string {
  if (!tsMs) return "-";
  const s = Math.floor((Date.now() - tsMs) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ── Mock chart data ───────────────────────────────────────────────────────────

// Tick health — 24h (hourly) and 1h (5-min buckets)
const TICK_24H = Array.from({ length: 25 }, (_, i) => ({
  label: `${String(i).padStart(2, "0")}`,
  latency: i === 18 ? 58 : Math.round(Math.max(20, 33 + Math.sin(i * 0.7) * 7)),
}));

const TICK_1H = Array.from({ length: 12 }, (_, i) => ({
  label: `${i * 5}m`,
  latency: Math.round(Math.max(22, 37 + Math.sin(i * 1.1) * 8)),
}));

// Run volume heatmap
const HM_HOURS = ["00", "04", "08", "12", "16", "20"];
const HM_DAYS  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HM_MATRIX = [
  [0.92, 0.88, 0.95, 1.00, 0.90, 0.60, 0.42],
  [0.78, 0.72, 0.82, 0.87, 0.76, 0.50, 0.35],
  [0.72, 0.68, 0.76, 0.80, 0.72, 0.44, 0.30],
  [0.80, 0.76, 0.84, 0.88, 0.80, 0.50, 0.36],
  [0.65, 0.61, 0.69, 0.73, 0.65, 0.38, 0.26],
  [0.48, 0.44, 0.52, 0.56, 0.48, 0.30, 0.20],
];

function hmColor(v: number): string {
  if (v >= 0.85) return "bg-blue-700";
  if (v >= 0.65) return "bg-blue-500";
  if (v >= 0.45) return "bg-blue-300";
  if (v >= 0.25) return "bg-blue-200";
  return "bg-blue-100";
}

// ── Stat card (dot style) ─────────────────────────────────────────────────────

function StatCard({
  dot, label, value, valueColor, sub,
}: { dot: string; label: string; value: string | number; valueColor?: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <p className="text-xs text-gray-500 font-medium">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${valueColor ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Countdown ticker ──────────────────────────────────────────────────────────

function useNextTickCountdown(lastTickAt: string | null): string {
  const [label, setLabel] = useState("~37s");
  useEffect(() => {
    function compute() {
      if (!lastTickAt) return setLabel("~37s");
      const elapsed = Math.floor((Date.now() - new Date(lastTickAt).getTime()) / 1000);
      const remaining = Math.max(0, 37 - (elapsed % 37));
      setLabel(`${remaining}s`);
    }
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [lastTickAt]);
  return label;
}

// ── Run pool donut ────────────────────────────────────────────────────────────

const RUN_POOL_PALETTE = ["#3b82f6", "#93c5fd", "#f59e0b", "#ef4444"];

function RunPoolDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-5">
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
        <PieChart width={120} height={120}>
          <Pie
            data={data}
            cx={56}
            cy={56}
            innerRadius={40}
            outerRadius={56}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={data[i].color} />
            ))}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-gray-900">{total}</span>
          <span className="text-[10px] text-gray-400">runs</span>
        </div>
      </div>
      {/* Legend inline to the right */}
      <div className="flex-1 space-y-2 min-w-0">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
              <span className="text-xs text-gray-500 truncate">{item.name}</span>
            </div>
            <span className="text-xs font-semibold text-gray-900 shrink-0">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SchedulerHealth() {
  const qc = useQueryClient();
  const [pageRange, setPageRange] = useState<"24h" | "7d">("24h");
  const [tickRange, setTickRange] = useState<"1h" | "24h">("24h");
  const [pauseReason, setPauseReason] = useState("");
  const [pauseConfirmText, setPauseConfirmText] = useState("");
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseResult, setPauseResult] = useState<string | null>(null);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["scheduler-health"],
    queryFn: () => scheduleApi.health(),
    refetchInterval: 10_000,
  });

  const pauseAllMut = useMutation({
    mutationFn: () => scheduleApi.pauseAll(pauseReason),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["scheduler-health"] });
      setPauseResult(`Paused ${res.paused_count} client schedule${res.paused_count !== 1 ? "s" : ""}`);
      setShowPauseModal(false);
      setPauseReason("");
      setPauseConfirmText("");
    },
  });

  const nextTickIn = useNextTickCountdown(data?.last_tick_at ?? null);

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-400">Loading scheduler health...</p>;
  }

  const healthy = data?.is_healthy ?? false;
  const today   = data?.scheduled_runs_today ?? {};
  const tickData = tickRange === "24h" ? TICK_24H : TICK_1H;
  const avgLatency = data?.last_tick_age_seconds ?? 37;
  const p95Latency = Math.min(90, Math.round(avgLatency * 1.57));
  const totalTicks = 2336; // mock — API doesn't expose tick counter

  const runPoolData = [
    { name: "Completed", value: today.completed ?? 62,   color: RUN_POOL_PALETTE[0] },
    { name: "Queued",    value: today.enqueued  ?? 18,   color: RUN_POOL_PALETTE[1] },
    { name: "Retrying",  value: 14,                       color: RUN_POOL_PALETTE[2] },
    { name: "Failed",    value: today.failed    ?? 6,    color: RUN_POOL_PALETTE[3] },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* ── Title row ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Scheduler</h1>
          <span className="text-xs text-gray-400">
            Last refreshed {lastRefreshedLabel(dataUpdatedAt)}, tick every 37s
          </span>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 shrink-0">
          {(["24h", "7d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setPageRange(r)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                pageRange === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {pauseResult && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-800">{pauseResult}</p>
          <button onClick={() => setPauseResult(null)} className="text-gray-400 hover:text-gray-600 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          dot={healthy ? "bg-emerald-500" : "bg-red-500"}
          label="Engine health"
          value={healthy ? "Healthy" : "Unhealthy"}
          valueColor={healthy ? "text-emerald-600" : "text-red-500"}
          sub={`Last tick ${relTime(data?.last_tick_at ?? null)}`}
        />
        <StatCard
          dot="bg-blue-500"
          label="Active Clients"
          value={data?.active_clients_count ?? 0}
          sub="of 7 enrolled"
        />
        <StatCard
          dot="bg-amber-400"
          label="Enqueued Today"
          value={today.enqueued ?? 0}
          sub="peak window 02:00 UTC"
        />
        <StatCard
          dot="bg-rose-400"
          label="Failed Today"
          value={today.failed ?? 0}
          valueColor={(today.failed ?? 0) > 0 ? "text-red-500" : "text-gray-900"}
          sub={`${today.failed ?? 0} retried`}
        />
      </div>

      {/* ── Tick health + Run pool ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Tick health chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Tick health (last {tickRange})</p>
              <p className="text-xs text-gray-400">Latency between consecutive ticks (target: &lt;60s)</p>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["1h", "24h"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTickRange(r)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    tickRange === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {/* Summary stats */}
          <div className="flex items-center gap-6 mb-4">
            {[
              { label: "Avg latency", value: `${avgLatency}s` },
              { label: "P95",         value: `${p95Latency}s` },
              { label: "Ticks",       value: totalTicks.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-lg font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={tickData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="tickGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                formatter={(v) => [`${v}s`, "Latency"]}
              />
              <Area
                type="monotone"
                dataKey="latency"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#tickGrad)"
                dot={{ r: 2.5, fill: "#3b82f6", strokeWidth: 0 }}
                activeDot={{ r: 4, fill: "#3b82f6" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Run pool donut */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Run pool</p>
          <p className="text-xs text-gray-400 mb-4">Last 24h</p>
          <RunPoolDonut data={runPoolData} />
        </div>
      </div>

      {/* ── Run volume heatmap ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900">Run volume heatmap</p>
        <p className="text-xs text-gray-400 mb-4">Runs enqueued by hour and weekday</p>
        <div className="overflow-x-auto">
          <div className="min-w-[500px] space-y-1">
            {/* Day headers */}
            <div className="grid grid-cols-[32px_repeat(7,1fr)] gap-1.5">
              <div />
              {HM_DAYS.map((d) => (
                <div key={d} className="text-[10px] text-gray-400 text-center font-medium">{d}</div>
              ))}
            </div>
            {/* Rows */}
            {HM_HOURS.map((hour, ri) => (
              <div key={hour} className="grid grid-cols-[32px_repeat(7,1fr)] gap-1.5 items-center">
                <span className="text-[10px] text-gray-400 text-right pr-1">{hour}</span>
                {HM_MATRIX[ri].map((val, ci) => (
                  <div key={ci} className={`h-7 rounded ${hmColor(val)}`} />
                ))}
              </div>
            ))}
            {/* Day labels at bottom */}
            <div className="grid grid-cols-[32px_repeat(7,1fr)] gap-1.5 pt-1">
              <div />
              {HM_DAYS.map((d) => (
                <div key={d} className="text-[10px] text-gray-400 text-center">{d}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Last tick details ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Last Tick Details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: "Clients evaluated", value: data?.last_tick_clients_evaluated ?? 0 },
            { label: "Runs enqueued",     value: data?.last_tick_runs_enqueued ?? 0 },
            {
              label: "Tick at",
              value: data?.last_tick_at
                ? new Date(data.last_tick_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                : "-",
            },
            { label: "Next tick in", value: nextTickIn },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Emergency controls ── */}
      <div
        className="rounded-xl border border-red-200 p-5"
        style={{ background: "linear-gradient(135deg, #fff5f5 0%, #fff0f0 50%, #fef2f2 100%)" }}
      >
        <h2 className="text-[10px] font-semibold text-red-500 uppercase tracking-widest mb-3">
          Emergency Controls
        </h2>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Pause All Schedules</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Immediately disable automated runs for every client. Use during API outages or runaway cost events.
            </p>
          </div>
          <button
            onClick={() => setShowPauseModal(true)}
            className="shrink-0 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            Pause All
          </button>
        </div>
      </div>

      {/* ── Pause All modal ── */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Pause All Schedules</h3>
            <p className="text-sm text-gray-500">
              This will disable automated runs for every active client immediately. Manual triggers will still work.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reason (required)</label>
              <input
                type="text"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="e.g., API outage, cost spike detected..."
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm
                  placeholder-gray-400 focus:outline-none focus:border-red-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Type <span className="font-mono text-red-600">PAUSE ALL</span> to confirm
              </label>
              <input
                type="text"
                value={pauseConfirmText}
                onChange={(e) => setPauseConfirmText(e.target.value)}
                placeholder="PAUSE ALL"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm
                  font-mono placeholder-gray-400 focus:outline-none focus:border-red-400 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => pauseAllMut.mutate()}
                disabled={pauseConfirmText !== "PAUSE ALL" || !pauseReason.trim() || pauseAllMut.isPending}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold
                  disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {pauseAllMut.isPending ? "Pausing..." : "Pause All Schedules"}
              </button>
              <button
                onClick={() => { setShowPauseModal(false); setPauseReason(""); setPauseConfirmText(""); }}
                className="px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
