import axios from "axios";
import type {
  AdminUser,
  Client,
  ClientDetail,
  ClientSummary,
  Competitor,
  KnowledgeBase,
  LoginResponse,
  PromptDetail,
  PromptListResponse,
  RunListResponse,
  RunRead,
  RunSummaryResponse,
} from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export const http = axios.create({ baseURL: BASE });

// ── Auth interceptors ─────────────────────────────────────────────────────────

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
}

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return http(original);
          })
          .catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${BASE}/admin/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const newToken: string = res.data.access_token;
        localStorage.setItem("access_token", newToken);
        http.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return http(original);
      } catch (err) {
        processQueue(err, null);
        localStorage.clear();
        window.location.href = "/login";
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    http.post<LoginResponse>("/admin/auth/login", { email, password }).then((r) => r.data),

  me: () => http.get<AdminUser>("/admin/auth/me").then((r) => r.data),
};

// ── Clients ───────────────────────────────────────────────────────────────────

export const clientsApi = {
  list: (status = "active") =>
    http.get<ClientSummary[]>("/admin/clients", { params: { status } }).then((r) => r.data),

  get: (id: string) =>
    http.get<ClientDetail>(`/admin/clients/${id}`).then((r) => r.data),

  create: (body: { name: string; slug?: string; industry?: string; website?: string }) =>
    http.post<Client>("/admin/clients", body).then((r) => r.data),

  update: (id: string, body: { name?: string; industry?: string; website?: string }) =>
    http.put<Client>(`/admin/clients/${id}`, body).then((r) => r.data),

  setStatus: (id: string, status: string) =>
    http.patch<Client>(`/admin/clients/${id}/status`, { status }).then((r) => r.data),
};

// ── Competitors ───────────────────────────────────────────────────────────────

export const competitorsApi = {
  list: (clientId: string) =>
    http.get<Competitor[]>(`/admin/clients/${clientId}/competitors`).then((r) => r.data),

  create: (clientId: string, name: string) =>
    http
      .post<Competitor>(`/admin/clients/${clientId}/competitors`, { name })
      .then((r) => r.data),

  bulkCreate: (clientId: string, names: string[]) =>
    http
      .post<{ created: number; skipped: number }>(
        `/admin/clients/${clientId}/competitors/bulk`,
        { names }
      )
      .then((r) => r.data),

  update: (clientId: string, competitorId: string, name: string) =>
    http
      .put<Competitor>(`/admin/clients/${clientId}/competitors/${competitorId}`, { name })
      .then((r) => r.data),

  delete: (clientId: string, competitorId: string) =>
    http.delete(`/admin/clients/${clientId}/competitors/${competitorId}`),
};

// ── Knowledge Base ────────────────────────────────────────────────────────────

export const knowledgeBaseApi = {
  get: (clientId: string) =>
    http.get<KnowledgeBase>(`/admin/clients/${clientId}/knowledge-base`).then((r) => r.data),

  update: (clientId: string, body: Partial<KnowledgeBase>) =>
    http
      .put<KnowledgeBase>(`/admin/clients/${clientId}/knowledge-base`, body)
      .then((r) => r.data),
};

// ── Runs ──────────────────────────────────────────────────────────────────────

export const runsApi = {
  list: (clientId: string, page = 1, perPage = 20) =>
    http
      .get<RunListResponse>(`/admin/clients/${clientId}/runs`, {
        params: { page, per_page: perPage },
      })
      .then((r) => r.data),

  trigger: (clientId: string) =>
    http.post<RunRead>(`/admin/clients/${clientId}/runs/trigger`).then((r) => r.data),

  get: (clientId: string, runId: string) =>
    http
      .get<RunSummaryResponse>(`/admin/clients/${clientId}/runs/${runId}`)
      .then((r) => r.data),

  getPrompts: (clientId: string, runId: string) =>
    http
      .get<PromptDetail[]>(`/admin/clients/${clientId}/runs/${runId}/prompts`)
      .then((r) => r.data),
};

// ── Prompts ───────────────────────────────────────────────────────────────────

export const promptsApi = {
  list: (
    clientId: string,
    filters: {
      category?: string;
      is_active?: boolean;
      search?: string;
      page?: number;
      per_page?: number;
    } = {}
  ) => {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.is_active !== undefined) params.set("is_active", String(filters.is_active));
    if (filters.search) params.set("search", filters.search);
    if (filters.page) params.set("page", String(filters.page));
    if (filters.per_page) params.set("per_page", String(filters.per_page));
    return http
      .get<PromptListResponse>(`/admin/clients/${clientId}/prompts?${params}`)
      .then((r) => r.data);
  },

  create: (clientId: string, text: string, category: string) =>
    http
      .post(`/admin/clients/${clientId}/prompts`, { text, category })
      .then((r) => r.data),

  update: (clientId: string, promptId: string, body: Record<string, unknown>) =>
    http.put(`/admin/clients/${clientId}/prompts/${promptId}`, body).then((r) => r.data),

  deactivate: (clientId: string, promptId: string) =>
    http.delete(`/admin/clients/${clientId}/prompts/${promptId}`),

  activate: (clientId: string, promptId: string) =>
    http
      .put(`/admin/clients/${clientId}/prompts/${promptId}`, { is_active: true })
      .then((r) => r.data),

  bulkCreate: (clientId: string, prompts: Array<{ text: string; category: string }>) =>
    http
      .post(`/admin/clients/${clientId}/prompts/bulk`, { prompts })
      .then((r) => r.data),

  uploadCsv: (clientId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return http
      .post(`/admin/clients/${clientId}/prompts/upload-csv`, fd, {
        headers: { "Content-Type": undefined },
      })
      .then((r) => r.data);
  },
};
