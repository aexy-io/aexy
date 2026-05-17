/**
 * Self-serve identity reconciliation API.
 *
 * Lets a signed-in developer preview and claim any "ghost developer" row
 * whose GitHub login matches theirs — recovering attribution for commits
 * synced before they first signed in. See backend D2 work.
 */

import { api } from "@/lib/api";

export interface GhostClaimPreview {
  ghost_id: string | null;
  commits: number;
  prs: number;
  reviews: number;
  github_username: string | null;
}

export interface GhostClaimResult {
  commits: number;
  prs: number;
  reviews: number;
  ghost_deleted: number;
}

/** Admin: ghost developer found in a workspace, with suggested matches. */
export interface WorkspaceGhostDeveloper {
  ghost_id: string;
  name: string;
  commits: number;
  prs: number;
  reviews: number;
  suggestions: Array<{
    developer_id: string;
    name: string | null;
    github_username: string | null;
    avatar_url: string | null;
    reason: "github_username_match" | "developer_name_match";
  }>;
}

export const identityApi = {
  previewClaim: async (): Promise<GhostClaimPreview> => {
    const response = await api.get("/developers/me/claim-commits/preview");
    return response.data;
  },

  claim: async (): Promise<GhostClaimResult> => {
    const response = await api.post("/developers/me/claim-commits");
    return response.data;
  },

  listWorkspaceGhosts: async (
    workspaceId: string,
    limit = 50,
  ): Promise<{ ghosts: WorkspaceGhostDeveloper[] }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/ghost-developers`,
      { params: { limit } },
    );
    return response.data;
  },

  mergeGhost: async (params: {
    workspaceId: string;
    ghostDeveloperId: string;
    targetDeveloperId: string;
  }): Promise<GhostClaimResult> => {
    const response = await api.post(
      `/workspaces/${params.workspaceId}/ghost-developers/merge`,
      {
        ghost_developer_id: params.ghostDeveloperId,
        target_developer_id: params.targetDeveloperId,
      },
    );
    return response.data;
  },
};
