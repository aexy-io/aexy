/**
 * Which model each AI feature runs on, for one workspace.
 *
 * Every row carries what it will *actually* resolve to and where that came
 * from, not only what is stored. A page showing only the stored value could not
 * tell its reader that an admin changed provider and half their choices are now
 * being ignored.
 */

import { api } from "@/lib/api";

/** A suggested model for the picker. */
export interface ModelOption {
  id: string;
  label: string;
  note: string;
  /** A default this codebase already ships, so it is known to work here. */
  in_use_here: boolean;
}

/** A stored override, with the provider it was chosen for. */
export interface ModelChoice {
  model: string;
  provider: string;
}

/** Where an effective model came from. Rendered as a badge. */
export type ModelSource =
  | "platform"
  | "workspace"
  | "category"
  | "feature"
  | "instance";

export interface FeatureModel {
  id: string;
  name: string;
  description: string;
  kind: "text" | "vision" | "embedding";
  app: string | null;

  /** False when the model cannot safely be changed from a screen. */
  configurable: boolean;
  reason_fixed: string | null;

  /**
   * Set when this feature is switched off in this deployment, with the reason.
   *
   * These are the features whose call sites were broken for their entire
   * existence — they never once ran. Repairing the call was not the same
   * decision as starting to bill for it, so they stay off until an operator
   * names them in `AI_ENABLE_DORMANT_FEATURES`. Reported rather than hidden: a
   * page that quietly omitted them would repeat the failure it exists to fix.
   */
  dormant_reason: string | null;

  override: ModelChoice | null;

  effective_model: string;
  effective_provider: string;
  source: ModelSource;

  /**
   * Set when a stored override is NOT being applied, with the reason. Such a row
   * must render as ignored rather than as live — that is the entire point of
   * recording a provider alongside a model.
   */
  ignored_reason: string | null;
}

export interface CategoryModels {
  id: string;
  name: string;
  description: string;
  override: ModelChoice | null;
  ignored_reason: string | null;
  features: FeatureModel[];
}

export interface WorkspaceDefault {
  provider: string;
  model: string;
  source: string;
}

export interface AIModels {
  /** Null when no provider has a credential at all — "AI is not set up". */
  workspace_default: WorkspaceDefault | null;
  /** Suggestions for the provider actually in use. Empty is fine; free text works. */
  catalog: ModelOption[];
  categories: CategoryModels[];
  can_manage: boolean;
  /** The workspace turned AI off entirely. The page renders and says so. */
  ai_disabled: boolean;
}

export type OverrideScope = "category" | "feature";

export const aiModelsApi = {
  get: async (workspaceId: string): Promise<AIModels> => {
    const response = await api.get(`/workspaces/${workspaceId}/ai-models`);
    return response.data;
  },

  /**
   * Choose a model. The provider is not sent: the server records the one
   * actually serving the workspace, so a stale page cannot store a combination
   * that never applies.
   */
  set: async (
    workspaceId: string,
    scope: OverrideScope,
    key: string,
    model: string
  ): Promise<AIModels> => {
    const response = await api.put(`/workspaces/${workspaceId}/ai-models`, {
      scope,
      key,
      model,
    });
    return response.data;
  },

  /** Stop overriding and go back to inheriting. Deletes rather than pins. */
  clear: async (
    workspaceId: string,
    scope: OverrideScope,
    key: string
  ): Promise<AIModels> => {
    const response = await api.delete(
      `/workspaces/${workspaceId}/ai-models/${scope}/${key}`
    );
    return response.data;
  },
};
