"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  sprintApi,
  Sprint,
  SprintListItem,
  SprintTask,
  SprintStats,
  BurndownData,
  VelocityTrend,
  AssignmentSuggestion,
  CapacityAnalysis,
  CompletionPrediction,
  SprintRetrospective,
  TaskStatus,
  TaskSourceType,
  TaskActivity,
  TaskActivityList,
} from "@/lib/api";

// List sprints for a team
export function useSprints(workspaceId: string | null, teamId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: sprints,
    isLoading,
    error,
    refetch,
  } = useQuery<SprintListItem[]>({
    queryKey: ["sprints", workspaceId, teamId],
    queryFn: () => sprintApi.list(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof sprintApi.create>[2]) =>
      sprintApi.create(workspaceId!, teamId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprints", workspaceId, teamId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sprintId: string) => sprintApi.delete(workspaceId!, teamId!, sprintId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprints", workspaceId, teamId] });
    },
  });

  return {
    sprints: sprints || [],
    isLoading,
    error,
    refetch,
    createSprint: createMutation.mutateAsync,
    deleteSprint: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Get active sprint for a team
export function useActiveSprint(workspaceId: string | null, teamId: string | null) {
  const {
    data: sprint,
    isLoading,
    error,
    refetch,
  } = useQuery<Sprint | null>({
    queryKey: ["activeSprint", workspaceId, teamId],
    queryFn: () => sprintApi.getActive(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
  });

  return {
    sprint,
    isLoading,
    error,
    refetch,
  };
}

// Single sprint with full details
export function useSprint(workspaceId: string | null, teamId: string | null, sprintId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: sprint,
    isLoading,
    error,
    refetch,
  } = useQuery<Sprint>({
    queryKey: ["sprint", workspaceId, teamId, sprintId],
    queryFn: () => sprintApi.get(workspaceId!, teamId!, sprintId!),
    enabled: !!workspaceId && !!teamId && !!sprintId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof sprintApi.update>[3]) =>
      sprintApi.update(workspaceId!, teamId!, sprintId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprint", workspaceId, teamId, sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprints", workspaceId, teamId] });
    },
  });

  // Lifecycle mutations
  const startMutation = useMutation({
    mutationFn: () => sprintApi.start(workspaceId!, teamId!, sprintId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprint", workspaceId, teamId, sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprints", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["activeSprint", workspaceId, teamId] });
    },
  });

  const startReviewMutation = useMutation({
    mutationFn: () => sprintApi.startReview(workspaceId!, teamId!, sprintId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprint", workspaceId, teamId, sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprints", workspaceId, teamId] });
    },
  });

  const startRetroMutation = useMutation({
    mutationFn: () => sprintApi.startRetrospective(workspaceId!, teamId!, sprintId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprint", workspaceId, teamId, sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprints", workspaceId, teamId] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      sprintApi.complete(workspaceId!, teamId!, sprintId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprint", workspaceId, teamId, sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprints", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["activeSprint", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teamVelocity", teamId] });
    },
  });

  return {
    sprint,
    isLoading,
    error,
    refetch,
    updateSprint: updateMutation.mutateAsync,
    startSprint: startMutation.mutateAsync,
    startReview: startReviewMutation.mutateAsync,
    startRetrospective: startRetroMutation.mutateAsync,
    completeSprint: completeMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isStarting: startMutation.isPending,
    isStartingReview: startReviewMutation.isPending,
    isStartingRetro: startRetroMutation.isPending,
    isCompleting: completeMutation.isPending,
  };
}

// Sprint stats
export function useSprintStats(workspaceId: string | null, teamId: string | null, sprintId: string | null) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery<SprintStats>({
    queryKey: ["sprintStats", workspaceId, teamId, sprintId],
    queryFn: () => sprintApi.getStats(workspaceId!, teamId!, sprintId!),
    enabled: !!workspaceId && !!teamId && !!sprintId,
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

// Sprint tasks
export function useSprintTasks(sprintId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: tasks,
    isLoading,
    error,
    refetch,
  } = useQuery<SprintTask[]>({
    queryKey: ["sprintTasks", sprintId],
    queryFn: () => sprintApi.getTasks(sprintId!),
    enabled: !!sprintId,
  });

  const addTaskMutation = useMutation({
    mutationFn: (data: Parameters<typeof sprintApi.addTask>[1]) =>
      sprintApi.addTask(sprintId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Parameters<typeof sprintApi.updateTask>[2] }) =>
      sprintApi.updateTask(sprintId!, taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => sprintApi.removeTask(sprintId!, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      sprintApi.updateTaskStatus(sprintId!, taskId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
      queryClient.invalidateQueries({ queryKey: ["burndown", sprintId] });
    },
  });

  const assignTaskMutation = useMutation({
    mutationFn: ({
      taskId,
      developerId,
      reason,
      confidence,
    }: {
      taskId: string;
      developerId: string;
      reason?: string;
      confidence?: number;
    }) => sprintApi.assignTask(sprintId!, taskId, developerId, reason, confidence),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
    },
  });

  const unassignTaskMutation = useMutation({
    mutationFn: (taskId: string) => sprintApi.unassignTask(sprintId!, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: (
      assignments: Array<{
        task_id: string;
        developer_id: string;
        reason?: string;
        confidence?: number;
      }>
    ) => sprintApi.bulkAssignTasks(sprintId!, assignments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
    },
  });

  const importTasksMutation = useMutation({
    mutationFn: ({ source, config }: { source: TaskSourceType; config: Parameters<typeof sprintApi.importTasks>[2] }) =>
      sprintApi.importTasks(sprintId!, source, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
    },
  });

  return {
    tasks: tasks || [],
    isLoading,
    error,
    refetch,
    addTask: addTaskMutation.mutateAsync,
    updateTask: updateTaskMutation.mutateAsync,
    deleteTask: deleteTaskMutation.mutateAsync,
    updateTaskStatus: updateStatusMutation.mutateAsync,
    assignTask: assignTaskMutation.mutateAsync,
    unassignTask: unassignTaskMutation.mutateAsync,
    bulkAssign: bulkAssignMutation.mutateAsync,
    importTasks: importTasksMutation.mutateAsync,
    isAddingTask: addTaskMutation.isPending,
    isUpdatingTask: updateTaskMutation.isPending,
    isDeletingTask: deleteTaskMutation.isPending,
    isUpdatingStatus: updateStatusMutation.isPending,
    isAssigning: assignTaskMutation.isPending,
    isUnassigning: unassignTaskMutation.isPending,
    isBulkAssigning: bulkAssignMutation.isPending,
    isImporting: importTasksMutation.isPending,
  };
}

// Task Activities
export function useTaskActivities(sprintId: string | null, taskId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: activityData,
    isLoading,
    error,
    refetch,
  } = useQuery<TaskActivityList>({
    queryKey: ["taskActivities", sprintId, taskId],
    queryFn: () => sprintApi.getTaskActivities(sprintId!, taskId!),
    enabled: !!sprintId && !!taskId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (comment: string) => sprintApi.addTaskComment(sprintId!, taskId!, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskActivities", sprintId, taskId] });
    },
  });

  return {
    activities: activityData?.activities || [],
    total: activityData?.total || 0,
    isLoading,
    error,
    refetch,
    addComment: addCommentMutation.mutateAsync,
    isAddingComment: addCommentMutation.isPending,
  };
}

// AI-powered features
export function useSprintAI(sprintId: string | null) {
  const queryClient = useQueryClient();

  const suggestAssignmentsMutation = useMutation({
    mutationFn: () => sprintApi.getSuggestions(sprintId!),
  });

  const optimizeMutation = useMutation({
    mutationFn: () => sprintApi.optimize(sprintId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprintTasks", sprintId] });
    },
  });

  const {
    data: capacity,
    isLoading: isLoadingCapacity,
    refetch: refetchCapacity,
  } = useQuery<CapacityAnalysis>({
    queryKey: ["sprintCapacity", sprintId],
    queryFn: () => sprintApi.getCapacity(sprintId!),
    enabled: !!sprintId,
  });

  const {
    data: prediction,
    isLoading: isLoadingPrediction,
    refetch: refetchPrediction,
  } = useQuery<CompletionPrediction>({
    queryKey: ["sprintPrediction", sprintId],
    queryFn: () => sprintApi.getPrediction(sprintId!),
    enabled: !!sprintId,
  });

  return {
    suggestAssignments: suggestAssignmentsMutation.mutateAsync,
    optimizeSprint: optimizeMutation.mutateAsync,
    isSuggesting: suggestAssignmentsMutation.isPending,
    isOptimizing: optimizeMutation.isPending,
    suggestions: suggestAssignmentsMutation.data as AssignmentSuggestion[] | undefined,
    optimization: optimizeMutation.data,
    capacity,
    isLoadingCapacity,
    refetchCapacity,
    prediction,
    isLoadingPrediction,
    refetchPrediction,
  };
}

// Analytics
export function useSprintBurndown(sprintId: string | null) {
  const {
    data: burndown,
    isLoading,
    error,
    refetch,
  } = useQuery<BurndownData>({
    queryKey: ["burndown", sprintId],
    queryFn: () => sprintApi.getBurndown(sprintId!),
    enabled: !!sprintId,
  });

  return {
    burndown,
    isLoading,
    error,
    refetch,
  };
}

export function useTeamVelocity(teamId: string | null, numSprints: number = 6) {
  const {
    data: velocity,
    isLoading,
    error,
    refetch,
  } = useQuery<VelocityTrend>({
    queryKey: ["teamVelocity", teamId, numSprints],
    queryFn: () => sprintApi.getVelocity(teamId!, numSprints),
    enabled: !!teamId,
  });

  return {
    velocity,
    isLoading,
    error,
    refetch,
  };
}

export function useTeamCarryOver(teamId: string | null) {
  const {
    data: carryOver,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["teamCarryOver", teamId],
    queryFn: () => sprintApi.getCarryOver(teamId!),
    enabled: !!teamId,
  });

  return {
    carryOver,
    isLoading,
    error,
    refetch,
  };
}

export function useTeamHealth(teamId: string | null) {
  const {
    data: health,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["teamHealth", teamId],
    queryFn: () => sprintApi.getTeamHealth(teamId!),
    enabled: !!teamId,
  });

  return {
    health,
    isLoading,
    error,
    refetch,
  };
}

// Retrospective
export function useSprintRetrospective(sprintId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: retrospective,
    isLoading,
    error,
    refetch,
  } = useQuery<SprintRetrospective | null>({
    queryKey: ["retrospective", sprintId],
    queryFn: () => sprintApi.getRetrospective(sprintId!),
    enabled: !!sprintId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof sprintApi.saveRetrospective>[1]) =>
      sprintApi.saveRetrospective(sprintId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["retrospective", sprintId] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (data: {
      category: "went_well" | "to_improve" | "action_item";
      content: string;
      assignee_id?: string;
      due_date?: string;
    }) => sprintApi.addRetroItem(sprintId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["retrospective", sprintId] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: string;
      data: {
        content?: string;
        status?: "pending" | "in_progress" | "done";
        assignee_id?: string;
        due_date?: string;
      };
    }) => sprintApi.updateRetroItem(sprintId!, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["retrospective", sprintId] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => sprintApi.deleteRetroItem(sprintId!, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["retrospective", sprintId] });
    },
  });

  const voteItemMutation = useMutation({
    mutationFn: (itemId: string) => sprintApi.voteRetroItem(sprintId!, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["retrospective", sprintId] });
    },
  });

  return {
    retrospective,
    isLoading,
    error,
    refetch,
    saveRetrospective: saveMutation.mutateAsync,
    addItem: addItemMutation.mutateAsync,
    updateItem: updateItemMutation.mutateAsync,
    deleteItem: deleteItemMutation.mutateAsync,
    voteItem: voteItemMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isAddingItem: addItemMutation.isPending,
    isUpdatingItem: updateItemMutation.isPending,
    isDeletingItem: deleteItemMutation.isPending,
    isVoting: voteItemMutation.isPending,
  };
}
