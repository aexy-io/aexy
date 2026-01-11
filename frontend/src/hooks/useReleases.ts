"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  releasesApi,
  Release,
  ReleaseCreate,
  ReleaseUpdate,
  ReleaseStatus,
  UserStory,
} from "@/lib/api";

// List releases for a workspace
export function useReleases(
  workspaceId: string | null,
  params?: {
    project_id?: string;
    status?: ReleaseStatus;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: Release[]; total: number }>({
    queryKey: ["releases", workspaceId, params],
    queryFn: () => releasesApi.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: ReleaseCreate) => releasesApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["releases", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (releaseId: string) => releasesApi.delete(workspaceId!, releaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["releases", workspaceId] });
    },
  });

  return {
    releases: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createRelease: createMutation.mutateAsync,
    deleteRelease: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Single release with full details
export function useRelease(workspaceId: string | null, releaseId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: release,
    isLoading,
    error,
    refetch,
  } = useQuery<Release>({
    queryKey: ["release", workspaceId, releaseId],
    queryFn: () => releasesApi.get(workspaceId!, releaseId!),
    enabled: !!workspaceId && !!releaseId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: ReleaseUpdate) => releasesApi.update(workspaceId!, releaseId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["release", workspaceId, releaseId] });
      queryClient.invalidateQueries({ queryKey: ["releases", workspaceId] });
    },
  });

  // Lifecycle actions
  const freezeMutation = useMutation({
    mutationFn: () => releasesApi.freeze(workspaceId!, releaseId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["release", workspaceId, releaseId] });
      queryClient.invalidateQueries({ queryKey: ["releases", workspaceId] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (releaseNotes?: string) => releasesApi.publish(workspaceId!, releaseId!, releaseNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["release", workspaceId, releaseId] });
      queryClient.invalidateQueries({ queryKey: ["releases", workspaceId] });
    },
  });

  // Checklist
  const updateChecklistMutation = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      releasesApi.updateChecklistItem(workspaceId!, releaseId!, itemId, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["release", workspaceId, releaseId] });
      queryClient.invalidateQueries({ queryKey: ["releaseReadiness", workspaceId, releaseId] });
    },
  });

  return {
    release,
    isLoading,
    error,
    refetch,
    updateRelease: updateMutation.mutateAsync,
    freeze: freezeMutation.mutateAsync,
    publish: publishMutation.mutateAsync,
    updateChecklistItem: updateChecklistMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isFreezing: freezeMutation.isPending,
    isPublishing: publishMutation.isPending,
    isUpdatingChecklist: updateChecklistMutation.isPending,
  };
}

// Release readiness
export function useReleaseReadiness(workspaceId: string | null, releaseId: string | null) {
  const {
    data: readiness,
    isLoading,
    error,
    refetch,
  } = useQuery<{
    total_items: number;
    completed_items: number;
    required_items: number;
    required_completed: number;
    is_ready: boolean;
    readiness_percentage: number;
  }>({
    queryKey: ["releaseReadiness", workspaceId, releaseId],
    queryFn: () => releasesApi.getReadiness(workspaceId!, releaseId!),
    enabled: !!workspaceId && !!releaseId,
  });

  return {
    readiness,
    isLoading,
    error,
    refetch,
  };
}

// Stories in a release
export function useReleaseStories(workspaceId: string | null, releaseId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: UserStory[]; total: number }>({
    queryKey: ["releaseStories", workspaceId, releaseId],
    queryFn: () => releasesApi.getStories(workspaceId!, releaseId!),
    enabled: !!workspaceId && !!releaseId,
  });

  return {
    stories: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
  };
}
