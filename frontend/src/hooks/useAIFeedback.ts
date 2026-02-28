"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  aiFeedbackApi,
  aiBenchmarkingApi,
  AIFeedbackCreate,
  AIFeedbackResponse,
  AIBenchmarkingResponse,
  PaginatedAIFeedback,
} from "@/lib/api";

/**
 * Hook to get current user's feedback on a specific entity.
 */
export function useAIFeedback(
  workspaceId: string | undefined,
  entityType: string,
  entityId: string | undefined,
) {
  return useQuery<AIFeedbackResponse | null>({
    queryKey: ["ai-feedback", entityType, entityId],
    queryFn: () => aiFeedbackApi.get(workspaceId!, entityType, entityId!),
    enabled: !!workspaceId && !!entityId,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Hook to submit feedback (upsert).
 */
export function useSubmitFeedback(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<AIFeedbackResponse, Error, AIFeedbackCreate>({
    mutationFn: (data: AIFeedbackCreate) =>
      aiFeedbackApi.submit(workspaceId!, data),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["ai-feedback", result.entity_type, result.entity_id],
        result,
      );
    },
  });
}

/**
 * Hook to delete feedback.
 */
export function useDeleteFeedback(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { feedbackId: string; entityType: string; entityId: string }>({
    mutationFn: ({ feedbackId }) => aiFeedbackApi.delete(workspaceId!, feedbackId),
    onSuccess: (_, { entityType, entityId }) => {
      queryClient.setQueryData(["ai-feedback", entityType, entityId], null);
    },
  });
}

/**
 * Hook to fetch AI benchmarking data (admin only).
 */
export function useAIBenchmarking(params?: { days?: number; group_by?: string }, enabled = true) {
  return useQuery<AIBenchmarkingResponse>({
    queryKey: ["ai-benchmarking", params],
    queryFn: () => aiBenchmarkingApi.getBenchmarking(params),
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

/**
 * Hook to list all AI feedback (admin review).
 */
export function useAIFeedbackList(
  params?: { entity_type?: string; page?: number; limit?: number },
  enabled = true,
) {
  return useQuery<PaginatedAIFeedback>({
    queryKey: ["ai-feedback-list", params],
    queryFn: () => aiBenchmarkingApi.listFeedback(params),
    enabled,
    staleTime: 30 * 1000,
  });
}
