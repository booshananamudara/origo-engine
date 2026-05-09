import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const API = import.meta.env.VITE_API_URL ?? "";

export function ChangePasswordPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const token = localStorage.getItem("client_access_token");
      const res = await fetch(`${API}/client/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to change password");
      }

      // Re-login to get a fresh token without must_change_password = true
      navigate("/login", { replace: true });
      logout();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Set a new password</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Welcome, {user?.display_name}. Please choose a new password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: "Current password", value: current, onChange: setCurrent, autoComplete: "current-password" },
            { label: "New password", value: next, onChange: setNext, autoComplete: "new-password" },
            { label: "Confirm new password", value: confirm, onChange: setConfirm, autoComplete: "new-password" },
          ].map(({ label, value, onChange, autoComplete }) => (
            <div key={label}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
              <input
                type="password"
                autoComplete={autoComplete}
                required
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700
                  rounded-lg px-3 py-2.5 text-gray-900 dark:text-white
                  focus:outline-none focus:border-indigo-500 text-sm transition-colors"
              />
            </div>
          ))}

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
              disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed
              text-white transition-colors"
          >
            {loading ? "Saving…" : "Set password & sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
