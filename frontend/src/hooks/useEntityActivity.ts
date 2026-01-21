"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  entityActivityApi,
  EntityActivityType,
  ActivityActionType,
  EntityActivityListResponse,
  TimelineResponse,
  EntityActivity,
} from "@/lib/api";

// Hook for listing activities (optionally filtered by entity)
export function useEntityActivities(
  workspaceId: string | null,
  params?: {
    entity_type?: EntityActivityType;
    entity_id?: string;
    activity_type?: ActivityActionType;
    actor_id?: string;
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
  } = useQuery<EntityActivityListResponse>({
    queryKey: ["entityActivities", workspaceId, params],
    queryFn: () => entityActivityApi.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const addCommentMutation = useMutation({
    mutationFn: ({
      entityType,
      entityId,
      content,
    }: {
      entityType: EntityActivityType;
      entityId: string;
      content: string;
    }) => entityActivityApi.addComment(workspaceId!, entityType, entityId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entityActivities", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["entityTimeline", workspaceId] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (activityId: string) =>
      entityActivityApi.deleteComment(workspaceId!, activityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entityActivities", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["entityTimeline", workspaceId] });
    },
  });

  return {
    activities: data?.items || [],
    total: data?.total || 0,
    hasMore: data?.has_more || false,
    isLoading,
    error,
    refetch,
    addComment: addCommentMutation.mutateAsync,
    deleteComment: deleteCommentMutation.mutateAsync,
    isAddingComment: addCommentMutation.isPending,
    isDeletingComment: deleteCommentMutation.isPending,
  };
}

// Hook for getting timeline of a specific entity
export function useEntityTimeline(
  workspaceId: string | null,
  entityType: EntityActivityType | null,
  entityId: string | null,
  params?: { limit?: number; offset?: number }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<TimelineResponse>({
    queryKey: ["entityTimeline", workspaceId, entityType, entityId, params],
    queryFn: () =>
      entityActivityApi.getTimeline(workspaceId!, entityType!, entityId!, params),
    enabled: !!workspaceId && !!entityType && !!entityId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) =>
      entityActivityApi.addComment(workspaceId!, entityType!, entityId!, content),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["entityTimeline", workspaceId, entityType, entityId],
      });
      queryClient.invalidateQueries({ queryKey: ["entityActivities", workspaceId] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (activityId: string) =>
      entityActivityApi.deleteComment(workspaceId!, activityId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["entityTimeline", workspaceId, entityType, entityId],
      });
      queryClient.invalidateQueries({ queryKey: ["entityActivities", workspaceId] });
    },
  });

  return {
    timeline: data?.entries || [],
    total: data?.total || 0,
    entityType: data?.entity_type,
    entityId: data?.entity_id,
    isLoading,
    error,
    refetch,
    addComment: addCommentMutation.mutateAsync,
    deleteComment: deleteCommentMutation.mutateAsync,
    isAddingComment: addCommentMutation.isPending,
    isDeletingComment: deleteCommentMutation.isPending,
  };
}
