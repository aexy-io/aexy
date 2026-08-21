/**
 * Workspace settings for AI editing of Word documents.
 *
 * A module of its own rather than another section of `lib/api.ts`, which is
 * 600 kB and hand-maintained — the same choice `ai-settings-api.ts` made.
 */

import { api } from "@/lib/api";

export interface DocsAiSettings {
  /** `"on"` or `"off"` — the feature switch for this workspace. */
  mode: string;
  /** Whether tagging the handle in a document comment drafts an edit. */
  comment_trigger: boolean;
  /** The handle without its `@`, e.g. `aexy`. */
  comment_trigger_handle: string;
  /** Whether the AI may leave a comment instead of rewriting. */
  allow_ai_comments: boolean;
  /** The name on AI tracked changes and comments, e.g. `Aexy AI`. */
  ai_author_label: string;
  /** Ceiling on how many changes one proposal may carry. */
  max_ops: number;
  /** Whether a machine-initiated draft notifies the document's owner. */
  notify_owner: boolean;

  /**
   * Whether the reader may change any of this.
   *
   * Server-computed. The page renders itself read-only rather than hiding —
   * a member who can see the setting but not change it is better served by
   * being told than by an absent control.
   */
  can_manage: boolean;
}

/** A PATCH body: only what changed, so a stale client cannot revert a peer's edit. */
export type DocsAiSettingsUpdate = Partial<Omit<DocsAiSettings, "can_manage">>;

export const docsAiSettingsApi = {
  get: async (workspaceId: string): Promise<DocsAiSettings> => {
    const response = await api.get(`/workspaces/${workspaceId}/docx-ai/settings`);
    return response.data;
  },

  update: async (
    workspaceId: string,
    changes: DocsAiSettingsUpdate
  ): Promise<DocsAiSettings> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/docx-ai/settings`,
      changes
    );
    return response.data;
  },
};
