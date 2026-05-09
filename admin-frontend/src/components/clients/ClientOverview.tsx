import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { clientsApi, runsApi } from "../../api/client";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Returns a human-readable "in Xm" / "in Xh" string for future timestamps. */
function timeUntil(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime() - Date.now();
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `in ${h}h ${rem}m` : `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

/** Format a naive UTC ISO string into a short local-time label. */
function fmtNextRun(iso: string) {
  const s = iso.endsWith("Z") ? iso : iso + "Z";
  return new Date(s).toLocaleString([], {
    weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

export function ClientOverview() {
  const { clientId } = useParams<{ clientId: string }>();

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const { data: runs } = useQuery({
    queryKey: ["admin-runs", clientId],
    queryFn: () => runsApi.list(clientId!, 1, 5),
    enabled: !!clientId,
  });

  if (!client) {
    return <div className="text-gray-500 text-sm">Loading…</div>;
  }

  const lastRun = runs?.items[0];
  const schedEnabled = client.schedule_enabled;
  const schedCadence = client.schedule_cadence;
  const nextRun = client.next_scheduled_run_at;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Prompts" value={client.total_prompts} />
        <StatCard label="Competitors" value={client.total_competitors} />
        <StatCard label="Total Runs" value={runs?.total ?? "—"} />
        <StatCard
          label="Last Citation Rate"
          value={
            lastRun?.overall_citation_rate != null
              ? `${Math.round(lastRun.overall_citation_rate * 100)}%`
              : "—"
          }
        />
      </div>

      {/* ── Auto-run schedule status ── */}
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${
        schedEnabled
          ? "bg-green-950/20 border-green-800/60"
          : schedCadence === "manual"
          ? "bg-gray-900 border-gray-800"
          : "bg-amber-950/20 border-amber-800/60"
      }`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          schedEnabled ? "bg-green-400 animate-pulse" :
          schedCadence === "manual" ? "bg-gray-600" : "bg-amber-400"
        }`} />

        <div className="flex-1 min-w-0">
          {schedEnabled ? (
            <>
              <p className="text-sm font-semibold text-green-300">
                Auto-runs active
                <span className="text-green-400/70 font-normal capitalize ml-1">· {schedCadence}</span>
              </p>
              {nextRun && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Next run <span className="text-green-300 font-medium">{timeUntil(nextRun)}</span>
                  <span className="text-gray-500 ml-1">({fmtNextRun(nextRun)})</span>
                </p>
              )}
            </>
          ) : schedCadence === "manual" ? (
            <>
              <p className="text-sm font-semibold text-gray-400">Manual mode</p>
              <p className="text-xs text-gray-500">Runs are triggered by admins only</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-300">Schedule paused</p>
              <p className="text-xs text-gray-500 capitalize">
                Was set to {schedCadence} — resume to re-enable
              </p>
            </>
          )}
        </div>

        <Link
          to="schedule"
          className="shrink-0 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {schedEnabled ? "Edit" : schedCadence === "manual" ? "Enable" : "Resume"} →
        </Link>
      </div>

      {/* ── Latest run summary ── */}
      {lastRun && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Latest Run</h2>
            {lastRun.status === "completed" && (
              <Link
                to={`/clients/${clientId}/runs/${lastRun.id}`}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                View details →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <p className={`text-sm font-semibold capitalize ${
                lastRun.status === "completed" ? "text-green-400" :
                lastRun.status === "running" ? "text-blue-400" :
                lastRun.status === "failed" ? "text-red-400" : "text-gray-300"
              }`}>{lastRun.status}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Progress</p>
              <p className="text-sm font-medium text-white">
                {lastRun.completed_prompts}/{lastRun.total_prompts}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Citation Rate</p>
              <p className={`text-sm font-semibold ${
                lastRun.overall_citation_rate == null ? "text-gray-500" :
                lastRun.overall_citation_rate >= 0.5 ? "text-green-400" :
                lastRun.overall_citation_rate >= 0.25 ? "text-amber-400" : "text-red-400"
              }`}>
                {lastRun.overall_citation_rate != null
                  ? `${Math.round(lastRun.overall_citation_rate * 100)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick links ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { to: "prompts", label: "Manage Prompts", desc: `${client.total_prompts} prompts` },
          { to: "competitors", label: "Competitors", desc: `${client.total_competitors} tracked` },
          { to: "knowledge-base", label: "Knowledge Base", desc: "Brand context" },
          { to: "runs", label: "Run History", desc: `${runs?.total ?? 0} runs` },
          { to: "schedule", label: "Schedule", desc: schedEnabled ? "Active" : schedCadence === "manual" ? "Manual" : "Paused" },
          { to: "settings", label: "Settings", desc: "Edit client" },
        ].map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-indigo-500/50 transition-colors"
          >
            <p className="text-sm font-semibold text-white">{link.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
