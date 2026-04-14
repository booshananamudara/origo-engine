import type {
  ClientRead,
  PromptDetail,
  RunRead,
  RunSummaryResponse,
} from "./types";

// All requests go through Vite's dev proxy: /api/* → FastAPI backend
const BASE = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listClients: () => apiFetch<ClientRead[]>("/clients"),

  createRun: (clientId: string) =>
    apiFetch<RunRead>("/runs", {
      method: "POST",
      body: JSON.stringify({ client_id: clientId }),
    }),

  getRun: (runId: string) => apiFetch<RunSummaryResponse>(`/runs/${runId}`),

  getRunPrompts: (runId: string) =>
    apiFetch<PromptDetail[]>(`/runs/${runId}/prompts`),
};
