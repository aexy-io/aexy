import { api } from "./api";

/** Providers the backend can construct. Mirrors SUPPORTED_AI_PROVIDERS in
 *  models/workspace_ai_settings.py — the response also carries the list, which
 *  is what the UI renders, so the two can't silently drift. */
export type AIProvider =
  | "claude"
  | "gemini"
  | "openrouter"
  | "deepseek"
  | "ollama"
  | "lmstudio";

/** Which credential is actually serving this workspace right now. */
export type AIEffectiveSource = "workspace" | "platform" | "disabled";

export interface AISettings {
  workspace_id: string;
  ai_enabled: boolean;
  provider: AIProvider | null;
  model: string | null;
  base_url: string | null;
  allow_platform_fallback: boolean;

  /** Presence and identity of the stored key. The key itself is never returned. */
  has_api_key: boolean;
  key_hint: string | null;
  key_set_at: string | null;

  disabled_reason: string | null;
  disabled_at: string | null;
  updated_at: string | null;

  can_manage: boolean;
  plan_allows: boolean;
  plan_tier: string | null;
  effective_source: AIEffectiveSource;
  supported_providers: AIProvider[];
}

export interface AISettingsUpdate {
  ai_enabled?: boolean;
  disabled_reason?: string | null;
  provider?: AIProvider;
  model?: string | null;
  base_url?: string | null;
  /** Write-only. `""` clears the stored key; omit to leave it untouched. */
  api_key?: string;
  allow_platform_fallback?: boolean;
  /** Hand the workspace back to the platform default (also clears the key). */
  clear_provider?: boolean;
}

export interface AIConnectionTestResult {
  ok: boolean;
  provider: string | null;
  model: string | null;
  detail: string | null;
}

export const aiSettingsApi = {
  get: async (workspaceId: string): Promise<AISettings> => {
    const res = await api.get(`/workspaces/${workspaceId}/ai-settings`);
    return res.data;
  },

  update: async (
    workspaceId: string,
    data: AISettingsUpdate,
  ): Promise<AISettings> => {
    const res = await api.patch(`/workspaces/${workspaceId}/ai-settings`, data);
    return res.data;
  },

  /** Live probe. Resolves (not rejects) on a provider-side failure — a wrong
   *  key is a normal answer here, and the message is the useful part. */
  test: async (workspaceId: string): Promise<AIConnectionTestResult> => {
    const res = await api.post(`/workspaces/${workspaceId}/ai-settings/test`);
    return res.data;
  },
};
