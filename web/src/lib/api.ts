import type {
  AuditLogListResponse,
  ClientRead,
  PromptBulkCreate,
  PromptBulkResult,
  PromptCreate,
  PromptDetail,
  PromptListFilters,
  PromptListResponse,
  PromptRead,
  PromptUpdate,
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
  // ── Clients / Runs ──────────────────────────────────────────────────────────
  listClients: () => apiFetch<ClientRead[]>("/clients"),

  createRun: (clientId: string) =>
    apiFetch<RunRead>("/runs", {
      method: "POST",
      body: JSON.stringify({ client_id: clientId }),
    }),

  getRun: (runId: string) => apiFetch<RunSummaryResponse>(`/runs/${runId}`),

  getRunPrompts: (runId: string) =>
    apiFetch<PromptDetail[]>(`/runs/${runId}/prompts`),

  // ── Prompt management ───────────────────────────────────────────────────────
  listPrompts: (clientId: string, filters: PromptListFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.is_active !== undefined) params.set("is_active", String(filters.is_active));
    if (filters.search) params.set("search", filters.search);
    if (filters.page) params.set("page", String(filters.page));
    if (filters.per_page) params.set("per_page", String(filters.per_page));
    const qs = params.toString();
    return apiFetch<PromptListResponse>(`/clients/${clientId}/prompts${qs ? `?${qs}` : ""}`);
  },

  createPrompt: (clientId: string, body: PromptCreate) =>
    apiFetch<PromptRead>(`/clients/${clientId}/prompts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  bulkCreatePrompts: (clientId: string, body: PromptBulkCreate) =>
    apiFetch<PromptBulkResult>(`/clients/${clientId}/prompts/bulk`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  uploadCsvPrompts: (clientId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<PromptBulkResult>(`/clients/${clientId}/prompts/upload-csv`, {
      method: "POST",
      headers: {},  // let browser set Content-Type with boundary for multipart
      body: formData,
    });
  },

  updatePrompt: (clientId: string, promptId: string, body: PromptUpdate) =>
    apiFetch<PromptRead>(`/clients/${clientId}/prompts/${promptId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deactivatePrompt: (clientId: string, promptId: string) =>
    apiFetch<void>(`/clients/${clientId}/prompts/${promptId}`, {
      method: "DELETE",
    }),

  activatePrompt: (clientId: string, promptId: string) =>
    apiFetch<PromptRead>(`/clients/${clientId}/prompts/${promptId}`, {
      method: "PUT",
      body: JSON.stringify({ is_active: true }),
    }),

  // ── Audit logs ──────────────────────────────────────────────────────────────
  listAuditLogs: (clientId: string, page = 1, perPage = 50) =>
    apiFetch<AuditLogListResponse>(
      `/clients/${clientId}/audit-logs?entity_type=prompt&page=${page}&per_page=${perPage}`
    ),
};
