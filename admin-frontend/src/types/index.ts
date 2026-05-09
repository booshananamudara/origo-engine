// ── Auth ──────────────────────────────────────────────────────────────────────

export type AdminRole = "super_admin" | "geo_lead" | "analyst";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: AdminRole;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AdminUser;
}

// ── Clients ───────────────────────────────────────────────────────────────────

export type ClientStatus = "active" | "paused" | "archived";
export type ScheduleCadence = "hourly" | "daily" | "weekly" | "manual";

export interface Client {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  website: string | null;
  status: ClientStatus;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Schedule fields (always returned by the API)
  schedule_enabled: boolean;
  schedule_cadence: ScheduleCadence;
  schedule_hour: number;
  schedule_minute: number;
  schedule_day_of_week: number | null;
  next_scheduled_run_at: string | null;
  last_scheduled_run_at: string | null;
}

export interface ClientSummary extends Client {
  total_prompts: number;
  total_competitors: number;
  last_run_at: string | null;
  last_run_status: string | null;
  latest_citation_rate: number | null;
  schedule_enabled: boolean;
  schedule_cadence: ScheduleCadence;
  next_scheduled_run_at: string | null;
}

export interface KnowledgeBase {
  id: string;
  client_id: string;
  brand_profile: Record<string, unknown>;
  target_audience: Record<string, unknown>;
  brand_voice: Record<string, unknown>;
  industry_context: Record<string, unknown>;
  version: number;
  updated_at: string;
}

export interface ClientDetail extends Client {
  knowledge_base: KnowledgeBase | null;
  total_prompts: number;
  total_competitors: number;
}

// ── Competitors ───────────────────────────────────────────────────────────────

export interface Competitor {
  id: string;
  name: string;
  client_id: string;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

export type PromptCategory =
  | "awareness"
  | "evaluation"
  | "comparison"
  | "recommendation"
  | "brand";

export type RunStatus = "pending" | "running" | "completed" | "failed";

// ── Scheduler ─────────────────────────────────────────────────────────────────

export type SchedulerRunStatus = "enqueued" | "started" | "completed" | "failed" | "skipped";

export interface ScheduleConfig {
  schedule_enabled: boolean;
  schedule_cadence: ScheduleCadence;
  schedule_hour: number;
  schedule_minute: number;
  schedule_day_of_week: number | null;
}

export interface SchedulerRunItem {
  id: string;
  run_id: string | null;
  triggered_at: string;
  status: SchedulerRunStatus;
  cadence: ScheduleCadence;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export interface ScheduleResponse extends ScheduleConfig {
  last_scheduled_run_at: string | null;
  next_scheduled_run_at: string | null;
  is_due_now: boolean;
  recent_runs: SchedulerRunItem[];
}

export interface SchedulerHealth {
  last_tick_at: string | null;
  last_tick_age_seconds: number | null;
  is_healthy: boolean;
  last_tick_clients_evaluated: number | null;
  last_tick_runs_enqueued: number | null;
  consecutive_failures: number;
  last_error: string | null;
  active_clients_count: number;
  scheduled_runs_today: Record<string, number>;
}
export type Platform = "perplexity" | "openai" | "anthropic" | "gemini";
export type Prominence = "primary" | "secondary" | "mentioned" | "not_cited";
export type Sentiment = "positive" | "neutral" | "negative" | "not_cited";
export type CitationOpportunity = "high" | "medium" | "low";

export interface Prompt {
  id: string;
  client_id: string;
  text: string;
  category: PromptCategory;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptListResponse {
  items: Prompt[];
  total: number;
  page: number;
  per_page: number;
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export interface RunRead {
  id: string;
  client_id: string;
  status: RunStatus;
  total_prompts: number;
  completed_prompts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunSummaryItem {
  id: string;
  status: string;
  total_prompts: number;
  completed_prompts: number;
  created_at: string;
  updated_at: string;
  overall_citation_rate: number | null;
}

export interface RunListResponse {
  items: RunSummaryItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface PlatformStats {
  platform: Platform;
  model_used: string;
  total_responses: number;
  cited_count: number;
  citation_rate: number;
  prominence_breakdown: Record<string, number>;
}

export interface CompetitorStats {
  brand: string;
  cited_count: number;
  share_of_voice: number;
}

export interface RunSummaryResponse {
  run: RunRead;
  total_analyses: number;
  overall_citation_rate: number;
  platform_stats: PlatformStats[];
  competitor_stats: CompetitorStats[];
  platform_errors: Record<string, string>;
}

export interface PromptAnalysisItem {
  platform: Platform;
  response_id: string;
  raw_response: string;
  model_used: string;
  latency_ms: number | null;
  cost_usd: number | null;
  client_cited: boolean | null;
  client_prominence: Prominence | null;
  client_sentiment: Sentiment | null;
  client_characterization: string | null;
  competitors_cited: Array<{ brand: string; prominence: string; sentiment: string }>;
  content_gaps: string[];
  citation_opportunity: CitationOpportunity | null;
  reasoning: string | null;
}

export interface PromptDetail {
  prompt_id: string;
  prompt_text: string;
  category: string;
  results: PromptAnalysisItem[];
}
