"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  EmailAlias,
  EmailAliasAddResult,
  EmailAliasPreview,
  GhostClaimPreview,
  GhostClaimResult,
  WorkspaceGhostDeveloper,
  emailAliasApi,
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

// ---------------------------------------------------------------
// Email aliases
// ---------------------------------------------------------------

export function useEmailAliases() {
  return useQuery<EmailAlias[]>({
    queryKey: ["identity", "emailAliases"],
    queryFn: () => emailAliasApi.list(),
    staleTime: 30 * 1000,
  });
}

export function useEmailAliasPreview(email: string | null) {
  return useQuery<EmailAliasPreview>({
    queryKey: ["identity", "emailAliasPreview", email?.toLowerCase()],
    queryFn: () => emailAliasApi.preview(email!),
    enabled: !!email && email.includes("@"),
    staleTime: 30 * 1000,
  });
}

export function useAddEmailAlias() {
  const queryClient = useQueryClient();
  return useMutation<EmailAliasAddResult, Error, { email: string }>({
    mutationFn: ({ email }) => emailAliasApi.add(email),
    onSuccess: (data) => {
      const moved = data.backfill.commits;
      if (moved > 0) {
        toast.success(`Alias added — reclaimed ${moved} commits`);
      } else {
        toast.success("Alias added — no prior commits matched");
      }
      queryClient.invalidateQueries({ queryKey: ["identity"] });
      queryClient.invalidateQueries({ queryKey: ["developerInsights"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to add alias";
      toast.error(message);
    },
  });
}

export function useRemoveEmailAlias() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { aliasId: string }>({
    mutationFn: ({ aliasId }) => emailAliasApi.remove(aliasId),
    onSuccess: () => {
      toast.success("Alias removed");
      queryClient.invalidateQueries({
        queryKey: ["identity", "emailAliases"],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove alias",
      );
    },
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
