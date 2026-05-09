import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { runsApi } from "../../api/client";
import type { RunSummaryItem } from "../../types";

const STATUS_STYLE: Record<string, string> = {
  pending:   "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  running:   "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  completed: "bg-green-500/15 text-green-400 border border-green-500/30",
  failed:    "bg-red-500/15 text-red-400 border border-red-500/30",
};

const ACTIVE = new Set(["pending", "running"]);

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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

  const triggerMut = useMutation({
    mutationFn: () => runsApi.trigger(clientId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-runs", clientId] }); setTriggerError(null); },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setTriggerError(err.response?.data?.detail ?? "Failed to start run");
    },
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;
  const hasActive = (data?.items ?? []).some((r) => ACTIVE.has(r.status));

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider pt-1">
          Run History {data && `(${data.total})`}
        </h2>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => triggerMut.mutate()}
            disabled={triggerMut.isPending || hasActive}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500
              text-white text-sm font-semibold disabled:bg-gray-700 disabled:text-gray-400
              disabled:cursor-not-allowed transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span className="hidden sm:inline">{hasActive ? "Run in progress…" : "Trigger New Run"}</span>
            <span className="sm:hidden">{hasActive ? "Running…" : "Run"}</span>
          </button>
          {triggerError && <p className="text-xs text-red-400 text-right max-w-[200px]">{triggerError}</p>}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : !data?.items.length ? (
          <p className="p-6 text-sm text-gray-500">No runs yet. Trigger the first run above.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 bg-gray-800/50">
                    <th className="text-left px-5 py-3">Run ID</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Progress</th>
                    <th className="text-left px-4 py-3">Citation</th>
                    <th className="text-left px-4 py-3">Started</th>
                    <th className="text-left px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((run) => (
                    <tr key={run.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-gray-400">{run.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[run.status] ?? ""}`}>
                          {ACTIVE.has(run.status) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{run.completed_prompts}/{run.total_prompts}</td>
                      <td className="px-4 py-3">
                        {run.overall_citation_rate != null ? (
                          <span className={`font-mono text-sm font-semibold ${run.overall_citation_rate >= 0.5 ? "text-green-400" : run.overall_citation_rate >= 0.25 ? "text-amber-400" : "text-red-400"}`}>
                            {Math.round(run.overall_citation_rate * 100)}%
                          </span>
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{relTime(run.created_at)}</td>
                      <td className="px-4 py-3">
                        {run.status === "completed" && (
                          <Link to={`/clients/${clientId}/runs/${run.id}`} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">View →</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-800">
              {data.items.map((run) => (
                <div key={run.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-500">{run.id.slice(0, 8)}…</span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[run.status] ?? ""}`}>
                      {ACTIVE.has(run.status) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                      {run.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-400">{run.completed_prompts}/{run.total_prompts} tasks</span>
                    <span className="text-gray-500">{relTime(run.created_at)}</span>
                    {run.overall_citation_rate != null && (
                      <span className={`font-mono font-semibold ml-auto ${run.overall_citation_rate >= 0.5 ? "text-green-400" : run.overall_citation_rate >= 0.25 ? "text-amber-400" : "text-red-400"}`}>
                        {Math.round(run.overall_citation_rate * 100)}%
                      </span>
                    )}
                    {run.status === "completed" && (
                      <Link to={`/clients/${clientId}/runs/${run.id}`} className="text-indigo-400 font-medium ml-auto">View →</Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="px-4 sm:px-5 py-3 flex items-center justify-between border-t border-gray-800 text-sm text-gray-500">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="disabled:opacity-40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800">← Prev</button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="disabled:opacity-40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
