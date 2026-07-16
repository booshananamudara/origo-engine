import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clientsApi } from "../../api/client";

const TABS_DESKTOP = [
  { to: "overview", label: "Overview" },
  { to: "prompts", label: "Prompts" },
  { to: "competitors", label: "Competitors" },
  { to: "knowledge-base", label: "KB" },
  { to: "runs", label: "Runs" },
  { to: "recommendations", label: "Recommendations" },
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
  { to: "recommendations", label: "Recs" },
  { to: "schedule", label: "Schedule" },
];

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500",
  "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function StatusBadge({ status }: { status: string }) {
  const dot: Record<string, string> = {
    active: "bg-emerald-500", paused: "bg-amber-400", archived: "bg-gray-400",
  };
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    archived: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] ?? styles.active}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] ?? dot.active}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function TabList({ tabs }: { tabs: typeof TABS_DESKTOP }) {
  return (
    <div className="flex overflow-x-auto gap-0 pb-px scrollbar-none">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              isActive
                ? "text-blue-600 border-blue-600"
                : "text-gray-500 hover:text-gray-800 border-transparent"
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
      <div className="px-4 sm:px-6 pt-5 pb-0 border-b border-gray-200 bg-white shrink-0">
        <div className="mb-4">
          {client ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl ${avatarColor(client.name)} flex items-center justify-center shrink-0`}>
                  <span className="text-sm font-bold text-white">{getInitials(client.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-gray-900 truncate">{client.name}</h1>
                    <StatusBadge status={client.status} />
                  </div>
                  {(client.industry || client.website) && (
                    <p className="text-sm text-gray-500 truncate">
                      {client.industry}
                      {client.industry && client.website && ", "}
                      {client.website && (
                        <a
                          href={client.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {client.website}
                        </a>
                      )}
                    </p>
                  )}
                </div>
                {/* Settings gear — mobile only */}
                <Link
                  to="settings"
                  aria-label="Settings"
                  className="sm:hidden shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </Link>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-5 w-36 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 w-24 bg-gray-100 animate-pulse rounded" />
              </div>
            </div>
          )}
        </div>

        {/* Desktop tab bar */}
        <div className="hidden sm:block">
          <TabList tabs={TABS_DESKTOP} />
        </div>
        {/* Mobile tab bar */}
        <div className="sm:hidden">
          <TabList tabs={TABS_MOBILE} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 sm:p-6 min-w-0 bg-gray-50">
        <Outlet />
      </div>
    </div>
  );
}
