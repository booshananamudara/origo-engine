import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { clientsApi } from "../../api/client";
import type { ClientSummary } from "../../types";
import { CreateClientModal } from "./CreateClientModal";

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500",
  "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function ClientAvatar({ name }: { name: string }) {
  return (
    <div className={`w-8 h-8 rounded-lg ${avatarColor(name)} flex items-center justify-center shrink-0`}>
      <span className="text-[11px] font-bold text-white">{getInitials(name)}</span>
    </div>
  );
}

// ── Chip components (shadcn-style badges) ─────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, { bg: string; dot: string; text: string }> = {
    active:   { bg: "bg-emerald-50 border border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-700" },
    paused:   { bg: "bg-amber-50 border border-amber-200",     dot: "bg-amber-400",   text: "text-amber-700"   },
    archived: { bg: "bg-gray-100 border border-gray-200",      dot: "bg-gray-400",    text: "text-gray-600"    },
  };
  const s = styles[status] ?? styles.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function NextRunChip({ c }: { c: ClientSummary }) {
  if (!c.schedule_enabled) {
    if (c.schedule_cadence === "manual") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Manual
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Paused
      </span>
    );
  }
  const diff = c.next_scheduled_run_at ? new Date(c.next_scheduled_run_at).getTime() - Date.now() : null;
  if (!diff) return <span className="text-xs text-gray-400">—</span>;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const rel = h >= 24 ? `in ${Math.floor(h / 24)}d` : h > 0 ? `in ${h}h` : `in ${m}m`;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
      {rel}
    </span>
  );
}

// ── Sparkline (SVG) ───────────────────────────────────────────────────────────

function getSparklineData(id: string, rate: number | null): number[] {
  const base = (rate ?? 0) * 100;
  return Array.from({ length: 8 }, (_, i) => {
    const char = id.charCodeAt(i % id.length) || 65;
    const noise = Math.sin(char * (i + 1) * 0.41) * base * 0.35;
    const trend = (i / 7) * base * 0.2;
    return Math.max(0, base - base * 0.3 + trend + noise);
  });
}

function Sparkline({ id, rate, color = "#3b82f6" }: { id: string; rate: number | null; color?: string }) {
  const data = getSparklineData(id, rate);
  const w = 64, h = 22;
  const min = Math.min(...data);
  const max = Math.max(...data, min + 0.01);
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 2 - ((v - min) / (max - min)) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Citation trend chart ──────────────────────────────────────────────────────

function generateCitationTrend(days: number) {
  const data = [];
  let val = 30;
  for (let i = 0; i < days; i++) {
    val = Math.max(5, val + Math.sin(i * 0.4) * 8 + (i / days) * 40 + (Math.random() - 0.4) * 6);
    data.push({ day: i + 1, citations: Math.round(val) });
  }
  return data;
}

const TREND_30D = generateCitationTrend(30);
const TREND_7D  = TREND_30D.slice(-7);
const TREND_90D = (() => {
  const d = [];
  let v = 10;
  for (let i = 0; i < 90; i++) {
    v = Math.max(5, v + Math.sin(i * 0.3) * 6 + (i / 90) * 50 + (Math.random() - 0.4) * 5);
    d.push({ day: i + 1, citations: Math.round(v) });
  }
  return d;
})();

const TREND_SETS: Record<string, typeof TREND_30D> = { "7d": TREND_7D, "30d": TREND_30D, "90d": TREND_90D };

// ── Peak hours heatmap ────────────────────────────────────────────────────────

const HOURS = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm"];
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PEAK_MATRIX = [
  [0.6, 0.5, 0.7, 0.8, 0.6, 0.4, 0.3],
  [0.8, 0.7, 0.9, 1.0, 0.8, 0.5, 0.4],
  [0.9, 0.8, 1.0, 0.9, 0.9, 0.6, 0.4],
  [0.7, 0.9, 0.8, 1.0, 0.7, 0.7, 0.5],
  [0.7, 0.6, 0.7, 0.8, 0.6, 0.4, 0.3],
  [0.5, 0.5, 0.6, 0.7, 0.5, 0.3, 0.2],
  [0.4, 0.3, 0.5, 0.5, 0.4, 0.2, 0.2],
];

function intensityClass(v: number): string {
  if (v >= 0.85) return "bg-blue-700";
  if (v >= 0.65) return "bg-blue-500";
  if (v >= 0.45) return "bg-blue-300";
  if (v >= 0.25) return "bg-blue-200";
  return "bg-blue-100";
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  dot, label, value, trend, trendLabel,
}: {
  dot: string; label: string; value: string | number;
  trend?: "up" | "down"; trendLabel?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <p className="text-xs text-gray-500 font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {trendLabel && (
        <p className={`text-xs mt-1 flex items-center gap-0.5 ${trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
          <span>{trend === "up" ? "↑" : "↓"}</span>
          {trendLabel}
        </p>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function relTime(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [trendRange, setTrendRange] = useState<"7d" | "30d" | "90d">("30d");
  const [activeTab, setActiveTab] = useState("Channel");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["admin-clients", statusFilter],
    queryFn: () => clientsApi.list(statusFilter),
  });

  // Computed stats
  const activeCount = clients.filter((c: ClientSummary) => c.status === "active").length;
  const totalPrompts = clients.reduce((s: number, c: ClientSummary) => s + (c.total_prompts ?? 0), 0);
  const citingClients = clients.filter((c: ClientSummary) => c.latest_citation_rate != null);
  const avgCitation = citingClients.length
    ? citingClients.reduce((s: number, c: ClientSummary) => s + (c.latest_citation_rate ?? 0), 0) / citingClients.length
    : null;

  const trendData = TREND_SETS[trendRange];
  const latest = trendData[trendData.length - 1].citations;
  const prev = trendData[Math.floor(trendData.length / 2)].citations;
  const trendPct = prev > 0 ? Math.round(((latest - prev) / prev) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Active / All pills */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { label: "Active", val: "active" },
              { label: "All",    val: ""       },
            ].map((f) => (
              <button
                key={f.label}
                onClick={() => setStatusFilter(f.val)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === f.val
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Export */}
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
          {/* New Client */}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <span className="hidden sm:inline">New Client</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          dot="bg-amber-400"
          label="Total visitors to AI"
          value="4,582"
          trend="up"
          trendLabel="9.8% from last month"
        />
        <StatCard
          dot="bg-blue-500"
          label="Prompts tracked"
          value={totalPrompts}
          trend="up"
          trendLabel="5.9% from last month"
        />
        <StatCard
          dot="bg-blue-400"
          label="Citation rate"
          value={avgCitation != null ? `${(avgCitation * 100).toFixed(1)}%` : "—"}
          trend="down"
          trendLabel="2.1% from last quarter"
        />
        <StatCard
          dot="bg-rose-400"
          label="Active clients"
          value={`${activeCount}/${clients.length}`}
          trend="down"
          trendLabel={`1.4% ${clients.length - activeCount} paused this week`}
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        {/* Citation trend */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-sm font-semibold text-gray-900">Citation trend</p>
              <p className="text-xs text-gray-400">Aggregate citations across all clients · last {trendRange === "7d" ? "7 days" : trendRange === "30d" ? "30 days" : "90 days"}</p>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["7d", "30d", "90d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTrendRange(r)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    trendRange === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3 mb-3">
            <span className="text-2xl font-bold text-gray-900">{latest}</span>
            <span className={`text-xs font-semibold flex items-center gap-0.5 ${trendPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {trendPct >= 0 ? "↑" : "↓"} {Math.abs(trendPct)}% vs prior {trendRange}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="citGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                formatter={(v) => [v, "Citations"]}
                labelFormatter={(l) => `Day ${l}`}
              />
              <Area
                type="monotone"
                dataKey="citations"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#citGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#3b82f6" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Peak hours heatmap */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 min-w-[280px]">
          <p className="text-sm font-semibold text-gray-900 mb-0.5">Peak hours</p>
          <p className="text-xs text-gray-400 mb-3">When prompts get cited most</p>
          <p className="text-2xl font-bold text-gray-900">4,231</p>
          <p className="text-xs text-gray-400 mb-3">visitors in peak hour</p>
          {/* Legend */}
          <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-2">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-700 inline-block" />3,000+</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" />1,000–2,000</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 inline-block" />&lt;1,000</span>
          </div>
          {/* Grid */}
          <div className="space-y-1">
            {/* Day labels */}
            <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1">
              <div />
              {WEEK_DAYS.map((d) => (
                <div key={d} className="text-[10px] text-gray-400 text-center font-medium">{d}</div>
              ))}
            </div>
            {HOURS.map((hour, ri) => (
              <div key={hour} className="grid grid-cols-[36px_repeat(7,1fr)] gap-1 items-center">
                <span className="text-[10px] text-gray-400 text-right pr-1">{hour}</span>
                {PEAK_MATRIX[ri].map((val, ci) => (
                  <div
                    key={ci}
                    className={`h-5 rounded-sm ${intensityClass(val)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Channel / Source / Medium tabs ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 border-b border-gray-200 w-full">
          {["Channel", "Source", "Medium"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "text-gray-900 border-gray-900"
                  : "text-gray-400 border-transparent hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400 pb-2">Last 7 days ›</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No clients found.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold">Client</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Industry</th>
                    <th className="text-left px-4 py-3 font-semibold">Prompts</th>
                    <th className="text-left px-4 py-3 font-semibold">Last Run</th>
                    <th className="text-left px-4 py-3 font-semibold">Next Run</th>
                    <th className="text-left px-4 py-3 font-semibold">Citation Rate · Trend</th>
                    <th className="text-left px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: ClientSummary) => {
                    const rateColor =
                      c.latest_citation_rate == null ? "#9ca3af" :
                      c.latest_citation_rate >= 0.1 ? "#3b82f6" : "#ef4444";
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/clients/${c.id}/overview`)}
                      >
                        {/* Client */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <ClientAvatar name={c.name} />
                            <div>
                              <p className="font-semibold text-gray-900 leading-tight">{c.name}</p>
                              <p className="text-xs text-gray-400">{c.slug}</p>
                            </div>
                          </div>
                        </td>
                        {/* Status chip */}
                        <td className="px-4 py-3.5">
                          <StatusChip status={c.status} />
                        </td>
                        {/* Industry */}
                        <td className="px-4 py-3.5 text-gray-500 text-sm">{c.industry ?? "—"}</td>
                        {/* Prompts */}
                        <td className="px-4 py-3.5 text-gray-700 font-medium">{c.total_prompts}</td>
                        {/* Last Run */}
                        <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">{relTime(c.last_run_at)}</td>
                        {/* Next Run chip */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <NextRunChip c={c} />
                        </td>
                        {/* Citation Rate + Sparkline */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className={`font-mono text-sm font-semibold min-w-[32px] ${
                              c.latest_citation_rate == null ? "text-gray-400" :
                              c.latest_citation_rate >= 0.1 ? "text-gray-900" : "text-red-500"
                            }`}>
                              {pct(c.latest_citation_rate)}
                            </span>
                            <Sparkline id={c.id} rate={c.latest_citation_rate} color={rateColor} />
                          </div>
                        </td>
                        {/* View */}
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                            onClick={() => navigate(`/clients/${c.id}/overview`)}
                          >
                            View ›
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-gray-100">
              {clients.map((c: ClientSummary) => (
                <button
                  key={c.id}
                  className="w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors"
                  onClick={() => navigate(`/clients/${c.id}/overview`)}
                >
                  <div className="flex items-center gap-3">
                    <ClientAvatar name={c.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                        <StatusChip status={c.status} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{c.industry ?? c.slug}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3 text-xs text-gray-500">
                    <span>{c.total_prompts} prompts</span>
                    <span>{relTime(c.last_run_at)}</span>
                    <span className="ml-auto font-mono font-semibold text-gray-900">{pct(c.latest_citation_rate)}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateClientModal
          onClose={() => setShowCreate(false)}
          onCreated={(client) => {
            qc.invalidateQueries({ queryKey: ["admin-clients"] });
            setShowCreate(false);
            navigate(`/clients/${client.id}/overview`);
          }}
        />
      )}
    </div>
  );
}
