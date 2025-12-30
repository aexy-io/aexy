"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  epicApi,
  Epic,
  EpicListItem,
  EpicDetail,
  EpicTimeline,
  EpicProgress,
  EpicBurndown,
  EpicStatus,
  EpicPriority,
} from "@/lib/api";

// List epics for a workspace
export function useEpics(
  workspaceId: string | null,
  options?: {
    status?: EpicStatus;
    owner_id?: string;
    priority?: EpicPriority;
    include_archived?: boolean;
    search?: string;
  }
) {
  const queryClient = useQueryClient();

  const {
    data: epics,
    isLoading,
    error,
    refetch,
  } = useQuery<EpicListItem[]>({
    queryKey: ["epics", workspaceId, options],
    queryFn: () => epicApi.list(workspaceId!, options),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof epicApi.create>[1]) =>
      epicApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epics", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (epicId: string) => epicApi.delete(workspaceId!, epicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epics", workspaceId] });
    },
  });

  return {
    epics: epics || [],
    isLoading,
    error,
    refetch,
    createEpic: createMutation.mutateAsync,
    deleteEpic: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Single epic with full details
export function useEpic(workspaceId: string | null, epicId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: epic,
    isLoading,
    error,
    refetch,
  } = useQuery<Epic>({
    queryKey: ["epic", workspaceId, epicId],
    queryFn: () => epicApi.get(workspaceId!, epicId!),
    enabled: !!workspaceId && !!epicId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof epicApi.update>[2]) =>
      epicApi.update(workspaceId!, epicId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epic", workspaceId, epicId] });
      queryClient.invalidateQueries({ queryKey: ["epics", workspaceId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => epicApi.archive(workspaceId!, epicId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epic", workspaceId, epicId] });
      queryClient.invalidateQueries({ queryKey: ["epics", workspaceId] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => epicApi.unarchive(workspaceId!, epicId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epic", workspaceId, epicId] });
      queryClient.invalidateQueries({ queryKey: ["epics", workspaceId] });
    },
  });

  return {
    epic,
    isLoading,
    error,
    refetch,
    updateEpic: updateMutation.mutateAsync,
    archiveEpic: archiveMutation.mutateAsync,
    unarchiveEpic: unarchiveMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
  };
}

// Epic detail with breakdown
export function useEpicDetail(workspaceId: string | null, epicId: string | null) {
  const {
    data: epicDetail,
    isLoading,
    error,
    refetch,
  } = useQuery<EpicDetail>({
    queryKey: ["epicDetail", workspaceId, epicId],
    queryFn: () => epicApi.getDetail(workspaceId!, epicId!),
    enabled: !!workspaceId && !!epicId,
  });

  return {
    epicDetail,
    isLoading,
    error,
    refetch,
  };
}

// Epic task management
export function useEpicTasks(workspaceId: string | null, epicId: string | null) {
  const queryClient = useQueryClient();

  const addTasksMutation = useMutation({
    mutationFn: (taskIds: string[]) => epicApi.addTasks(workspaceId!, epicId!, taskIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epic", workspaceId, epicId] });
      queryClient.invalidateQueries({ queryKey: ["epicDetail", workspaceId, epicId] });
      queryClient.invalidateQueries({ queryKey: ["epicProgress", workspaceId, epicId] });
    },
  });

  const removeTaskMutation = useMutation({
    mutationFn: (taskId: string) => epicApi.removeTask(workspaceId!, epicId!, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epic", workspaceId, epicId] });
      queryClient.invalidateQueries({ queryKey: ["epicDetail", workspaceId, epicId] });
      queryClient.invalidateQueries({ queryKey: ["epicProgress", workspaceId, epicId] });
    },
  });

  return {
    addTasks: addTasksMutation.mutateAsync,
    removeTask: removeTaskMutation.mutateAsync,
    isAddingTasks: addTasksMutation.isPending,
    isRemovingTask: removeTaskMutation.isPending,
  };
}

// Epic timeline
export function useEpicTimeline(workspaceId: string | null, epicId: string | null) {
  const {
    data: timeline,
    isLoading,
    error,
    refetch,
  } = useQuery<EpicTimeline>({
    queryKey: ["epicTimeline", workspaceId, epicId],
    queryFn: () => epicApi.getTimeline(workspaceId!, epicId!),
    enabled: !!workspaceId && !!epicId,
  });

  return {
    timeline,
    isLoading,
    error,
    refetch,
  };
}

// Epic progress
export function useEpicProgress(workspaceId: string | null, epicId: string | null) {
  const {
    data: progress,
    isLoading,
    error,
    refetch,
  } = useQuery<EpicProgress>({
    queryKey: ["epicProgress", workspaceId, epicId],
    queryFn: () => epicApi.getProgress(workspaceId!, epicId!),
    enabled: !!workspaceId && !!epicId,
  });

  return {
    progress,
    isLoading,
    error,
    refetch,
  };
}

// Epic burndown
export function useEpicBurndown(workspaceId: string | null, epicId: string | null) {
  const {
    data: burndown,
    isLoading,
    error,
    refetch,
  } = useQuery<EpicBurndown>({
    queryKey: ["epicBurndown", workspaceId, epicId],
    queryFn: () => epicApi.getBurndown(workspaceId!, epicId!),
    enabled: !!workspaceId && !!epicId,
  });

  return {
    burndown,
    isLoading,
    error,
    refetch,
  };
}
