"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  GhostClaimPreview,
  GhostClaimResult,
  WorkspaceGhostDeveloper,
  identityApi,
} from "@/lib/identity-api";

export function useGhostClaimPreview() {
  return useQuery<GhostClaimPreview>({
    queryKey: ["identity", "ghostClaimPreview"],
    queryFn: () => identityApi.previewClaim(),
    // Refetch after the claim so the UI shows zero left immediately.
    staleTime: 30 * 1000,
  });
}

export function useClaimGhostCommits() {
  const queryClient = useQueryClient();
  return useMutation<GhostClaimResult, Error, void>({
    mutationFn: () => identityApi.claim(),
    onSuccess: (data) => {
      const total = data.commits + data.prs + data.reviews;
      if (total > 0) {
        toast.success(
          `Reclaimed ${data.commits} commits, ${data.prs} PRs, ${data.reviews} reviews`,
        );
      } else {
        toast.success("Nothing to reclaim — your identity is already merged.");
      }
      queryClient.invalidateQueries({ queryKey: ["identity"] });
      // Insights / leaderboards will need to refetch too.
      queryClient.invalidateQueries({ queryKey: ["developerInsights"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to reclaim commits",
      );
    },
  });
}

export function useWorkspaceGhosts(workspaceId: string | null, limit = 50) {
  return useQuery<{ ghosts: WorkspaceGhostDeveloper[] }>({
    queryKey: ["identity", "workspaceGhosts", workspaceId, limit],
    queryFn: () => identityApi.listWorkspaceGhosts(workspaceId!, limit),
    enabled: !!workspaceId,
    staleTime: 30 * 1000,
  });
}

export function useMergeGhost(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<
    GhostClaimResult,
    Error,
    { ghostDeveloperId: string; targetDeveloperId: string }
  >({
    mutationFn: ({ ghostDeveloperId, targetDeveloperId }) =>
      identityApi.mergeGhost({
        workspaceId: workspaceId!,
        ghostDeveloperId,
        targetDeveloperId,
      }),
    onSuccess: (data) => {
      toast.success(
        `Merged: ${data.commits} commits, ${data.prs} PRs, ${data.reviews} reviews`,
      );
      queryClient.invalidateQueries({
        queryKey: ["identity", "workspaceGhosts", workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ["developerInsights"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to merge ghost",
      );
    },
  });
}
