"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  storiesApi,
  UserStory,
  UserStoryCreate,
  UserStoryUpdate,
  StoryStatus,
  StoryPriority,
} from "@/lib/api";

// List stories for a workspace
export function useStories(
  workspaceId: string | null,
  params?: {
    project_id?: string;
    epic_id?: string;
    release_id?: string;
    status?: StoryStatus;
    priority?: StoryPriority;
    assignee_id?: string;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: UserStory[]; total: number }>({
    queryKey: ["stories", workspaceId, params],
    queryFn: () => storiesApi.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: UserStoryCreate) => storiesApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (storyId: string) => storiesApi.delete(workspaceId!, storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories", workspaceId] });
    },
  });

  return {
    stories: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createStory: createMutation.mutateAsync,
    deleteStory: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Single story with full details
export function useStory(workspaceId: string | null, storyId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: story,
    isLoading,
    error,
    refetch,
  } = useQuery<UserStory>({
    queryKey: ["story", workspaceId, storyId],
    queryFn: () => storiesApi.get(workspaceId!, storyId!),
    enabled: !!workspaceId && !!storyId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UserStoryUpdate) => storiesApi.update(workspaceId!, storyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story", workspaceId, storyId] });
      queryClient.invalidateQueries({ queryKey: ["stories", workspaceId] });
    },
  });

  // Status transitions
  const markReadyMutation = useMutation({
    mutationFn: () => storiesApi.markReady(workspaceId!, storyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story", workspaceId, storyId] });
      queryClient.invalidateQueries({ queryKey: ["stories", workspaceId] });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => storiesApi.accept(workspaceId!, storyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story", workspaceId, storyId] });
      queryClient.invalidateQueries({ queryKey: ["stories", workspaceId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason?: string) => storiesApi.reject(workspaceId!, storyId!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story", workspaceId, storyId] });
      queryClient.invalidateQueries({ queryKey: ["stories", workspaceId] });
    },
  });

  // Acceptance criteria
  const updateCriterionMutation = useMutation({
    mutationFn: ({ criterionId, completed }: { criterionId: string; completed: boolean }) =>
      storiesApi.updateAcceptanceCriterion(workspaceId!, storyId!, criterionId, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story", workspaceId, storyId] });
    },
  });

  return {
    story,
    isLoading,
    error,
    refetch,
    updateStory: updateMutation.mutateAsync,
    markReady: markReadyMutation.mutateAsync,
    accept: acceptMutation.mutateAsync,
    reject: rejectMutation.mutateAsync,
    updateAcceptanceCriterion: updateCriterionMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isMarkingReady: markReadyMutation.isPending,
    isAccepting: acceptMutation.isPending,
    isRejecting: rejectMutation.isPending,
    isUpdatingCriterion: updateCriterionMutation.isPending,
  };
}

// Story tasks
export function useStoryTasks(workspaceId: string | null, storyId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: unknown[]; total: number }>({
    queryKey: ["storyTasks", workspaceId, storyId],
    queryFn: () => storiesApi.getTasks(workspaceId!, storyId!),
    enabled: !!workspaceId && !!storyId,
  });

  return {
    tasks: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
  };
}
