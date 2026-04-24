import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

const ACTION_STYLES: Record<string, string> = {
  prompt_created: "bg-green-900/50 text-green-400",
  prompt_updated: "bg-blue-900/50 text-blue-400",
  prompt_deactivated: "bg-red-900/50 text-red-400",
  prompt_activated: "bg-green-900/50 text-green-400",
  prompt_bulk_created: "bg-purple-900/50 text-purple-400",
  prompt_csv_uploaded: "bg-purple-900/50 text-purple-400",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function summariseDetails(action: string, details: Record<string, unknown> | null): string {
  if (!details) return "";
  if (action === "prompt_bulk_created" || action === "prompt_csv_uploaded") {
    return `Created: ${details.created ?? 0}, Skipped: ${details.skipped ?? 0}`;
  }
  if (action === "prompt_updated") {
    const changes = details.changes as Record<string, unknown> | undefined;
    if (!changes) return "";
    return Object.keys(changes).join(", ") + " changed";
  }
  if (details.text) return String(details.text).slice(0, 60);
  return "";
}

interface Props {
  clientId: string;
}

export function AuditPanel({ clientId }: Props) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", clientId, { page }],
    queryFn: () => api.listAuditLogs(clientId, page, 20),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Audit Log</h3>
      </div>

      {isLoading ? (
        <div className="p-5 text-sm text-gray-500">Loading…</div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-5 text-sm text-gray-500">No audit entries yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-700">
                <th className="text-left px-5 py-2">Action</th>
                <th className="text-left px-5 py-2">Details</th>
                <th className="text-left px-5 py-2">When</th>
              </tr></thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-5 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium
                        ${ACTION_STYLES[entry.action] ?? "bg-gray-800 text-gray-400"}`}>
                        {entry.action.replace("prompt_", "")}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-gray-400 text-xs max-w-xs truncate">
                      {summariseDetails(entry.action, entry.details)}
                    </td>
                    <td className="px-5 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {relativeTime(entry.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 flex items-center gap-3 text-sm text-gray-400">
              <button onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1}
                className="disabled:opacity-40 hover:text-white transition-colors">Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="disabled:opacity-40 hover:text-white transition-colors">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
