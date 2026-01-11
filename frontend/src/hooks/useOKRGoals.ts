"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  okrGoalsApi,
  OKRGoal,
  OKRGoalCreate,
  OKRGoalUpdate,
  OKRProgressUpdate,
  OKRGoalType,
  OKRGoalStatus,
  OKRPeriodType,
} from "@/lib/api";

// List OKR goals for a workspace
export function useOKRGoals(
  workspaceId: string | null,
  params?: {
    goal_type?: OKRGoalType;
    status?: OKRGoalStatus;
    owner_id?: string;
    parent_goal_id?: string;
    period_type?: OKRPeriodType;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: OKRGoal[]; total: number }>({
    queryKey: ["okrGoals", workspaceId, params],
    queryFn: () => okrGoalsApi.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: OKRGoalCreate) => okrGoalsApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoals", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["okrDashboard", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (goalId: string) => okrGoalsApi.delete(workspaceId!, goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoals", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["okrDashboard", workspaceId] });
    },
  });

  return {
    goals: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createGoal: createMutation.mutateAsync,
    deleteGoal: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Single OKR goal with full details
export function useOKRGoal(workspaceId: string | null, goalId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: goal,
    isLoading,
    error,
    refetch,
  } = useQuery<OKRGoal>({
    queryKey: ["okrGoal", workspaceId, goalId],
    queryFn: () => okrGoalsApi.get(workspaceId!, goalId!),
    enabled: !!workspaceId && !!goalId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: OKRGoalUpdate) => okrGoalsApi.update(workspaceId!, goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoal", workspaceId, goalId] });
      queryClient.invalidateQueries({ queryKey: ["okrGoals", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["okrDashboard", workspaceId] });
    },
  });

  const updateProgressMutation = useMutation({
    mutationFn: (data: OKRProgressUpdate) => okrGoalsApi.updateProgress(workspaceId!, goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoal", workspaceId, goalId] });
      queryClient.invalidateQueries({ queryKey: ["okrGoals", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["okrDashboard", workspaceId] });
    },
  });

  // Key results
  const addKeyResultMutation = useMutation({
    mutationFn: (data: OKRGoalCreate) => okrGoalsApi.addKeyResult(workspaceId!, goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoal", workspaceId, goalId] });
      queryClient.invalidateQueries({ queryKey: ["okrKeyResults", workspaceId, goalId] });
      queryClient.invalidateQueries({ queryKey: ["okrDashboard", workspaceId] });
    },
  });

  // Linking
  const linkEpicMutation = useMutation({
    mutationFn: (epicId: string) => okrGoalsApi.linkEpic(workspaceId!, goalId!, epicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoal", workspaceId, goalId] });
    },
  });

  const unlinkEpicMutation = useMutation({
    mutationFn: (epicId: string) => okrGoalsApi.unlinkEpic(workspaceId!, goalId!, epicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoal", workspaceId, goalId] });
    },
  });

  const linkProjectMutation = useMutation({
    mutationFn: (projectId: string) => okrGoalsApi.linkProject(workspaceId!, goalId!, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoal", workspaceId, goalId] });
    },
  });

  const unlinkProjectMutation = useMutation({
    mutationFn: (projectId: string) => okrGoalsApi.unlinkProject(workspaceId!, goalId!, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["okrGoal", workspaceId, goalId] });
    },
  });

  return {
    goal,
    isLoading,
    error,
    refetch,
    updateGoal: updateMutation.mutateAsync,
    updateProgress: updateProgressMutation.mutateAsync,
    addKeyResult: addKeyResultMutation.mutateAsync,
    linkEpic: linkEpicMutation.mutateAsync,
    unlinkEpic: unlinkEpicMutation.mutateAsync,
    linkProject: linkProjectMutation.mutateAsync,
    unlinkProject: unlinkProjectMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isUpdatingProgress: updateProgressMutation.isPending,
    isAddingKeyResult: addKeyResultMutation.isPending,
    isLinkingEpic: linkEpicMutation.isPending,
    isUnlinkingEpic: unlinkEpicMutation.isPending,
    isLinkingProject: linkProjectMutation.isPending,
    isUnlinkingProject: unlinkProjectMutation.isPending,
  };
}

// Key results for a goal
export function useOKRKeyResults(workspaceId: string | null, goalId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: OKRGoal[]; total: number }>({
    queryKey: ["okrKeyResults", workspaceId, goalId],
    queryFn: () => okrGoalsApi.getKeyResults(workspaceId!, goalId!),
    enabled: !!workspaceId && !!goalId,
  });

  return {
    keyResults: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
  };
}

// OKR Dashboard
export function useOKRDashboard(workspaceId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{
    objectives: OKRGoal[];
    summary: {
      total_objectives: number;
      on_track: number;
      at_risk: number;
      behind: number;
      achieved: number;
      average_progress: number;
    };
  }>({
    queryKey: ["okrDashboard", workspaceId],
    queryFn: () => okrGoalsApi.getDashboard(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    objectives: data?.objectives || [],
    summary: data?.summary || {
      total_objectives: 0,
      on_track: 0,
      at_risk: 0,
      behind: 0,
      achieved: 0,
      average_progress: 0,
    },
    isLoading,
    error,
    refetch,
  };
}
