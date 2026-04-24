export type Platform = "perplexity" | "openai" | "anthropic";
export type RunStatus = "pending" | "running" | "completed" | "failed";
export type Prominence = "primary" | "secondary" | "mentioned" | "not_cited";
export type Sentiment = "positive" | "neutral" | "negative" | "not_cited";
export type CitationOpportunity = "high" | "medium" | "low";

export interface ClientRead {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface RunRead {
  id: string;
  client_id: string;
  status: RunStatus;
  total_prompts: number;
  completed_prompts: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformStats {
  platform: Platform;
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
}

export interface PromptAnalysisItem {
  platform: Platform;
  response_id: string;
  raw_response: string;
  model_used: string;
  latency_ms?: number | null;
  cost_usd?: number | null;
  // null while analysis is in progress
  client_cited?: boolean | null;
  client_prominence?: Prominence | null;
  client_sentiment?: Sentiment | null;
  client_characterization?: string | null;
  competitors_cited: Array<{ brand: string; prominence: string; sentiment: string }>;
  content_gaps: string[];
  citation_opportunity?: CitationOpportunity | null;
  reasoning?: string | null;
}

export interface PromptDetail {
  prompt_id: string;
  prompt_text: string;
  category: string;
  results: PromptAnalysisItem[];
}

// ── Prompt management ─────────────────────────────────────────────────────────

export type PromptCategory = "awareness" | "evaluation" | "comparison" | "recommendation" | "brand";

export interface PromptRead {
  id: string;
  client_id: string;
  text: string;
  category: PromptCategory;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptCreate {
  text: string;
  category: PromptCategory;
}

export interface PromptUpdate {
  text?: string;
  category?: PromptCategory;
  is_active?: boolean;
}

export interface PromptListResponse {
  items: PromptRead[];
  total: number;
  page: number;
  per_page: number;
}

export interface PromptBulkCreate {
  prompts: PromptCreate[];
}

export interface PromptBulkResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface AuditLogRead {
  id: string;
  client_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogRead[];
  total: number;
  page: number;
  per_page: number;
}

export interface PromptListFilters {
  category?: PromptCategory | "";
  is_active?: boolean;
  search?: string;
  page?: number;
  per_page?: number;
}
