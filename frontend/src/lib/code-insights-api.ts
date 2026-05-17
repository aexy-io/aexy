/**
 * Client for the GitHub AI analysis endpoints (Phase 2).
 *
 * Sits outside the generated `api.ts` since these routes are too new to be in
 * the upstream OpenAPI snapshot. Reuses the shared axios instance for auth
 * headers, base URL, and interceptors.
 */

import { api } from "@/lib/api";

export type AISettingsMode = "off" | "on";
export type AIModelTier = "haiku" | "sonnet";

export interface AISettings {
  mode: AISettingsMode;
  model_tier: AIModelTier;
}

/** Free-form LLM analysis payload — schema mirrors backend AnalysisResult.
 *
 * Phase 4B adds the `security` sub-block produced by the deterministic
 * scanner; it's merged alongside the LLM output and present even when the
 * LLM call was skipped.
 */
export interface AnalysisPayload {
  languages?: Array<{ name: string; confidence?: number }>;
  frameworks?: Array<{ name: string; confidence?: number }>;
  domains?: Array<{ name: string; confidence?: number }>;
  soft_skills?: Array<{ skill: string; evidence?: string }>;
  summary?: string;
  confidence?: number;
  security?: SecurityBlock;
  [key: string]: unknown;
}

export interface CommitInsight {
  commit_id: string;
  sha: string;
  author_class: string | null;
  change_class: string | null;
  is_merge: boolean;
  is_revert: boolean;
  analysis: AnalysisPayload | null;
  analyzed_at: string | null;
}

export interface PRInsight {
  pr_id: string;
  github_id: number;
  number: number;
  size_bucket: string | null;
  analysis: AnalysisPayload | null;
  analyzed_at: string | null;
}

export interface ReviewInsight {
  review_id: string;
  github_id: number;
  state: string;
  quality_metrics: AnalysisPayload | null;
  analyzed_at: string | null;
}

/** Phase 3 — periodic InsightsSnapshot row. */
export type SnapshotScopeType = "developer" | "repository" | "workspace" | "team";
export type SnapshotKind =
  | "weekly_digest"
  | "repo_health"
  | "review_summary"
  | "team_review_summary"
  | string;

/** Phase B — review-period taxonomy. */
export type ReviewPeriodType =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "yearly"
  | "custom";

/** Developer review_summary payload. */
export interface DeveloperReviewPayload {
  headline?: string;
  shipped?: string[];
  growth?: string[];
  strengths?: string[];
  areas_to_invest?: string[];
  blockers?: string[];
  collaboration?: string[];
  confidence?: number;
  period_type?: ReviewPeriodType;
  cycle_id?: string | null;
  metrics?: {
    commits?: number;
    merge_commits?: number;
    reverts?: number;
    prs_opened?: number;
    prs_merged?: number;
    reviews_given?: number;
  };
  week_by_week?: Array<{
    period_start: string;
    period_end: string;
    headline?: string;
    metrics?: Record<string, number>;
    what_shipped?: string[];
    blockers?: string[];
  }>;
  prompt_version?: string;
  _unparsed?: boolean;
}

/** Team review_summary payload. */
export interface TeamReviewPayload {
  headline?: string;
  highlights?: string[];
  cross_team_patterns?: string[];
  knowledge_risks?: string[];
  team_strengths?: string[];
  team_growth_areas?: string[];
  confidence?: number;
  period_type?: ReviewPeriodType;
  cycle_id?: string | null;
  team_metrics?: Record<string, number>;
  members?: Array<{
    developer_id: string;
    name: string | null;
    headline?: string;
    metrics?: Record<string, number>;
    shipped?: string[];
    strengths?: string[];
    blockers?: string[];
  }>;
  prompt_version?: string;
}

export interface InsightsSnapshot {
  id: string;
  scope_type: SnapshotScopeType;
  scope_id: string;
  kind: SnapshotKind;
  period_start: string;
  period_end: string;
  payload: Record<string, unknown>;
  model: string | null;
  created_at: string;
}

export interface SimilarPR {
  pr_id: string;
  number: number;
  title: string;
  repository: string;
  similarity: number;
}

export interface SimilarPRsResult {
  pr_id: string;
  matches: SimilarPR[];
  reason?: string;
}

/** LLM usage rollup returned by GET /code-insights/llm-usage. */
export interface LLMUsageSummary {
  workspace_id: string;
  days: number;
  since: string;
  totals: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  by_day: Array<{
    day: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  by_provider: Array<{
    provider: string;
    model: string | null;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  by_operation: Array<{
    operation: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
}

/** Phase 4A — reviewer suggestion entry. */
export interface ReviewerSuggestion {
  developer_id: string;
  name: string | null;
  github_username: string | null;
  avatar_url: string | null;
  score: number;
  evidence: Array<{
    pr_number: number;
    repository: string;
    role: "author" | "reviewer";
    similarity: number;
  }>;
}

export interface ReviewerSuggestionsResult {
  pr_id: string;
  suggestions: ReviewerSuggestion[];
  reason?: string;
}

/** Phase 4B — security findings shape. */
export interface SecurityFinding {
  kind: "secret" | "sensitive_area" | "risky_call" | string;
  severity: "high" | "medium" | "low" | string;
  pattern: string;
  file: string | null;
  line_hint: string | null;
}

export interface SecurityBlock {
  findings: SecurityFinding[];
  summary: {
    total: number;
    by_severity: Record<string, number>;
    by_kind: Record<string, number>;
  };
}

/** Phase 4C — task-PR alignment. */
export interface TaskPRAlignment {
  link_id: string;
  task_id: string | null;
  task_title: string | null;
  pull_request_id: string | null;
  pull_request_number: number | null;
  alignment: {
    matches_intent?: number | null;
    gaps?: string[];
    extras?: string[];
    notes?: string[];
    confidence?: number;
    prompt_version?: string;
  } | null;
  analyzed_at: string | null;
}

/** Shape of a `weekly_digest` payload as produced by compose_developer_digest. */
export interface WeeklyDigestPayload {
  headline?: string;
  what_shipped?: string[];
  hotspots?: string[];
  growth_signals?: string[];
  blockers?: string[];
  confidence?: number;
  metrics?: {
    commits?: number;
    merge_commits?: number;
    reverts?: number;
    prs?: number;
    reviews?: number;
  };
  prompt_version?: string;
  _unparsed?: boolean;
}

/** Shape of a `repo_health` payload as produced by compose_repo_health. */
export interface RepoHealthPayload {
  headline?: string;
  hotspots?: string[];
  risks?: string[];
  highlights?: string[];
  trends?: string[];
  confidence?: number;
  metrics?: {
    commits?: number;
    merge_commits?: number;
    reverts?: number;
    prs_opened?: number;
    prs_merged?: number;
    merged_without_review?: number;
    reviews?: number;
  };
  prompt_version?: string;
  _unparsed?: boolean;
}

export const codeInsightsApi = {
  getCommitInsight: async (commitId: string): Promise<CommitInsight> => {
    const response = await api.get(`/code-insights/commits/${commitId}`);
    return response.data;
  },

  getPRInsight: async (prId: string): Promise<PRInsight> => {
    const response = await api.get(`/code-insights/pull-requests/${prId}`);
    return response.data;
  },

  getReviewInsight: async (reviewId: string): Promise<ReviewInsight> => {
    const response = await api.get(`/code-insights/reviews/${reviewId}`);
    return response.data;
  },

  getSimilarPRs: async (prId: string, limit = 5): Promise<SimilarPRsResult> => {
    const response = await api.get(
      `/code-insights/pull-requests/${prId}/similar`,
      { params: { limit } },
    );
    return response.data;
  },

  getReviewerSuggestions: async (
    prId: string,
    limit = 5,
  ): Promise<ReviewerSuggestionsResult> => {
    const response = await api.get(
      `/code-insights/pull-requests/${prId}/reviewer-suggestions`,
      { params: { limit } },
    );
    return response.data;
  },

  getTaskPRAlignment: async (linkId: string): Promise<TaskPRAlignment> => {
    const response = await api.get(
      `/code-insights/task-pr-links/${linkId}/alignment`,
    );
    return response.data;
  },

  listSnapshots: async (params: {
    workspaceId: string;
    scopeType: SnapshotScopeType;
    scopeId: string;
    kind?: SnapshotKind;
    limit?: number;
  }): Promise<{ snapshots: InsightsSnapshot[] }> => {
    const response = await api.get(`/code-insights/snapshots`, {
      params: {
        workspace_id: params.workspaceId,
        scope_type: params.scopeType,
        scope_id: params.scopeId,
        kind: params.kind,
        limit: params.limit ?? 10,
      },
    });
    return response.data;
  },

  getLLMUsage: async (
    workspaceId: string,
    days = 30,
  ): Promise<LLMUsageSummary> => {
    const response = await api.get(`/code-insights/llm-usage`, {
      params: { workspace_id: workspaceId, days },
    });
    return response.data;
  },

  getWorkspaceAISettings: async (workspaceId: string): Promise<AISettings> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/settings/ai-analysis`,
    );
    return response.data;
  },

  updateWorkspaceAISettings: async (
    workspaceId: string,
    settings: AISettings,
  ): Promise<AISettings> => {
    const response = await api.put(
      `/workspaces/${workspaceId}/settings/ai-analysis`,
      settings,
    );
    return response.data;
  },

  generateReviewDigest: async (params: {
    scopeType: SnapshotScopeType;
    scopeId: string;
    workspaceId: string;
    periodType: ReviewPeriodType;
    periodStart?: string;
    periodEnd?: string;
  }): Promise<{
    workflow_id: string;
    scope_type: string;
    scope_id: string;
    period_type: string;
    period_start: string;
    period_end: string;
  }> => {
    const response = await api.post("/code-insights/reviews/generate", {
      scope_type: params.scopeType,
      scope_id: params.scopeId,
      workspace_id: params.workspaceId,
      period_type: params.periodType,
      period_start: params.periodStart,
      period_end: params.periodEnd,
    });
    return response.data;
  },
};
