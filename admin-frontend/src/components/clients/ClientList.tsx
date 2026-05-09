import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { clientsApi } from "../../api/client";
import type { ClientSummary } from "../../types";
import { CreateClientModal } from "./CreateClientModal";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    archived: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide border ${styles[status] ?? styles.active}`}
    >
      {status}
    </span>
  );
}

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

export function ClientList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("active");
  const [showCreate, setShowCreate] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["admin-clients", statusFilter],
    queryFn: () => clientsApi.list(statusFilter),
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clients</h1>
          <p className="text-sm text-gray-400 mt-0.5">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Client
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500 text-sm">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">No clients found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 bg-gray-800/50">
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Industry</th>
                <th className="text-left px-4 py-3">Prompts</th>
                <th className="text-left px-4 py-3">Last Run</th>
                <th className="text-left px-4 py-3">Citation Rate</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c: ClientSummary) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/clients/${c.id}/overview`)}
                >
                  <td className="px-5 py-3">
                    <p className="font-semibold text-white">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-400">{c.industry ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-300">{c.total_prompts}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {relTime(c.last_run_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-sm font-semibold ${
                      c.latest_citation_rate == null ? "text-gray-500" :
                      c.latest_citation_rate >= 0.5 ? "text-green-400" :
                      c.latest_citation_rate >= 0.25 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {pct(c.latest_citation_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      onClick={() => navigate(`/clients/${c.id}/overview`)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
