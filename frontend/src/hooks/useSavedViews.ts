"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { savedViewsApi, SavedViewEntityType, TableSavedView, ColumnDisplayConfig } from "@/lib/api";

export function useSavedViews(
  workspaceId: string | undefined,
  entityType: SavedViewEntityType,
  scopeId?: string,
) {
  const queryClient = useQueryClient();
  const queryKey = ["saved-views", workspaceId, entityType, scopeId];

  const { data: views = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => savedViewsApi.list(workspaceId!, entityType, scopeId),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      view_type?: "table" | "kanban" | "board" | "gallery" | "timeline";
      filters?: Record<string, unknown>[];
      sorts?: Record<string, unknown>[];
      visible_attributes?: string[];
      column_config?: ColumnDisplayConfig[];
      group_by_attribute?: string;
      kanban_settings?: Record<string, unknown>;
      is_private?: boolean;
      entity_scope_id?: string;
    }) => savedViewsApi.create(workspaceId!, entityType, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ viewId, data }: {
      viewId: string;
      data: Partial<{
        name: string;
        view_type: "table" | "kanban" | "board" | "gallery" | "timeline";
        filters: Record<string, unknown>[];
        sorts: Record<string, unknown>[];
        visible_attributes: string[];
        column_config: ColumnDisplayConfig[];
        group_by_attribute: string;
        kanban_settings: Record<string, unknown>;
        is_private: boolean;
      }>;
    }) => savedViewsApi.update(workspaceId!, entityType, viewId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (viewId: string) => savedViewsApi.delete(workspaceId!, entityType, viewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    views,
    isLoading,
    refetch,
    createView: createMutation.mutateAsync,
    updateView: (viewId: string, data: Parameters<typeof updateMutation.mutateAsync>[0]["data"]) =>
      updateMutation.mutateAsync({ viewId, data }),
    deleteView: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
