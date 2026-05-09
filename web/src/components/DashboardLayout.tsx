import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../lib/theme";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white transition-colors">
      {/* Top nav */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Brand */}
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none">
                <circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/>
                <circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
                <line x1="6" y1="6.5" x2="10" y2="11" stroke="white" strokeWidth="1.5"/>
                <line x1="18" y1="6.5" x2="14" y2="11" stroke="white" strokeWidth="1.5"/>
                <line x1="6" y1="17.5" x2="10" y2="13" stroke="white" strokeWidth="1.5"/>
                <line x1="18" y1="17.5" x2="14" y2="13" stroke="white" strokeWidth="1.5"/>
              </svg>
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none">GEO Monitor</p>
              <p className="text-sm font-semibold truncate">{user?.client_name}</p>
            </div>
          </button>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300
                hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {user?.display_name?.[0]?.toUpperCase() ?? "U"}
                </div>
                <span className="hidden sm:block text-gray-700 dark:text-gray-200 font-medium max-w-[120px] truncate">
                  {user?.display_name}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{user?.display_name}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => { setMenuOpen(false); navigate("/change-password"); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Change password
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors border-t border-gray-100 dark:border-gray-800"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
