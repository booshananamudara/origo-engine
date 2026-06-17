import { useLocation, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { clientsApi } from "../../api/client";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function useBreadcrumbs() {
  const location = useLocation();
  const params = useParams<{ clientId?: string; runId?: string; id?: string }>();
  const segments = location.pathname.split("/").filter(Boolean);
  const qc = useQueryClient();

  const { data: client } = useQuery({
    queryKey: ["admin-client", params.clientId],
    queryFn: () => clientsApi.get(params.clientId!),
    enabled: !!params.clientId,
    staleTime: 5 * 60 * 1000,
  });

  // Read run display_id from the cache already populated by RunDetail — no extra fetch
  const runSummary = params.runId
    ? (qc.getQueryData(["admin-run-detail", params.clientId, params.runId]) as { run?: { display_id?: string } } | undefined)
    : undefined;
  const runLabel = runSummary?.run?.display_id ?? params.runId ?? "";

  const crumbs: { label: string; to?: string }[] = [];

  if (segments[0] === "clients") {
    crumbs.push({ label: "Clients", to: "/clients" });

    if (params.clientId) {
      const clientName = client?.name ?? params.clientId;
      crumbs.push({ label: clientName, to: `/clients/${params.clientId}/overview` });

      const subPage = segments[2];
      if (subPage && subPage !== "overview") {
        const labels: Record<string, string> = {
          prompts: "Prompts",
          competitors: "Competitors",
          "knowledge-base": "KB",
          runs: "Runs",
          schedule: "Schedule",
          users: "Users",
          settings: "Settings",
        };
        if (params.runId) {
          crumbs.push({ label: "Runs", to: `/clients/${params.clientId}/runs` });
          crumbs.push({ label: runLabel });
        } else {
          crumbs.push({ label: labels[subPage] ?? subPage });
        }
      }
    }
  } else if (segments[0] === "scheduler") {
    crumbs.push({ label: "Scheduler" });
  } else if (segments[0] === "recommendations") {
    crumbs.push({ label: "Recommendations", to: "/recommendations" });
    if (params.id) {
      crumbs.push({ label: "Detail" });
    }
  } else if (segments[0] === "settings") {
    crumbs.push({ label: "Settings" });
  }

  return crumbs;
}

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth();
  const crumbs = useBreadcrumbs();
  const initials = user?.display_name ? getInitials(user.display_name) : "AD";

  return (
    <header className="shrink-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-4 z-10">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="Open menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Breadcrumbs */}
      <nav className="flex-1 min-w-0 flex items-center gap-1.5 text-sm overflow-hidden">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-300">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
            {crumb.to && i < crumbs.length - 1 ? (
              <Link to={crumb.to} className="text-gray-500 hover:text-gray-900 transition-colors truncate shrink-0">
                {crumb.label}
              </Link>
            ) : (
              <span className={`truncate ${i === crumbs.length - 1 ? "text-gray-900 font-semibold" : "text-gray-500"}`}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Bell */}
        <button className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>

        {/* Search */}
        <button className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* User avatar + name */}
        <button className="flex items-center gap-2 ml-1 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">{initials}</span>
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block">
            {user?.display_name?.split(" ")[0] ?? "Admin"}
          </span>
        </button>
      </div>
    </header>
  );
}
