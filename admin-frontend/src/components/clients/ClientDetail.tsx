import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clientsApi } from "../../api/client";

const TABS_DESKTOP = [
  { to: "overview", label: "Overview" },
  { to: "prompts", label: "Prompts" },
  { to: "competitors", label: "Competitors" },
  { to: "knowledge-base", label: "KB" },
  { to: "runs", label: "Runs" },
  { to: "schedule", label: "Schedule" },
  { to: "users", label: "Users" },
  { to: "settings", label: "Settings" },
];

const TABS_MOBILE = [
  { to: "overview", label: "Overview" },
  { to: "prompts", label: "Prompts" },
  { to: "competitors", label: "Competitors" },
  { to: "knowledge-base", label: "KB" },
  { to: "runs", label: "Runs" },
  { to: "schedule", label: "Schedule" },
];

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" ? "bg-green-500" :
    status === "paused" ? "bg-amber-500" : "bg-gray-500";
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function TabList({ tabs }: { tabs: typeof TABS_DESKTOP }) {
  return (
    <div className="flex overflow-x-auto gap-0.5 pb-px scrollbar-none">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `px-3 sm:px-4 py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
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
  );
}

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-0 border-b border-gray-800 bg-gray-950 shrink-0">
        <div className="mb-3 sm:mb-4">
          {client ? (
            <>
              {/* Client name row — gear icon on mobile */}
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status={client.status} />
                <h1 className="text-lg sm:text-xl font-bold text-white truncate flex-1">{client.name}</h1>
                {/* Settings gear — mobile only (desktop uses the Settings tab) */}
                <Link
                  to="settings"
                  aria-label="Settings"
                  className="sm:hidden shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </Link>
              </div>
              {(client.industry || client.website) && (
                <p className="text-sm text-gray-400 mt-0.5 truncate">
                  {client.industry}
                  {client.industry && client.website && " · "}
                  {client.website && (
                    <a href={client.website} target="_blank" rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {client.website}
                    </a>
                  )}
                </p>
              )}
            </>
          ) : (
            <div className="h-6 w-48 bg-gray-800 animate-pulse rounded" />
          )}
        </div>

        {/* Desktop tab bar — all tabs including Settings and Users */}
        <div className="hidden sm:block">
          <TabList tabs={TABS_DESKTOP} />
        </div>

        {/* Mobile tab bar — core tabs only (Settings = gear icon above) */}
        <div className="sm:hidden">
          <TabList tabs={TABS_MOBILE} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 sm:p-6 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
