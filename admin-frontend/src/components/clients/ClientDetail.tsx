import { NavLink, Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clientsApi } from "../../api/client";

const TABS = [
  { to: "overview", label: "Overview" },
  { to: "prompts", label: "Prompts" },
  { to: "competitors", label: "Competitors" },
  { to: "knowledge-base", label: "Knowledge Base" },
  { to: "runs", label: "Runs" },
  { to: "users", label: "Users" },
  { to: "settings", label: "Settings" },
];

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" ? "bg-green-500" :
    status === "paused" ? "bg-amber-500" : "bg-gray-500";
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b border-gray-800 bg-gray-950">
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1">
            {client ? (
              <>
                <div className="flex items-center gap-2">
                  <StatusDot status={client.status} />
                  <h1 className="text-xl font-bold text-white">{client.name}</h1>
                </div>
                <p className="text-sm text-gray-400">
                  {client.industry && `${client.industry} · `}
                  {client.website ? (
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {client.website}
                    </a>
                  ) : null}
                </p>
              </>
            ) : (
              <div className="h-6 w-48 bg-gray-800 animate-pulse rounded" />
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  isActive
                    ? "text-indigo-400 border-b-2 border-indigo-500"
                    : "text-gray-500 hover:text-gray-200"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        <Outlet />
      </div>
    </div>
  );
}
