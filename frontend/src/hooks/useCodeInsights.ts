"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AISettings,
  CommitInsight,
  InsightsSnapshot,
  LLMUsageSummary,
  PRInsight,
  ReviewInsight,
  ReviewPeriodType,
  ReviewerSuggestionsResult,
  SimilarPRsResult,
  SnapshotKind,
  SnapshotScopeType,
  TaskPRAlignment,
  codeInsightsApi,
} from "@/lib/code-insights-api";

/** Per-commit AI insight. `commitId` may be null while the parent view is loading. */
export function useCommitInsight(commitId: string | null) {
  return useQuery<CommitInsight>({
    queryKey: ["codeInsights", "commit", commitId],
    queryFn: () => codeInsightsApi.getCommitInsight(commitId!),
    enabled: !!commitId,
    // 5 minutes — analysis output is stable until re-run.
    staleTime: 5 * 60 * 1000,
  });
}

export function usePRInsight(prId: string | null) {
  return useQuery<PRInsight>({
    queryKey: ["codeInsights", "pr", prId],
    queryFn: () => codeInsightsApi.getPRInsight(prId!),
    enabled: !!prId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useReviewInsight(reviewId: string | null) {
  return useQuery<ReviewInsight>({
    queryKey: ["codeInsights", "review", reviewId],
    queryFn: () => codeInsightsApi.getReviewInsight(reviewId!),
    enabled: !!reviewId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkspaceAISettings(workspaceId: string | null) {
  return useQuery<AISettings>({
    queryKey: ["aiSettings", workspaceId],
    queryFn: () => codeInsightsApi.getWorkspaceAISettings(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useSimilarPRs(prId: string | null, limit = 5) {
  return useQuery<SimilarPRsResult>({
    queryKey: ["codeInsights", "similarPRs", prId, limit],
    queryFn: () => codeInsightsApi.getSimilarPRs(prId!, limit),
    enabled: !!prId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useReviewerSuggestions(prId: string | null, limit = 5) {
  return useQuery<ReviewerSuggestionsResult>({
    queryKey: ["codeInsights", "reviewerSuggestions", prId, limit],
    queryFn: () => codeInsightsApi.getReviewerSuggestions(prId!, limit),
    enabled: !!prId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaskPRAlignment(linkId: string | null) {
  return useQuery<TaskPRAlignment>({
    queryKey: ["codeInsights", "taskPRAlignment", linkId],
    queryFn: () => codeInsightsApi.getTaskPRAlignment(linkId!),
    enabled: !!linkId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInsightsSnapshots(params: {
  workspaceId: string | null;
  scopeType: SnapshotScopeType;
  scopeId: string | null;
  kind?: SnapshotKind;
  limit?: number;
}) {
  const { workspaceId, scopeType, scopeId, kind, limit } = params;
  return useQuery<{ snapshots: InsightsSnapshot[] }>({
    queryKey: [
      "codeInsights",
      "snapshots",
      workspaceId,
      scopeType,
      scopeId,
      kind,
      limit,
    ],
    queryFn: () =>
      codeInsightsApi.listSnapshots({
        workspaceId: workspaceId!,
        scopeType,
        scopeId: scopeId!,
        kind,
        limit,
      }),
    enabled: !!workspaceId && !!scopeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLLMUsage(workspaceId: string | null, days = 30) {
  return useQuery<LLMUsageSummary>({
    queryKey: ["codeInsights", "llmUsage", workspaceId, days],
    queryFn: () => codeInsightsApi.getLLMUsage(workspaceId!, days),
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });
}

export function useUpdateWorkspaceAISettings(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<AISettings, Error, AISettings>({
    mutationFn: (settings) =>
      codeInsightsApi.updateWorkspaceAISettings(workspaceId!, settings),
    onSuccess: (data) => {
      queryClient.setQueryData(["aiSettings", workspaceId], data);
      toast.success("AI analysis settings saved");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save AI settings",
      );
    },
  });
}

/**
 * Dispatch a manual review-digest generation. The backend returns
 * immediately with a workflow id; the snapshot becomes available via
 * `useInsightsSnapshots` once the activity finishes.
 */
export function useGenerateReviewDigest() {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof codeInsightsApi.generateReviewDigest>>,
    Error,
    {
      scopeType: SnapshotScopeType;
      scopeId: string;
      workspaceId: string;
      periodType: ReviewPeriodType;
      periodStart?: string;
      periodEnd?: string;
    }
  >({
    mutationFn: (params) => codeInsightsApi.generateReviewDigest(params),
    onSuccess: (_, variables) => {
      // Invalidate the snapshots query so the new one shows up after polling.
      queryClient.invalidateQueries({
        queryKey: ["codeInsights", "snapshots"],
      });
      toast.success("Review digest generation started");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to start review digest generation",
      );
    },
  });
}
