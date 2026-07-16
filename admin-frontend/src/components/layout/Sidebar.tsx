import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import KeyboardCommandKeyRoundedIcon from "@mui/icons-material/KeyboardCommandKeyRounded";
import { useAuth } from "../../auth/AuthContext";
import { recommendationsApi } from "../../api/client";
import logo from "../../assets/logo2.svg";

function NavItem({
  to,
  icon,
  label,
  onClose,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClose: () => void;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-blue-600 text-white"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        }`
      }
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 select-none">
      {children}
    </p>
  );
}

function usePendingRecommendations(): number {
  const { data } = useQuery({
    queryKey: ["rec-summary-global"],
    queryFn: () => recommendationsApi.summary(""),
    enabled: false,
    staleTime: 60_000,
  });
  return data?.by_status?.pending ?? 0;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Sidebar({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pendingRecs = usePendingRecommendations();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const initials = user?.display_name ? getInitials(user.display_name) : "AD";

  return (
    <aside className="w-64 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Logo row */}
      <div className="px-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="Origo" className="w-40 h-20 rounded-lg shrink-0" />
          {/* <span className="font-bold text-gray-900 text-sm tracking-tight">Origo Admin</span> */}
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Search box */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span className="text-sm text-gray-400 flex-1">Search something</span>
          <kbd className="inline-flex items-center text-[10px] bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono text-gray-400 leading-none">
            <KeyboardCommandKeyRoundedIcon style={{ fontSize: 10 }} />K
          </kbd>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-1 overflow-y-auto">
        <SectionLabel>Navigation</SectionLabel>
        <div className="space-y-0.5">
          <NavItem
            to="/clients"
            label="Clients"
            onClose={onClose}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
          />
          <NavItem
            to="/scheduler"
            label="Scheduler"
            onClose={onClose}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
          />
          <NavItem
            to="/recommendations"
            label="Recommendations"
            onClose={onClose}
            badge={pendingRecs}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            }
          />
        </div>

        <SectionLabel>Settings</SectionLabel>
        <div className="space-y-0.5">
          <NavItem
            to="/settings"
            label="Settings"
            onClose={onClose}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            }
          />
        </div>
      </nav>

      {/* Super Admin card + user footer */}
      <div className="p-3 space-y-2 border-t border-gray-100">
        {/* Admin card */}
        <div
          className="rounded-2xl p-4 text-white overflow-hidden"
          style={{
            background: "linear-gradient(145deg, #0d1b2e 0%, #112240 50%, #0a1628 100%)",
          }}
        >
          {/* Icon */}
          <div
            className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p className="font-bold text-sm text-white">Super Admin</p>
          <p className="text-[11px] mt-1 leading-snug" style={{ color: "#7fa8c9" }}>
            Manage clients, scheduler and recommendations from one console.
          </p>
        </div>

        {/* User row */}
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">{user?.display_name ?? "Admin"}</p>
            <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
