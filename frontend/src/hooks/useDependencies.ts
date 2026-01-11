"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  dependenciesApi,
  StoryDependency,
  TaskDependency,
  DependencyCreate,
  DependencyType,
  DependencyGraphNode,
  DependencyGraphEdge,
  BlockedItem,
} from "@/lib/api";

// Story dependencies
export function useStoryDependencies(
  storyId: string | null,
  params?: {
    direction?: "all" | "blocking" | "blocked_by";
    include_resolved?: boolean;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: StoryDependency[]; total: number }>({
    queryKey: ["storyDependencies", storyId, params],
    queryFn: () => dependenciesApi.listStoryDependencies(storyId!, params),
    enabled: !!storyId,
  });

  const createMutation = useMutation({
    mutationFn: (data: DependencyCreate) => dependenciesApi.createStoryDependency(storyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storyDependencies", storyId] });
      queryClient.invalidateQueries({ queryKey: ["dependencyGraph"] });
      queryClient.invalidateQueries({ queryKey: ["blockedItems"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (dependencyId: string) => dependenciesApi.deleteStoryDependency(dependencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storyDependencies", storyId] });
      queryClient.invalidateQueries({ queryKey: ["dependencyGraph"] });
      queryClient.invalidateQueries({ queryKey: ["blockedItems"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (dependencyId: string) => dependenciesApi.resolveStoryDependency(dependencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storyDependencies", storyId] });
      queryClient.invalidateQueries({ queryKey: ["dependencyGraph"] });
      queryClient.invalidateQueries({ queryKey: ["blockedItems"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      dependencyId,
      data,
    }: {
      dependencyId: string;
      data: { dependency_type?: DependencyType; description?: string };
    }) => dependenciesApi.updateStoryDependency(dependencyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storyDependencies", storyId] });
    },
  });

  return {
    dependencies: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createDependency: createMutation.mutateAsync,
    deleteDependency: deleteMutation.mutateAsync,
    resolveDependency: resolveMutation.mutateAsync,
    updateDependency: updateMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isResolving: resolveMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

// Task dependencies
export function useTaskDependencies(
  taskId: string | null,
  params?: {
    direction?: "all" | "blocking" | "blocked_by";
    include_resolved?: boolean;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: TaskDependency[]; total: number }>({
    queryKey: ["taskDependencies", taskId, params],
    queryFn: () => dependenciesApi.listTaskDependencies(taskId!, params),
    enabled: !!taskId,
  });

  const createMutation = useMutation({
    mutationFn: (data: DependencyCreate) => dependenciesApi.createTaskDependency(taskId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskDependencies", taskId] });
      queryClient.invalidateQueries({ queryKey: ["dependencyGraph"] });
      queryClient.invalidateQueries({ queryKey: ["blockedItems"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (dependencyId: string) => dependenciesApi.deleteTaskDependency(dependencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskDependencies", taskId] });
      queryClient.invalidateQueries({ queryKey: ["dependencyGraph"] });
      queryClient.invalidateQueries({ queryKey: ["blockedItems"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (dependencyId: string) => dependenciesApi.resolveTaskDependency(dependencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskDependencies", taskId] });
      queryClient.invalidateQueries({ queryKey: ["dependencyGraph"] });
      queryClient.invalidateQueries({ queryKey: ["blockedItems"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      dependencyId,
      data,
    }: {
      dependencyId: string;
      data: { dependency_type?: DependencyType; description?: string };
    }) => dependenciesApi.updateTaskDependency(dependencyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskDependencies", taskId] });
    },
  });

  return {
    dependencies: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createDependency: createMutation.mutateAsync,
    deleteDependency: deleteMutation.mutateAsync,
    resolveDependency: resolveMutation.mutateAsync,
    updateDependency: updateMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isResolving: resolveMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

// Dependency graph for visualization
export function useDependencyGraph(
  workspaceId: string | null,
  params?: {
    entity_type?: "stories" | "tasks" | "all";
    include_resolved?: boolean;
  }
) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ nodes: DependencyGraphNode[]; edges: DependencyGraphEdge[] }>({
    queryKey: ["dependencyGraph", workspaceId, params],
    queryFn: () => dependenciesApi.getGraph(workspaceId!, params),
    enabled: !!workspaceId,
  });

  return {
    nodes: data?.nodes || [],
    edges: data?.edges || [],
    isLoading,
    error,
    refetch,
  };
}

// Blocked items
export function useBlockedItems(workspaceId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{
    blocked_stories: BlockedItem[];
    blocked_tasks: BlockedItem[];
    total_blocked: number;
  }>({
    queryKey: ["blockedItems", workspaceId],
    queryFn: () => dependenciesApi.getBlockedItems(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    blockedStories: data?.blocked_stories || [],
    blockedTasks: data?.blocked_tasks || [],
    totalBlocked: data?.total_blocked || 0,
    isLoading,
    error,
    refetch,
  };
}
