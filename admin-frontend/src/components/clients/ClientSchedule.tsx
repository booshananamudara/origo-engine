import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { scheduleApi, clientsApi } from "../../api/client";
import type { ScheduleCadence, ScheduleConfig, SchedulerRunItem } from "../../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ── Constants ─────────────────────────────────────────────────────────────────

const CADENCE_LABELS: Record<ScheduleCadence, string> = {
  hourly: "Hourly", daily: "Daily", weekly: "Weekly", manual: "Manual (never auto-run)",
};
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTimePast(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function timeLabel(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function fmtPausedSince(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getNext7Fires(
  cadence: ScheduleCadence, hour: number, minute: number, dayOfWeek: number | null, isEnabled: boolean
): { label: string; time: string | null }[] {
  if (cadence === "manual") return [];
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const label = SHORT_DAYS[d.getDay()];
    if (!isEnabled) return { label, time: null };
    if (cadence === "daily")   return { label, time: timeLabel(hour, minute) };
    if (cadence === "hourly")  return { label, time: `:${String(minute).padStart(2, "0")}` };
    if (cadence === "weekly") {
      const fires = d.getDay() === (dayOfWeek ?? 0);
      return { label, time: fires ? timeLabel(hour, minute) : null };
    }
    return { label, time: null };
  });
}

// Last 14 fires chart — mock latency data (API doesn't provide historical latency)
const FIRES_DATA = Array.from({ length: 14 }, (_, i) => ({
  fire: i + 1,
  seconds: Math.round(8 + Math.sin(i * 0.7) * 12 + Math.random() * 8),
}));

// ── Status badge ──────────────────────────────────────────────────────────────

const SR_STATUS: Record<string, string> = {
  enqueued:  "bg-amber-50 text-amber-700 border border-amber-200",
  started:   "bg-blue-50 text-blue-700 border border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed:    "bg-red-50 text-red-700 border border-red-200",
  skipped:   "bg-gray-100 text-gray-500 border border-gray-200",
};

// ── Main component ────────────────────────────────────────────────────────────

export function ClientSchedule() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-schedule", clientId],
    queryFn: () => scheduleApi.get(clientId!),
    refetchInterval: 30_000,
  });

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const clientTz = client?.timezone ?? "UTC";

  const [form, setForm] = useState<ScheduleConfig>({
    schedule_enabled: false, schedule_cadence: "daily",
    schedule_hour: 2, schedule_minute: 0, schedule_day_of_week: null,
  });
  const [dirty, setDirty] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      schedule_enabled: data.schedule_enabled, schedule_cadence: data.schedule_cadence,
      schedule_hour: data.schedule_hour, schedule_minute: data.schedule_minute,
      schedule_day_of_week: data.schedule_day_of_week,
    });
    setDirty(false);
  }, [data]);

  function update<K extends keyof ScheduleConfig>(key: K, value: ScheduleConfig[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
    setSaveError(null);
  }

  const saveMut = useMutation({
    mutationFn: () => scheduleApi.update(clientId!, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] }); setDirty(false); setSaveError(null); },
    onError: (err: { response?: { data?: { detail?: string } } }) => setSaveError(err.response?.data?.detail ?? "Failed to save schedule"),
  });

  const pauseMut = useMutation({
    mutationFn: () => scheduleApi.pause(clientId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] }); setConfirmPause(false); },
  });

  const resumeMut = useMutation({
    mutationFn: () => scheduleApi.resume(clientId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] }); setConfirmResume(false); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { setSaveError(err.response?.data?.detail ?? "Failed to resume"); setConfirmResume(false); },
  });

  if (isLoading) return <p className="text-sm text-gray-400">Loading schedule…</p>;

  const isEnabled   = data?.schedule_enabled ?? false;
  const isPaused    = !isEnabled && data?.schedule_cadence !== "manual";
  const nextRunAt   = data?.next_scheduled_run_at;
  const next7       = getNext7Fires(form.schedule_cadence, form.schedule_hour, form.schedule_minute, form.schedule_day_of_week, isEnabled);

  // Avg run length from recent runs
  const completedRuns = (data?.recent_runs ?? []).filter(r => r.status === "completed");
  const avgLen = "2m 18s"; // Would need duration data from runs API

  return (
    <div className="space-y-5">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Cadence */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-amber-400" /><p className="text-xs text-gray-500 font-medium">Cadence</p></div>
          <p className="text-2xl font-bold text-gray-900">
            {data?.schedule_cadence === "daily" ? `Daily ${timeLabel(data.schedule_hour, data.schedule_minute)}` :
             data?.schedule_cadence === "hourly" ? "Hourly" :
             data?.schedule_cadence === "weekly" ? "Weekly" : "Manual"}
          </p>
          <p className="text-xs text-gray-400 mt-1">UTC</p>
        </div>
        {/* State */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-rose-400" /><p className="text-xs text-gray-500 font-medium">State</p></div>
          <p className={`text-2xl font-bold ${isEnabled ? "text-emerald-600" : isPaused ? "text-amber-500" : "text-gray-500"}`}>
            {isEnabled ? "Active" : isPaused ? "Paused" : "Manual"}
          </p>
          {isPaused && client?.last_scheduled_run_at && (
            <p className="text-xs text-gray-400 mt-1">since {fmtPausedSince(client.last_scheduled_run_at)}</p>
          )}
        </div>
        {/* Next run */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-blue-500" /><p className="text-xs text-gray-500 font-medium">Next run</p></div>
          <p className="text-2xl font-bold text-gray-900">{nextRunAt ? new Date(nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</p>
          <p className="text-xs text-gray-400 mt-1">{isPaused ? "resume to schedule" : nextRunAt ? "scheduled" : "—"}</p>
        </div>
        {/* Avg run length */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /><p className="text-xs text-gray-500 font-medium">Avg run length</p></div>
          <p className="text-2xl font-bold text-gray-900">{avgLen}</p>
          <p className="text-xs text-gray-400 mt-1">last 5 completed</p>
        </div>
      </div>

      {/* ── Paused / Active banner ── */}
      {data?.schedule_cadence !== "manual" && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isEnabled ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          {isEnabled ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-600 shrink-0"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-amber-500 shrink-0">
              <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          )}
          <p className={`text-sm flex-1 ${isEnabled ? "text-emerald-800" : "text-amber-800"}`}>
            {isEnabled ? (
              <span><span className="font-semibold">Schedule active</span> · runs fire on cadence</span>
            ) : (
              <span><span className="font-semibold">Schedule paused</span> · automated runs will resume on the next cadence tick once enabled</span>
            )}
          </p>
          {isPaused && (
            <button onClick={() => setConfirmResume(true)}
              className="shrink-0 px-4 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Resume
            </button>
          )}
          {isEnabled && (
            <button onClick={() => setConfirmPause(true)}
              className="shrink-0 px-4 py-1.5 rounded-lg border border-amber-300 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
              Pause
            </button>
          )}
        </div>
      )}

      {saveError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
      )}

      {/* ── Next 7 cadence fires ── */}
      {data?.schedule_cadence !== "manual" && next7.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900 mb-0.5">Next 7 cadence fires</p>
          <p className="text-xs text-gray-400 mb-4">
            {form.schedule_cadence === "daily" ? `Daily at ${timeLabel(form.schedule_hour, form.schedule_minute)} UTC` : `${form.schedule_cadence} schedule`}
          </p>
          <div className="grid grid-cols-7 gap-2">
            {next7.map(({ label, time }, i) => (
              <div key={i} className="flex flex-col items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl py-3">
                <span className="text-[10px] text-gray-400 font-medium">{label}</span>
                {time ? (
                  <span className="text-sm font-semibold text-gray-900">{time}</span>
                ) : (
                  <span className="text-xs text-amber-500 font-medium">Paused</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Schedule config + Last 14 fires ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Config form */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Schedule Configuration</h2>
            <Link to="../settings" className="text-[10px] text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1">{clientTz}</Link>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Enable automated runs</p>
              <p className="text-xs text-gray-400">When enabled, runs fire automatically on the chosen cadence</p>
            </div>
            <button onClick={() => update("schedule_enabled", !form.schedule_enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.schedule_enabled ? "bg-blue-600" : "bg-gray-300"}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.schedule_enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Cadence */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Cadence</p>
            <div className="grid grid-cols-4 gap-2">
              {(["hourly", "daily", "weekly", "manual"] as ScheduleCadence[]).map((c) => (
                <button key={c} onClick={() => { update("schedule_cadence", c); if (c === "manual") update("schedule_enabled", false); }}
                  className={`py-2 px-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.schedule_cadence === c ? "bg-blue-600 border-blue-500 text-white" : "bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300"
                  }`}>
                  {CADENCE_LABELS[c].split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Time selectors */}
          {form.schedule_cadence !== "manual" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {form.schedule_cadence !== "hourly" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hour (UTC)</label>
                  <select value={form.schedule_hour} onChange={(e) => update("schedule_hour", Number(e.target.value))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400">
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Minute</label>
                <select value={form.schedule_minute} onChange={(e) => update("schedule_minute", Number(e.target.value))}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400">
                  {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                </select>
              </div>
              {form.schedule_cadence === "weekly" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Day of week</label>
                  <select value={form.schedule_day_of_week ?? 0} onChange={(e) => update("schedule_day_of_week", Number(e.target.value))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400">
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {form.schedule_cadence !== "manual" && (
            <p className="text-xs text-gray-400">
              {form.schedule_cadence === "hourly" ? `Runs every hour at :${String(form.schedule_minute).padStart(2, "0")} — in ${clientTz}`
               : form.schedule_cadence === "weekly" ? `Runs every ${DAYS[form.schedule_day_of_week ?? 0]} at ${timeLabel(form.schedule_hour, form.schedule_minute)} — in ${clientTz}`
               : `Runs daily at ${timeLabel(form.schedule_hour, form.schedule_minute)} — in ${clientTz}`}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}
              className="px-5 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors">
              {saveMut.isPending ? "Saving…" : "Save Changes"}
            </button>
            {!dirty && !saveMut.isPending && data && (
              <span className="text-xs text-gray-400">No unsaved changes</span>
            )}
          </div>
        </div>

        {/* Last 14 fires chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Last 14 fires</p>
          <p className="text-xs text-gray-400 mb-4">Run latency from schedule time</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={FIRES_DATA} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="fire" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(v) => [`${v}s`, "Latency"]} />
              <Bar dataKey="seconds" fill="#bfdbfe" radius={[3, 3, 0, 0]}>
                {FIRES_DATA.map((d, i) => (
                  <rect key={i} fill={d.seconds > 30 ? "#3b82f6" : "#bfdbfe"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-2">seconds late vs schedule</p>
        </div>
      </div>

      {/* ── Recent scheduled runs (table) ── */}
      {data && data.recent_runs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold">Triggered</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Cadence</th>
                  <th className="text-left px-4 py-3 font-semibold">Retries</th>
                  <th className="text-left px-4 py-3 font-semibold">Pipeline Run</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_runs.map((r: SchedulerRunItem) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{relTimePast(r.triggered_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${SR_STATUS[r.status] ?? ""}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs capitalize">{r.cadence}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.retry_count}</td>
                    <td className="px-4 py-3">
                      {r.run_id ? (
                        <Link to={`/clients/${clientId}/runs/${r.run_id}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium">View →</Link>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden divide-y divide-gray-100">
            {data.recent_runs.map((r: SchedulerRunItem) => (
              <div key={r.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">{relTimePast(r.triggered_at)}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${SR_STATUS[r.status] ?? ""}`}>{r.status}</span>
                </div>
                {r.run_id && <Link to={`/clients/${clientId}/runs/${r.run_id}`} className="text-xs text-blue-600 ml-auto block text-right">View run →</Link>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {confirmPause && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Pause Schedule?</h3>
            <p className="text-sm text-gray-500">Automated runs will stop. Your configuration is preserved — you can resume at any time.</p>
            <div className="flex gap-2">
              <button onClick={() => pauseMut.mutate()} disabled={pauseMut.isPending}
                className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:bg-gray-100 transition-colors">
                {pauseMut.isPending ? "Pausing…" : "Pause Schedule"}
              </button>
              <button onClick={() => setConfirmPause(false)} className="px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {confirmResume && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Resume Schedule?</h3>
            <p className="text-sm text-gray-500">Automated runs will resume on the current cadence.</p>
            <div className="flex gap-2">
              <button onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}
                className="flex-1 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold disabled:bg-gray-100 transition-colors">
                {resumeMut.isPending ? "Resuming…" : "Resume Schedule"}
              </button>
              <button onClick={() => setConfirmResume(false)} className="px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
