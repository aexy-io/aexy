"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  questionnairesApi,
  QuestionnaireResponse,
  QuestionnaireQuestion,
  QuestionnaireListResponse,
  QuestionnaireAnalyzeResult,
} from "@/lib/api";

// ============ Questionnaire List Hook ============

export function useQuestionnaires(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<QuestionnaireListResponse>({
    queryKey: ["questionnaires", workspaceId],
    queryFn: () => questionnairesApi.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => questionnairesApi.upload(workspaceId!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questionnaires", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (questionnaireId: string) =>
      questionnairesApi.delete(workspaceId!, questionnaireId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questionnaires", workspaceId] });
    },
  });

  return {
    questionnaires: data?.questionnaires || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    uploadQuestionnaire: uploadMutation.mutateAsync,
    deleteQuestionnaire: deleteMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    isDeleting: deleteMutation.isPending,
    uploadError: uploadMutation.error,
  };
}

// ============ Single Questionnaire Hook ============

export function useQuestionnaire(
  workspaceId: string | null,
  questionnaireId: string | null
) {
  const queryClient = useQueryClient();

  const {
    data: questionnaire,
    isLoading,
    error,
    refetch,
  } = useQuery<QuestionnaireResponse>({
    queryKey: ["questionnaire", workspaceId, questionnaireId],
    queryFn: () => questionnairesApi.get(workspaceId!, questionnaireId!),
    enabled: !!workspaceId && !!questionnaireId,
  });

  const {
    data: questions,
    isLoading: questionsLoading,
    refetch: refetchQuestions,
  } = useQuery<QuestionnaireQuestion[]>({
    queryKey: ["questionnaireQuestions", workspaceId, questionnaireId],
    queryFn: () => questionnairesApi.getQuestions(workspaceId!, questionnaireId!),
    enabled: !!workspaceId && !!questionnaireId,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => questionnairesApi.analyze(workspaceId!, questionnaireId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["questionnaire", workspaceId, questionnaireId],
      });
      queryClient.invalidateQueries({
        queryKey: ["reminderSuggestions", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["questionnaires", workspaceId],
      });
    },
  });

  return {
    questionnaire,
    questions: questions || [],
    isLoading,
    questionsLoading,
    error,
    refetch,
    refetchQuestions,
    analyzeQuestionnaire: analyzeMutation.mutateAsync,
    isAnalyzing: analyzeMutation.isPending,
    analyzeResult: analyzeMutation.data as QuestionnaireAnalyzeResult | undefined,
    analyzeError: analyzeMutation.error,
  };
}
