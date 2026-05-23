import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { scheduleApi, clientsApi } from "../../api/client";
import type { ScheduleCadence, ScheduleConfig, SchedulerRunItem } from "../../types";

const CADENCE_LABELS: Record<ScheduleCadence, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  manual: "Manual (never auto-run)",
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const SR_STATUS: Record<string, string> = {
  enqueued:  "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  started:   "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  completed: "bg-green-500/15 text-green-400 border border-green-500/30",
  failed:    "bg-red-500/15 text-red-400 border border-red-500/30",
  skipped:   "bg-gray-500/15 text-gray-400 border border-gray-500/30",
};

/** Relative past time — only call with timestamps that are in the past */
function relTimePast(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Forward-looking time — correct for future timestamps */
function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `in ${h}h ${rem}m` : `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

/** Format a naive UTC ISO string for display */
function fmtUtc(iso: string) {
  // The DB stores naive UTC so we append Z to parse correctly
  const s = iso.endsWith("Z") ? iso : iso + "Z";
  return new Date(s).toLocaleString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZoneName: "short",
  });
}

function timeLabel(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function ClientSchedule() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();

  // Fetch schedule config
  const { data, isLoading } = useQuery({
    queryKey: ["admin-schedule", clientId],
    queryFn: () => scheduleApi.get(clientId!),
    refetchInterval: 30_000,
  });

  // Fetch client to read its timezone (shared cache — no extra HTTP request)
  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const clientTz = client?.timezone ?? "UTC";

  const [form, setForm] = useState<ScheduleConfig>({
    schedule_enabled: false,
    schedule_cadence: "daily",
    schedule_hour: 2,
    schedule_minute: 0,
    schedule_day_of_week: null,
  });
  const [dirty, setDirty] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      schedule_enabled: data.schedule_enabled,
      schedule_cadence: data.schedule_cadence,
      schedule_hour: data.schedule_hour,
      schedule_minute: data.schedule_minute,
      schedule_day_of_week: data.schedule_day_of_week,
    });
    setDirty(false);
  }, [data]);

  function update<K extends keyof ScheduleConfig>(key: K, value: ScheduleConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setSaveError(null);
  }

  const saveMut = useMutation({
    mutationFn: () => scheduleApi.update(clientId!, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] });
      setDirty(false);
      setSaveError(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setSaveError(err.response?.data?.detail ?? "Failed to save schedule");
    },
  });

  const pauseMut = useMutation({
    mutationFn: () => scheduleApi.pause(clientId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] });
      setConfirmPause(false);
    },
  });

  const resumeMut = useMutation({
    mutationFn: () => scheduleApi.resume(clientId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] });
      setConfirmResume(false);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setSaveError(err.response?.data?.detail ?? "Failed to resume schedule");
      setConfirmResume(false);
    },
  });

  if (isLoading) {
    return <p className="text-sm text-gray-500 p-4">Loading schedule…</p>;
  }

  const isEnabled = data?.schedule_enabled ?? false;
  const nextRunAt = data?.next_scheduled_run_at;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Status banner ── */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        isEnabled
          ? "bg-green-950/30 border-green-800 text-green-300"
          : data?.schedule_cadence === "manual"
          ? "bg-gray-900 border-gray-800 text-gray-400"
          : "bg-amber-950/30 border-amber-800 text-amber-300"
      }`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          isEnabled ? "bg-green-400 animate-pulse" :
          data?.schedule_cadence === "manual" ? "bg-gray-600" : "bg-amber-400"
        }`} />
        <div className="min-w-0">
          {isEnabled ? (
            <p className="text-sm font-semibold">
              Schedule active
              {nextRunAt && (
                <span className="font-normal text-green-400 ml-1">
                  — {timeUntil(nextRunAt)} ({fmtUtc(nextRunAt)})
                </span>
              )}
            </p>
          ) : data?.schedule_cadence === "manual" ? (
            <p className="text-sm font-semibold">Manual mode — runs only when triggered by admin</p>
          ) : (
            <p className="text-sm font-semibold">Schedule paused</p>
          )}
        </div>

        {/* Pause / Resume button */}
        {isEnabled && (
          <button
            onClick={() => setConfirmPause(true)}
            className="ml-auto shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold
              border border-amber-700 text-amber-400 hover:bg-amber-900/20 transition-colors"
          >
            Pause
          </button>
        )}
        {!isEnabled && data?.schedule_cadence !== "manual" && (
          <button
            onClick={() => setConfirmResume(true)}
            className="ml-auto shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold
              border border-green-700 text-green-400 hover:bg-green-900/20 transition-colors"
          >
            Resume
          </button>
        )}
      </div>

      {saveError && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      {/* ── Configuration form ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Schedule Configuration
          </h2>
          <Link
            to="../settings"
            className="text-xs text-gray-500 hover:text-indigo-400 transition-colors shrink-0 flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            {clientTz}
          </Link>
        </div>

        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Enable automated runs</p>
            <p className="text-xs text-gray-500">When enabled, runs fire automatically on the chosen cadence</p>
          </div>
          <button
            onClick={() => update("schedule_enabled", !form.schedule_enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              form.schedule_enabled ? "bg-indigo-600" : "bg-gray-600"
            }`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              form.schedule_enabled ? "translate-x-6" : "translate-x-1"
            }`} />
          </button>
        </div>

        {/* Cadence radio */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-300">Cadence</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["hourly", "daily", "weekly", "manual"] as ScheduleCadence[]).map((c) => (
              <button
                key={c}
                onClick={() => {
                  update("schedule_cadence", c);
                  if (c === "manual") update("schedule_enabled", false);
                }}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  form.schedule_cadence === c
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
                }`}
              >
                {CADENCE_LABELS[c].split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Time selectors — hidden for manual/hourly (hour not relevant for hourly) */}
        {form.schedule_cadence !== "manual" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {form.schedule_cadence !== "hourly" && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Hour (UTC)
                </label>
                <select
                  value={form.schedule_hour}
                  onChange={(e) => update("schedule_hour", Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Minute
              </label>
              <select
                value={form.schedule_minute}
                onChange={(e) => update("schedule_minute", Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
            {form.schedule_cadence === "weekly" && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Day of week
                </label>
                <select
                  value={form.schedule_day_of_week ?? 0}
                  onChange={(e) => update("schedule_day_of_week", Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {DAYS.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Time preview — all times in the client's timezone */}
        {form.schedule_cadence !== "manual" && (
          <p className="text-xs text-gray-500">
            {form.schedule_cadence === "hourly"
              ? `Runs every hour at :${String(form.schedule_minute).padStart(2, "0")} — in ${clientTz}`
              : form.schedule_cadence === "weekly"
              ? `Runs every ${DAYS[form.schedule_day_of_week ?? 0]} at ${timeLabel(form.schedule_hour, form.schedule_minute)} — in ${clientTz}`
              : `Runs daily at ${timeLabel(form.schedule_hour, form.schedule_minute)} — in ${clientTz}`
            }
          </p>
        )}

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold
              disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {saveMut.isPending ? "Saving…" : "Save Changes"}
          </button>
          {!dirty && !saveMut.isPending && data && (
            <span className="text-xs text-gray-500">No unsaved changes</span>
          )}
        </div>
      </div>

      {/* ── Recent scheduled runs ── */}
      {data && data.recent_runs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Recent Scheduled Runs
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 bg-gray-800/50">
                    <th className="text-left px-4 py-3">Triggered</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Cadence</th>
                    <th className="text-left px-4 py-3">Retries</th>
                    <th className="text-left px-4 py-3">Pipeline Run</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_runs.map((r: SchedulerRunItem) => (
                    <tr key={r.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20">
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{relTimePast(r.triggered_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${SR_STATUS[r.status] ?? ""}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs capitalize">{r.cadence}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.retry_count}</td>
                      <td className="px-4 py-3">
                        {r.run_id ? (
                          <Link
                            to={`/clients/${clientId}/runs/${r.run_id}`}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                          >
                            View →
                          </Link>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="sm:hidden divide-y divide-gray-800">
              {data.recent_runs.map((r: SchedulerRunItem) => (
                <div key={r.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">{relTimePast(r.triggered_at)}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${SR_STATUS[r.status] ?? ""}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="capitalize">{r.cadence}</span>
                    {r.retry_count > 0 && <span>{r.retry_count} retries</span>}
                    {r.run_id && (
                      <Link to={`/clients/${clientId}/runs/${r.run_id}`} className="text-indigo-400 ml-auto">
                        View run →
                      </Link>
                    )}
                  </div>
                  {r.error_message && (
                    <p className="text-xs text-red-400 truncate" title={r.error_message}>
                      {r.error_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Pause confirmation modal ── */}
      {confirmPause && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold text-white">Pause Schedule?</h3>
            <p className="text-sm text-gray-400">
              Automated runs will stop. Your configuration is preserved — you can resume at any time.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => pauseMut.mutate()}
                disabled={pauseMut.isPending}
                className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:bg-gray-700 transition-colors"
              >
                {pauseMut.isPending ? "Pausing…" : "Pause Schedule"}
              </button>
              <button
                onClick={() => setConfirmPause(false)}
                className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resume confirmation modal ── */}
      {confirmResume && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold text-white">Resume Schedule?</h3>
            <p className="text-sm text-gray-400">
              Automated runs will resume on the current cadence. The next run will be computed from now.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => resumeMut.mutate()}
                disabled={resumeMut.isPending}
                className="flex-1 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-semibold disabled:bg-gray-700 transition-colors"
              >
                {resumeMut.isPending ? "Resuming…" : "Resume Schedule"}
              </button>
              <button
                onClick={() => setConfirmResume(false)}
                className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
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
