import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) {
        setError("Too many login attempts. Please wait 15 minutes.");
      } else if (msg.includes("403")) {
        setError("Your account is inactive. Contact your administrator.");
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="none">
              <circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/>
              <circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
              <line x1="6" y1="6.5" x2="10" y2="11" stroke="white" strokeWidth="1.5"/>
              <line x1="18" y1="6.5" x2="14" y2="11" stroke="white" strokeWidth="1.5"/>
              <line x1="6" y1="17.5" x2="10" y2="13" stroke="white" strokeWidth="1.5"/>
              <line x1="18" y1="17.5" x2="14" y2="13" stroke="white" strokeWidth="1.5"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">GEO Monitor</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Client Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700
                rounded-lg px-3 py-2.5 text-gray-900 dark:text-white placeholder-gray-400
                focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                transition-colors text-sm"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700
                  rounded-lg px-3 py-2.5 pr-10 text-gray-900 dark:text-white placeholder-gray-400
                  focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                  transition-colors text-sm"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <EyeIcon open={showPw} />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40
              border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-500
              disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed
              text-white transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
