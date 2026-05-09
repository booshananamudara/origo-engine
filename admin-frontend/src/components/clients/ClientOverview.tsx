import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { clientsApi, runsApi } from "../../api/client";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
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

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Prompts" value={client.total_prompts} />
        <StatCard label="Competitors" value={client.total_competitors} />
        <StatCard label="Total Runs" value={runs?.total ?? "—"} />
        <StatCard
          label="Last Citation Rate"
          value={
            lastRun?.overall_citation_rate != null
              ? `${Math.round(lastRun.overall_citation_rate * 100)}%`
              : "No data"
          }
        />
      </div>

      {/* Latest run summary */}
      {lastRun && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Latest Run
            </h2>
            <Link
              to={`/clients/${clientId}/runs/${lastRun.id}`}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              View details →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <p className="text-sm font-medium text-white capitalize">{lastRun.status}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Progress</p>
              <p className="text-sm font-medium text-white">
                {lastRun.completed_prompts}/{lastRun.total_prompts}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Citation Rate</p>
              <p className="text-sm font-medium text-white">
                {lastRun.overall_citation_rate != null
                  ? `${Math.round(lastRun.overall_citation_rate * 100)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { to: "prompts", label: "Manage Prompts", desc: `${client.total_prompts} prompts` },
          { to: "competitors", label: "Competitors", desc: `${client.total_competitors} tracked` },
          { to: "knowledge-base", label: "Knowledge Base", desc: "Brand context" },
          { to: "runs", label: "Run History", desc: `${runs?.total ?? 0} runs` },
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
