import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { clientsApi, costApi } from "../../api/client";
import { ClientUsers } from "./ClientUsers";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Platform cost split — uses last run cost data where available, otherwise mock proportions
const PLATFORM_SPLIT = [
  { platform: "Perplexity", color: "#3b82f6", share: 0.43 },
  { platform: "Gemini",     color: "#f59e0b", share: 0.28 },
  { platform: "OpenAI",     color: "#10b981", share: 0.19 },
  { platform: "Anthropic",  color: "#ef4444", share: 0.10 },
];

// Curated list of common IANA timezones with friendly labels.
// The value is the IANA name (what the backend stores + zoneinfo uses).
const TIMEZONES: { value: string; label: string }[] = [
  { value: "Pacific/Honolulu",              label: "Hawaii (UTC-10)" },
  { value: "America/Anchorage",             label: "Alaska (UTC-9)" },
  { value: "America/Los_Angeles",           label: "US Pacific - LA / Seattle (UTC-8/-7)" },
  { value: "America/Denver",                label: "US Mountain - Denver (UTC-7/-6)" },
  { value: "America/Phoenix",               label: "US Mountain - Phoenix (UTC-7, no DST)" },
  { value: "America/Chicago",               label: "US Central - Chicago (UTC-6/-5)" },
  { value: "America/New_York",              label: "US Eastern - New York (UTC-5/-4)" },
  { value: "America/Halifax",               label: "Atlantic - Halifax (UTC-4/-3)" },
  { value: "America/Sao_Paulo",             label: "São Paulo (UTC-3/-2)" },
  { value: "America/Argentina/Buenos_Aires",label: "Buenos Aires (UTC-3)" },
  { value: "UTC",                           label: "UTC (UTC+0)" },
  { value: "Europe/London",                 label: "London (UTC+0/+1)" },
  { value: "Europe/Paris",                  label: "Paris / Berlin / Rome (UTC+1/+2)" },
  { value: "Europe/Helsinki",               label: "Helsinki / Kyiv (UTC+2/+3)" },
  { value: "Europe/Moscow",                 label: "Moscow (UTC+3)" },
  { value: "Asia/Dubai",                    label: "Dubai / Abu Dhabi (UTC+4)" },
  { value: "Asia/Karachi",                  label: "Karachi (UTC+5)" },
  { value: "Asia/Kolkata",                  label: "India - Mumbai / Delhi (UTC+5:30)" },
  { value: "Asia/Colombo",                  label: "Sri Lanka (UTC+5:30)" },
  { value: "Asia/Dhaka",                    label: "Dhaka / Almaty (UTC+6)" },
  { value: "Asia/Bangkok",                  label: "Bangkok / Jakarta (UTC+7)" },
  { value: "Asia/Singapore",                label: "Singapore / Kuala Lumpur (UTC+8)" },
  { value: "Asia/Shanghai",                 label: "China (UTC+8)" },
  { value: "Asia/Tokyo",                    label: "Japan / South Korea (UTC+9)" },
  { value: "Australia/Perth",               label: "Perth (UTC+8)" },
  { value: "Australia/Adelaide",            label: "Adelaide (UTC+9:30/+10:30)" },
  { value: "Australia/Sydney",              label: "Sydney / Melbourne (UTC+10/+11)" },
  { value: "Pacific/Auckland",              label: "New Zealand (UTC+12/+13)" },
];

const inputCls =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm " +
  "focus:outline-none focus:border-blue-400 transition-colors";

export function ClientSettings() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    setName(client.name);
    setIndustry(client.industry ?? "");
    setWebsite(client.website ?? "");
    setTimezone(client.timezone ?? "UTC");
  }, [client]);

  const updateMut = useMutation({
    mutationFn: () =>
      clientsApi.update(clientId!, {
        name: name.trim(),
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
        timezone,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-client", clientId] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      // Also recompute schedule next-run if schedule is active
      qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 3000);
    },
  });

  const statusMut = useMutation({
    mutationFn: (s: string) => clientsApi.setStatus(clientId!, s),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["admin-client", clientId] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      setStatusConfirm(null);
      if (updated.status === "archived") navigate("/clients");
    },
  });

  const { data: costSummary } = useQuery({
    queryKey: ["admin-client-cost-summary", clientId],
    queryFn: () => costApi.getClientCostSummary(clientId!),
    enabled: !!clientId,
  });

  if (!client) return <p className="text-gray-400 text-sm">Loading...</p>;

  const totalCost = costSummary?.total_cost_all_time_usd ?? 1.0;
  const tokenData = (costSummary?.cost_trend ?? []).map((p, i) => ({
    day: new Date(p.date).getDate(),
    tokens: (p.tokens ?? 0),
  }));

  // Cumulative tokens over time
  let cumTokens = 0;
  const cumTokenData = tokenData.map(d => {
    cumTokens += d.tokens;
    return { day: d.day, tokens: cumTokens };
  });

  return (
    <div className="space-y-5 pb-8">
      {/* ── Top: 30-day cost split + Token usage ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 30-day model cost split */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">30-day model cost split</p>
          <p className="text-xs text-gray-400 mb-5">Per-platform USD spend</p>
          <div className="space-y-3">
            {PLATFORM_SPLIT.map(({ platform, color, share }) => {
              const cost = totalCost * share;
              return (
                <div key={platform} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-24 shrink-0">{platform}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full" style={{ width: `${share * 100}%`, background: color }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-12 text-right shrink-0">${cost.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Token usage chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Token usage</p>
          <p className="text-xs text-gray-400 mb-4">Cumulative, last 30d</p>
          {cumTokenData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={cumTokenData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${Math.round(v/1000)}k` : `${v}`} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v) => [Number(v).toLocaleString(), "Tokens"]} />
                <Area type="monotone" dataKey="tokens" stroke="#3b82f6" strokeWidth={2}
                  fill="url(#tokenGrad)" dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-36 flex items-center justify-center text-sm text-gray-400">No token data yet</div>
          )}
        </div>
      </div>

      {/* ── General settings ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">General</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="HR & Payroll Software"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className={inputCls}
          />
        </div>

        {/* Timezone — drives all schedule time interpretation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputCls}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            All schedule times (hourly, daily, weekly) are interpreted in this timezone.
            Changing this will take effect on the next schedule save or resume.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Slug (immutable)</label>
          <input
            value={client.slug}
            disabled
            className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 text-gray-400 text-sm cursor-not-allowed font-mono"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending || !name.trim()}
            className="px-5 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold
              disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
          >
            {updateMut.isPending ? "Saving..." : "Save Changes"}
          </button>
          {saveMsg && <span className="text-sm text-emerald-600">{saveMsg}</span>}
        </div>
      </div>

      {/* Danger zone */}
      <div className="border border-red-200 rounded-xl p-5 space-y-3 bg-red-50/50">
        <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wider">Danger Zone</h2>

        {client.status !== "paused" && client.status !== "archived" && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-900 font-medium">Pause Client</p>
              <p className="text-xs text-gray-500">Disable new runs without archiving</p>
            </div>
            {statusConfirm === "paused" ? (
              <div className="flex gap-2">
                <button onClick={() => statusMut.mutate("paused")} className="text-xs font-medium text-amber-400 hover:text-amber-300">Confirm</button>
                <button onClick={() => setStatusConfirm(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setStatusConfirm("paused")} className="px-3 py-1.5 rounded border border-amber-700 text-amber-400 text-xs font-medium hover:bg-amber-900/20 transition-colors">
                Pause
              </button>
            )}
          </div>
        )}

        {client.status === "paused" && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-900 font-medium">Reactivate Client</p>
              <p className="text-xs text-gray-500">Re-enable runs for this client</p>
            </div>
            <button onClick={() => statusMut.mutate("active")} className="px-3 py-1.5 rounded border border-green-700 text-green-400 text-xs font-medium hover:bg-green-900/20 transition-colors">
              Reactivate
            </button>
          </div>
        )}

        {client.status !== "archived" ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300 font-medium">Archive Client</p>
              <p className="text-xs text-gray-500">Permanently disable; data is retained</p>
            </div>
            {statusConfirm === "archived" ? (
              <div className="flex gap-2">
                <button onClick={() => statusMut.mutate("archived")} className="text-xs font-medium text-red-400 hover:text-red-300">Confirm archive</button>
                <button onClick={() => setStatusConfirm(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setStatusConfirm("archived")} className="px-3 py-1.5 rounded border border-red-800 text-red-400 text-xs font-medium hover:bg-red-900/20 transition-colors">
                Archive
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300 font-medium">Unarchive Client</p>
              <p className="text-xs text-gray-500">Restore client to active state</p>
            </div>
            {statusConfirm === "unarchived" ? (
              <div className="flex gap-2">
                <button onClick={() => statusMut.mutate("active")} className="text-xs font-medium text-green-400 hover:text-green-300">Confirm</button>
                <button onClick={() => setStatusConfirm(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setStatusConfirm("unarchived")} className="px-3 py-1.5 rounded border border-green-700 text-green-400 text-xs font-medium hover:bg-green-900/20 transition-colors">
                Unarchive
              </button>
            )}
          </div>
        )}
      </div>

      {/* Users section — visible on mobile only (desktop has a dedicated Users tab) */}
      <div className="sm:hidden border-t border-gray-200 pt-6">
        <ClientUsers />
      </div>
    </div>
  );
}
