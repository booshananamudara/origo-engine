import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { dashboard } from "../lib/api";
import type { RunListItem } from "../lib/api";

const STATUS_STYLE: Record<string, string> = {
  pending:   "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30",
  running:   "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30",
  completed: "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30",
  failed:    "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30",
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

export function RunHistoryPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-runs", page],
    queryFn: () => dashboard.getRuns(page),
    refetchInterval: (q) => {
      const runs: RunListItem[] = q.state.data?.runs ?? [];
      return runs.some((r) => ACTIVE.has(r.status)) ? 3000 : false;
    },
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Run History {data && <span className="text-sm font-normal text-gray-500">({data.total})</span>}
        </h2>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : !data?.runs.length ? (
          <div className="p-10 text-center text-gray-400 text-sm">No runs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-5 py-3">Run</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Progress</th>
                <th className="text-left px-4 py-3">Citation Rate</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.runs.map((run) => (
                <tr key={run.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {run.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[run.status] ?? ""}`}>
                      {ACTIVE.has(run.status) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      )}
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {run.completed_prompts}/{run.total_prompts}
                  </td>
                  <td className="px-4 py-3">
                    {run.overall_citation_rate != null ? (
                      <span className={`font-mono text-sm font-semibold ${
                        run.overall_citation_rate >= 0.5 ? "text-green-600 dark:text-green-400" :
                        run.overall_citation_rate >= 0.25 ? "text-amber-600 dark:text-amber-400" :
                        "text-red-600 dark:text-red-400"
                      }`}>
                        {Math.round(run.overall_citation_rate * 100)}%
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {relTime(run.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {run.status === "completed" && (
                      <Link
                        to={`/dashboard/runs/${run.id}`}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                      >
                        View →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-3 flex items-center justify-between text-sm text-gray-500 border-t border-gray-200 dark:border-gray-800">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="disabled:opacity-40 hover:text-gray-900 dark:hover:text-white transition-colors">
              ← Prev
            </button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="disabled:opacity-40 hover:text-gray-900 dark:hover:text-white transition-colors">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
