import type { PromptDetail, RunSummaryResponse } from "./types";

// In production VITE_API_URL is the full API base (baked in at build time).
// In local dev it's empty — Vite proxy forwards to localhost:8000.
const BASE = (import.meta.env.VITE_API_URL ?? "") as string;

function getToken(): string | null {
  return localStorage.getItem("client_access_token");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Dashboard API (JWT-scoped — no client_id in URL) ─────────────────────────

export interface DashboardSummary {
  client_name: string;
  latest_run_id: string | null;
  latest_run_status: string | null;
  latest_run_date: string | null;
  latest_citation_rate: number | null;
  visibility_score: number | null;
  citation_rate_trend: Array<{ run_id: string; date: string; citation_rate: number }>;
  total_prompts: number;
  total_runs: number;
}

export interface RunListItem {
  id: string;
  status: string;
  total_prompts: number;
  completed_prompts: number;
  created_at: string;
  overall_citation_rate: number | null;
}

export interface RunListResponse {
  runs: RunListItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface Competitor {
  id: string;
  name: string;
}

export const dashboard = {
  getSummary: () => apiFetch<DashboardSummary>("/client/dashboard/summary"),
  getRuns: (page = 1) => apiFetch<RunListResponse>(`/client/dashboard/runs?page=${page}`),
  getLatestRun: () => apiFetch<RunSummaryResponse | null>("/client/dashboard/runs/latest"),
  getRunDetail: (runId: string) => apiFetch<RunSummaryResponse>(`/client/dashboard/runs/${runId}`),
  getRunPrompts: (runId: string) => apiFetch<PromptDetail[]>(`/client/dashboard/runs/${runId}/prompts`),
  getCompetitors: () => apiFetch<Competitor[]>("/client/dashboard/competitors"),
};

// kept for backward compat with any remaining imports
export const api = {
  getLatestRun: (_clientId: string) => dashboard.getLatestRun(),
  getRun: (runId: string) => dashboard.getRunDetail(runId),
  getRunPrompts: (runId: string) => dashboard.getRunPrompts(runId),
};
