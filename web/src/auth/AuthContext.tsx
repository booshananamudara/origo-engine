import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface ClientUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  client_id: string;
  client_name: string;
  must_change_password: boolean;
}

interface AuthState {
  user: ClientUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const API = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("client_access_token");
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem("client_refresh_token");
  if (!refresh) return false;
  try {
    const data = await apiFetch<{ access_token: string }>("/client/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refresh }),
    });
    localStorage.setItem("client_access_token", data.access_token);
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("client_access_token");
    if (!token) { setIsLoading(false); return; }

    apiFetch<ClientUser>("/client/auth/me")
      .then((u) => setUser(u))
      .catch(async () => {
        const refreshed = await tryRefresh();
        if (refreshed) {
          try { setUser(await apiFetch<ClientUser>("/client/auth/me")); }
          catch { localStorage.clear(); }
        } else {
          localStorage.removeItem("client_access_token");
          localStorage.removeItem("client_refresh_token");
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{
      access_token: string;
      refresh_token: string;
      user: ClientUser;
      must_change_password: boolean;
    }>("/client/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("client_access_token", data.access_token);
    localStorage.setItem("client_refresh_token", data.refresh_token);
    setUser({ ...data.user, must_change_password: data.must_change_password });
  }

  function logout() {
    localStorage.removeItem("client_access_token");
    localStorage.removeItem("client_refresh_token");
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        mustChangePassword: user?.must_change_password ?? false,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
