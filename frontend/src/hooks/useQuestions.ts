"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  questionsApi,
  QuestionListItem,
  QuestionListResponse,
  QuestionDetail,
  QuestionAnalytics,
  QuestionSubmissionItem,
  QuestionSubmissionsResponse,
  QuestionListFilters,
  QuestionCreateRequest,
  QuestionUpdateRequest,
  DeleteQuestionResponse,
  BulkDeleteResponse,
} from "@/lib/api";

// ==================== Questions List Hook ====================

export function useQuestions(filters: QuestionListFilters) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<QuestionListResponse>({
    queryKey: ["questions", filters],
    queryFn: () => questionsApi.list(filters),
    enabled: !!filters.organization_id,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ questionId, force, softDelete }: { questionId: string; force?: boolean; softDelete?: boolean }) =>
      questionsApi.delete(questionId, { force, soft_delete: softDelete }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ questionIds, force, softDelete }: { questionIds: string[]; force?: boolean; softDelete?: boolean }) =>
      questionsApi.bulkDelete(questionIds, { force, soft_delete: softDelete }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (questionId: string) => questionsApi.restore(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ questionId, targetAssessmentId, targetTopicId }: {
      questionId: string;
      targetAssessmentId?: string;
      targetTopicId?: string
    }) => questionsApi.duplicate(questionId, { target_assessment_id: targetAssessmentId, target_topic_id: targetTopicId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  return {
    questions: data?.questions || [],
    total: data?.total || 0,
    page: data?.page || 1,
    perPage: data?.per_page || 20,
    totalPages: data?.total_pages || 0,
    isLoading,
    error,
    refetch,
    deleteQuestion: deleteMutation.mutateAsync,
    bulkDeleteQuestions: bulkDeleteMutation.mutateAsync,
    restoreQuestion: restoreMutation.mutateAsync,
    duplicateQuestion: duplicateMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isRestoring: restoreMutation.isPending,
    isDuplicating: duplicateMutation.isPending,
  };
}

// ==================== Single Question Hook ====================

export function useQuestion(questionId: string | null, includeAnalytics = true) {
  const queryClient = useQueryClient();

  const {
    data: question,
    isLoading,
    error,
    refetch,
  } = useQuery<QuestionDetail>({
    queryKey: ["question", questionId, includeAnalytics],
    queryFn: () => questionsApi.get(questionId!, includeAnalytics),
    enabled: !!questionId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: QuestionUpdateRequest) => questionsApi.update(questionId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (options?: { force?: boolean; softDelete?: boolean }) =>
      questionsApi.delete(questionId!, { force: options?.force, soft_delete: options?.softDelete }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => questionsApi.restore(questionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  const recalculateAnalyticsMutation = useMutation({
    mutationFn: () => questionsApi.recalculateAnalytics(questionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
    },
  });

  return {
    question,
    isLoading,
    error,
    refetch,
    updateQuestion: updateMutation.mutateAsync,
    deleteQuestion: deleteMutation.mutateAsync,
    restoreQuestion: restoreMutation.mutateAsync,
    recalculateAnalytics: recalculateAnalyticsMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isRestoring: restoreMutation.isPending,
    isRecalculating: recalculateAnalyticsMutation.isPending,
  };
}

// ==================== Question Submissions Hook ====================

export function useQuestionSubmissions(
  questionId: string | null,
  options?: {
    candidate_id?: string;
    candidate_email?: string;
    status?: "evaluated" | "pending";
    min_score?: number;
    max_score?: number;
    page?: number;
    per_page?: number;
  }
) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<QuestionSubmissionsResponse>({
    queryKey: ["questionSubmissions", questionId, options],
    queryFn: () => questionsApi.getSubmissions(questionId!, options),
    enabled: !!questionId,
  });

  return {
    submissions: data?.submissions || [],
    total: data?.total || 0,
    page: data?.page || 1,
    perPage: data?.per_page || 20,
    totalPages: data?.total_pages || 0,
    isLoading,
    error,
    refetch,
  };
}

// ==================== Create Question Hook ====================

export function useCreateQuestion() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: QuestionCreateRequest) => questionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  return {
    createQuestion: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}
