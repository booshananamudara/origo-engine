import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduleApi } from "../../api/client";

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

/** Convert a TanStack Query dataUpdatedAt timestamp (ms) to a short label. */
function lastRefreshedLabel(tsMs: number): string {
  if (!tsMs) return "—";
  const s = Math.floor((Date.now() - tsMs) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export function SchedulerHealth() {
  const qc = useQueryClient();
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

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">Loading scheduler health…</p>;
  }

  const healthy = data?.is_healthy ?? false;
  const today = data?.scheduled_runs_today ?? {};

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">Scheduler</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Last refreshed: {lastRefreshedLabel(dataUpdatedAt)}
          </p>
        </div>
      </div>

      {pauseResult && (
        <div className="bg-amber-950/30 border border-amber-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-300">{pauseResult}</p>
          <button onClick={() => setPauseResult(null)} className="text-gray-500 hover:text-white text-xs">Dismiss</button>
        </div>
      )}

      {/* ── Health card ── */}
      <div className={`rounded-xl border p-5 ${healthy ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full shrink-0 ${healthy ? "bg-green-400 animate-pulse" : "bg-red-400 animate-pulse"}`} />
          <div>
            <p className={`text-lg font-bold ${healthy ? "text-green-300" : "text-red-300"}`}>
              {healthy ? "Healthy" : "Unhealthy"}
            </p>
            <p className="text-xs text-gray-400">
              Last tick: {relTime(data?.last_tick_at ?? null)}
              {data?.last_tick_age_seconds != null && (
                <span className={`ml-2 font-mono ${(data.last_tick_age_seconds > 120) ? "text-red-400" : "text-gray-500"}`}>
                  ({data.last_tick_age_seconds}s)
                </span>
              )}
            </p>
          </div>
          {(data?.consecutive_failures ?? 0) > 0 && (
            <span className="ml-auto px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/30">
              {data?.consecutive_failures} failures
            </span>
          )}
        </div>
        {data?.last_error && (
          <p className="mt-2 text-xs text-red-400 bg-red-950/30 rounded px-3 py-2 font-mono">
            {data.last_error}
          </p>
        )}
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Clients", value: data?.active_clients_count ?? 0, color: "text-indigo-400" },
          { label: "Enqueued Today", value: today.enqueued ?? 0, color: "text-yellow-400" },
          { label: "Completed Today", value: today.completed ?? 0, color: "text-green-400" },
          { label: "Failed Today", value: today.failed ?? 0, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Tick details ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Last Tick Details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Clients evaluated</p>
            <p className="text-white font-semibold">{data?.last_tick_clients_evaluated ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Runs enqueued</p>
            <p className="text-white font-semibold">{data?.last_tick_runs_enqueued ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Tick at</p>
            <p className="text-white font-semibold">
              {data?.last_tick_at ? new Date(data.last_tick_at).toLocaleTimeString() : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Emergency pause all ── */}
      <div className="border border-red-900/50 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Emergency Controls</h2>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-300 font-medium">Pause All Schedules</p>
            <p className="text-xs text-gray-500">
              Immediately disable automated runs for every client. Use during API outages or runaway cost events.
            </p>
          </div>
          <button
            onClick={() => setShowPauseModal(true)}
            className="shrink-0 px-3 py-1.5 rounded border border-red-800 text-red-400 text-xs font-semibold
              hover:bg-red-900/20 transition-colors"
          >
            Pause All
          </button>
        </div>
      </div>

      {/* ── Pause All modal ── */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-red-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-semibold text-white">Pause All Schedules</h3>
            <p className="text-sm text-gray-400">
              This will disable automated runs for every active client immediately. Manual triggers will still work.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Reason (required)</label>
              <input
                type="text"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="e.g., API outage, cost spike detected…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm
                  placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Type <span className="font-mono text-red-400">PAUSE ALL</span> to confirm
              </label>
              <input
                type="text"
                value={pauseConfirmText}
                onChange={(e) => setPauseConfirmText(e.target.value)}
                placeholder="PAUSE ALL"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm
                  font-mono placeholder-gray-600 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => pauseAllMut.mutate()}
                disabled={
                  pauseConfirmText !== "PAUSE ALL" ||
                  !pauseReason.trim() ||
                  pauseAllMut.isPending
                }
                className="flex-1 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold
                  disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {pauseAllMut.isPending ? "Pausing…" : "Pause All Schedules"}
              </button>
              <button
                onClick={() => { setShowPauseModal(false); setPauseReason(""); setPauseConfirmText(""); }}
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
