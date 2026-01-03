"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assessmentApi,
  Assessment,
  AssessmentSummary,
  AssessmentStatus,
  AssessmentTopic,
  AssessmentQuestion,
  AssessmentInvitation,
  AssessmentMetrics,
  WizardStatusResponse,
  TopicConfig,
  SkillConfig,
  ScheduleConfig,
  ProctoringSettings,
  SecuritySettings,
  CandidateFieldConfig,
  EmailTemplateConfig,
  TopicSuggestionResponse,
  CandidateImportResponse,
  PrePublishCheckResponse,
  PublishResponse,
  QuestionType,
  DifficultyLevel,
} from "@/lib/api";

// ==================== Assessment List Hook ====================

export function useAssessments(
  organizationId: string | null,
  options?: {
    status?: AssessmentStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: AssessmentSummary[]; total: number }>({
    queryKey: ["assessments", organizationId, options],
    queryFn: () => assessmentApi.list(organizationId!, options),
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; job_designation?: string }) =>
      assessmentApi.create({ ...data, organization_id: organizationId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments", organizationId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (assessmentId: string) =>
      assessmentApi.delete(assessmentId, organizationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments", organizationId] });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: ({ assessmentId, title }: { assessmentId: string; title?: string }) =>
      assessmentApi.clone(assessmentId, organizationId!, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments", organizationId] });
    },
  });

  return {
    assessments: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createAssessment: createMutation.mutateAsync,
    deleteAssessment: deleteMutation.mutateAsync,
    cloneAssessment: cloneMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isCloning: cloneMutation.isPending,
  };
}

// ==================== Single Assessment Hook ====================

export function useAssessment(assessmentId: string | null, organizationId?: string) {
  const queryClient = useQueryClient();

  const {
    data: assessment,
    isLoading,
    error,
    refetch,
  } = useQuery<Assessment>({
    queryKey: ["assessment", assessmentId],
    queryFn: () => assessmentApi.get(assessmentId!, organizationId),
    enabled: !!assessmentId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Assessment>) =>
      assessmentApi.update(assessmentId!, data, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
    },
  });

  return {
    assessment,
    isLoading,
    error,
    refetch,
    updateAssessment: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

// ==================== Wizard Hook ====================

export function useAssessmentWizard(assessmentId: string | null, organizationId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: wizardStatus,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useQuery<WizardStatusResponse>({
    queryKey: ["assessmentWizard", assessmentId],
    queryFn: () => assessmentApi.getWizardStatus(assessmentId!, organizationId!),
    enabled: !!assessmentId && !!organizationId,
  });

  const saveStep1Mutation = useMutation({
    mutationFn: (data: {
      title: string;
      job_designation: string;
      department?: string;
      experience_min: number;
      experience_max: number;
      include_freshers: boolean;
      skills: SkillConfig[];
      enable_skill_weights: boolean;
      description?: string;
    }) => assessmentApi.saveStep1(assessmentId!, organizationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessmentWizard", assessmentId] });
    },
  });

  const saveStep2Mutation = useMutation({
    mutationFn: (data: { topics: TopicConfig[]; enable_ai_generation?: boolean }) =>
      assessmentApi.saveStep2(assessmentId!, organizationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessmentWizard", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessmentTopics", assessmentId] });
    },
  });

  const saveStep3Mutation = useMutation({
    mutationFn: (data: {
      schedule: ScheduleConfig;
      proctoring_settings?: ProctoringSettings;
      security_settings?: SecuritySettings;
      candidate_fields?: CandidateFieldConfig;
      max_attempts?: number;
      passing_score_percent?: number;
    }) => assessmentApi.saveStep3(assessmentId!, organizationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessmentWizard", assessmentId] });
    },
  });

  const saveStep4Mutation = useMutation({
    mutationFn: (data: {
      candidates: Array<{ email: string; name: string; phone?: string; source?: string }>;
      email_template?: EmailTemplateConfig;
      send_immediately?: boolean;
    }) => assessmentApi.saveStep4(assessmentId!, organizationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessmentWizard", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessmentCandidates", assessmentId] });
    },
  });

  const saveStep5Mutation = useMutation({
    mutationFn: (data: { confirmed: boolean }) =>
      assessmentApi.saveStep5(assessmentId!, organizationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessmentWizard", assessmentId] });
    },
  });

  return {
    wizardStatus,
    isLoadingStatus,
    refetchStatus,
    saveStep1: saveStep1Mutation.mutateAsync,
    saveStep2: saveStep2Mutation.mutateAsync,
    saveStep3: saveStep3Mutation.mutateAsync,
    saveStep4: saveStep4Mutation.mutateAsync,
    saveStep5: saveStep5Mutation.mutateAsync,
    isSavingStep1: saveStep1Mutation.isPending,
    isSavingStep2: saveStep2Mutation.isPending,
    isSavingStep3: saveStep3Mutation.isPending,
    isSavingStep4: saveStep4Mutation.isPending,
    isSavingStep5: saveStep5Mutation.isPending,
    isSaving:
      saveStep1Mutation.isPending ||
      saveStep2Mutation.isPending ||
      saveStep3Mutation.isPending ||
      saveStep4Mutation.isPending ||
      saveStep5Mutation.isPending,
  };
}

// ==================== Topics Hook ====================

export function useAssessmentTopics(assessmentId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: topics,
    isLoading,
    error,
    refetch,
  } = useQuery<AssessmentTopic[]>({
    queryKey: ["assessmentTopics", assessmentId],
    queryFn: () => assessmentApi.listTopics(assessmentId!),
    enabled: !!assessmentId,
  });

  const suggestMutation = useMutation({
    mutationFn: (data: {
      skills: string[];
      job_designation: string;
      experience_level?: string;
      count?: number;
    }) => assessmentApi.suggestTopics(assessmentId!, data),
  });

  return {
    topics: topics || [],
    isLoading,
    error,
    refetch,
    suggestTopics: suggestMutation.mutateAsync,
    isSuggesting: suggestMutation.isPending,
    suggestedTopics: suggestMutation.data,
  };
}

// ==================== Questions Hook ====================

export function useAssessmentQuestions(assessmentId: string | null, topicId?: string) {
  const queryClient = useQueryClient();

  const {
    data: questions,
    isLoading,
    error,
    refetch,
  } = useQuery<AssessmentQuestion[]>({
    queryKey: ["assessmentQuestions", assessmentId, topicId],
    queryFn: () => assessmentApi.listQuestions(assessmentId!, topicId),
    enabled: !!assessmentId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<AssessmentQuestion>) =>
      assessmentApi.createQuestion(assessmentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessmentQuestions", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ questionId, data }: { questionId: string; data: Partial<AssessmentQuestion> }) =>
      assessmentApi.updateQuestion(assessmentId!, questionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessmentQuestions", assessmentId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (questionId: string) =>
      assessmentApi.deleteQuestion(assessmentId!, questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessmentQuestions", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: (data: {
      topic_id: string;
      question_type: QuestionType;
      difficulty?: DifficultyLevel;
      count?: number;
      context?: string;
    }) => assessmentApi.generateQuestions(assessmentId!, data),
  });

  return {
    questions: questions || [],
    isLoading,
    error,
    refetch,
    createQuestion: createMutation.mutateAsync,
    updateQuestion: updateMutation.mutateAsync,
    deleteQuestion: deleteMutation.mutateAsync,
    generateQuestions: generateMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isGenerating: generateMutation.isPending,
    generatedQuestions: generateMutation.data,
  };
}

// ==================== Candidates Hook ====================

export function useAssessmentCandidates(assessmentId: string | null, organizationId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: candidates,
    isLoading,
    error,
    refetch,
  } = useQuery<AssessmentInvitation[]>({
    queryKey: ["assessmentCandidates", assessmentId],
    queryFn: () => assessmentApi.listCandidates(assessmentId!),
    enabled: !!assessmentId,
  });

  const addMutation = useMutation({
    mutationFn: (data: {
      email: string;
      name: string;
      phone?: string;
      resume_url?: string;
      linkedin_url?: string;
      github_url?: string;
      source?: string;
    }) => assessmentApi.addCandidate(assessmentId!, organizationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessmentCandidates", assessmentId] });
    },
  });

  const importMutation = useMutation({
    mutationFn: (
      candidates: Array<{ email: string; name: string; phone?: string; source?: string }>
    ) => assessmentApi.importCandidates(assessmentId!, organizationId!, candidates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessmentCandidates", assessmentId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (candidateId: string) =>
      assessmentApi.removeCandidate(assessmentId!, candidateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessmentCandidates", assessmentId] });
    },
  });

  return {
    candidates: candidates || [],
    isLoading,
    error,
    refetch,
    addCandidate: addMutation.mutateAsync,
    importCandidates: importMutation.mutateAsync,
    removeCandidate: removeMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isImporting: importMutation.isPending,
    isRemoving: removeMutation.isPending,
    importResult: importMutation.data,
  };
}

// ==================== Publishing Hook ====================

export function useAssessmentPublish(assessmentId: string | null, organizationId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: publishCheck,
    isLoading: isChecking,
    refetch: recheckPublish,
  } = useQuery<PrePublishCheckResponse>({
    queryKey: ["assessmentPublishCheck", assessmentId],
    queryFn: () => assessmentApi.prePublishCheck(assessmentId!, organizationId!),
    enabled: !!assessmentId && !!organizationId,
  });

  const publishMutation = useMutation({
    mutationFn: (options?: { send_invitations?: boolean; schedule_override?: ScheduleConfig }) =>
      assessmentApi.publish(assessmentId!, organizationId!, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      queryClient.invalidateQueries({ queryKey: ["assessmentPublishCheck", assessmentId] });
    },
  });

  return {
    publishCheck,
    isChecking,
    recheckPublish,
    publish: publishMutation.mutateAsync,
    isPublishing: publishMutation.isPending,
    publishResult: publishMutation.data,
    publishError: publishMutation.error,
  };
}

// ==================== Metrics Hook ====================

export function useAssessmentMetrics(assessmentId: string | null) {
  const {
    data: metrics,
    isLoading,
    error,
    refetch,
  } = useQuery<AssessmentMetrics>({
    queryKey: ["assessmentMetrics", assessmentId],
    queryFn: () => assessmentApi.getMetrics(assessmentId!),
    enabled: !!assessmentId,
  });

  return {
    metrics,
    isLoading,
    error,
    refetch,
  };
}

export function useOrganizationAssessmentMetrics(organizationId: string | null) {
  const {
    data: metrics,
    isLoading,
    error,
    refetch,
  } = useQuery<{
    total_candidates: number;
    total_tests: number;
    unique_attempts: number;
    attempt_rate: number;
  }>({
    queryKey: ["organizationAssessmentMetrics", organizationId],
    queryFn: () => assessmentApi.getOrganizationMetrics(organizationId!),
    enabled: !!organizationId,
  });

  return {
    metrics,
    isLoading,
    error,
    refetch,
  };
}

// ==================== Email Template Hook ====================

export function useEmailTemplate(assessmentId: string | null, organizationId?: string) {
  const queryClient = useQueryClient();

  const {
    data: emailTemplate,
    isLoading,
    error,
    refetch,
  } = useQuery<EmailTemplateConfig>({
    queryKey: ["assessmentEmailTemplate", assessmentId],
    queryFn: () => assessmentApi.getEmailTemplate(assessmentId!, organizationId),
    enabled: !!assessmentId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: EmailTemplateConfig) =>
      assessmentApi.updateEmailTemplate(assessmentId!, data, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessmentEmailTemplate", assessmentId] });
    },
  });

  return {
    emailTemplate,
    isLoading,
    error,
    refetch,
    updateEmailTemplate: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
