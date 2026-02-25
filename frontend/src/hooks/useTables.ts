"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  tablesApi,
  StandaloneTable,
  TableField,
  TableRecord,
  TableCollaborator,
  TableAccess,
  TableSavedView,
  ColumnDisplayConfig,
  TableVisibility,
  TableRowAccessMode,
  TablePermission,
} from "@/lib/api";

// ==================== Table Hooks ====================

export function useTables(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const { data: tables, isLoading, error, refetch } = useQuery<StandaloneTable[]>({
    queryKey: ["tables", workspaceId],
    queryFn: () => tablesApi.tables.list(workspaceId!, "standalone"),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      plural_name?: string;
      description?: string;
      icon?: string;
      color?: string;
      visibility?: TableVisibility;
      row_access_mode?: TableRowAccessMode;
    }) => tablesApi.tables.create(workspaceId!, data),
    onSuccess: () => {
      toast.success("Table created");
      queryClient.invalidateQueries({ queryKey: ["tables", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create table");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ tableId, data }: {
      tableId: string;
      data: Partial<{
        name: string;
        plural_name: string;
        description: string;
        icon: string;
        color: string;
        visibility: TableVisibility;
        row_access_mode: TableRowAccessMode;
        is_active: boolean;
      }>;
    }) => tablesApi.tables.update(workspaceId!, tableId, data),
    onSuccess: () => {
      toast.success("Table updated");
      queryClient.invalidateQueries({ queryKey: ["tables", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update table");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tableId: string) => tablesApi.tables.delete(workspaceId!, tableId),
    onSuccess: () => {
      toast.success("Table deleted");
      queryClient.invalidateQueries({ queryKey: ["tables", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete table");
    },
  });

  return {
    tables: tables || [],
    isLoading,
    error,
    refetch,
    createTable: createMutation.mutateAsync,
    updateTable: updateMutation.mutateAsync,
    deleteTable: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ==================== Field Hooks ====================

export function useTableFields(workspaceId: string | null, tableId: string | null) {
  const queryClient = useQueryClient();

  const { data: fields, isLoading, error } = useQuery<TableField[]>({
    queryKey: ["tableFields", workspaceId, tableId],
    queryFn: () => tablesApi.fields.list(workspaceId!, tableId!),
    enabled: !!workspaceId && !!tableId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      slug?: string;
      attribute_type: string;
      is_required?: boolean;
      is_unique?: boolean;
      is_filterable?: boolean;
      default_value?: unknown;
      options?: Record<string, unknown>;
    }) => tablesApi.fields.create(workspaceId!, tableId!, data),
    onSuccess: () => {
      toast.success("Field added");
      queryClient.invalidateQueries({ queryKey: ["tableFields", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to add field");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ fieldId, data }: {
      fieldId: string;
      data: Partial<{
        name: string;
        is_required: boolean;
        is_unique: boolean;
        is_filterable: boolean;
        default_value: unknown;
        options: Record<string, unknown>;
      }>;
    }) => tablesApi.fields.update(workspaceId!, tableId!, fieldId, data),
    onSuccess: () => {
      toast.success("Field updated");
      queryClient.invalidateQueries({ queryKey: ["tableFields", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update field");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fieldId: string) => tablesApi.fields.delete(workspaceId!, tableId!, fieldId),
    onSuccess: () => {
      toast.success("Field deleted");
      queryClient.invalidateQueries({ queryKey: ["tableFields", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete field");
    },
  });

  return {
    fields: fields || [],
    isLoading,
    error,
    addField: createMutation.mutateAsync,
    updateField: updateMutation.mutateAsync,
    deleteField: deleteMutation.mutateAsync,
    isAdding: createMutation.isPending,
  };
}

// ==================== Record Hooks ====================

export function useTableRecords(
  workspaceId: string | null,
  tableId: string | null,
  params?: {
    skip?: number;
    limit?: number;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
    search?: string;
  }
) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<{ records: TableRecord[]; total: number }>({
    queryKey: ["tableRecords", workspaceId, tableId, params],
    queryFn: () => tablesApi.records.list(workspaceId!, tableId!, params),
    enabled: !!workspaceId && !!tableId,
  });

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      tablesApi.records.create(workspaceId!, tableId!, values),
    onSuccess: () => {
      toast.success("Record created");
      queryClient.invalidateQueries({ queryKey: ["tableRecords", workspaceId, tableId] });
      queryClient.invalidateQueries({ queryKey: ["tables", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create record");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ recordId, values }: { recordId: string; values: Record<string, unknown> }) =>
      tablesApi.records.update(workspaceId!, tableId!, recordId, values),
    onSuccess: () => {
      toast.success("Record updated");
      queryClient.invalidateQueries({ queryKey: ["tableRecords", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update record");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) =>
      tablesApi.records.delete(workspaceId!, tableId!, recordId),
    onSuccess: () => {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["tableRecords", workspaceId, tableId] });
      queryClient.invalidateQueries({ queryKey: ["tables", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete record");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (recordIds: string[]) =>
      tablesApi.records.bulkDelete(workspaceId!, tableId!, recordIds),
    onSuccess: (data) => {
      toast.success(`${data.deleted} records deleted`);
      queryClient.invalidateQueries({ queryKey: ["tableRecords", workspaceId, tableId] });
      queryClient.invalidateQueries({ queryKey: ["tables", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete records");
    },
  });

  return {
    records: data?.records || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createRecord: createMutation.mutateAsync,
    updateRecord: updateMutation.mutateAsync,
    deleteRecord: deleteMutation.mutateAsync,
    bulkDeleteRecords: bulkDeleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

// ==================== Access Hook ====================

export function useTableAccess(workspaceId: string | null, tableId: string | null) {
  const { data: access, isLoading } = useQuery<TableAccess>({
    queryKey: ["tableAccess", workspaceId, tableId],
    queryFn: () => tablesApi.access.getMyAccess(workspaceId!, tableId!),
    enabled: !!workspaceId && !!tableId,
  });

  return { access, isLoading };
}

// ==================== Collaborator Hooks ====================

export function useTableCollaborators(workspaceId: string | null, tableId: string | null) {
  const queryClient = useQueryClient();

  const { data: collaborators, isLoading } = useQuery<TableCollaborator[]>({
    queryKey: ["tableCollaborators", workspaceId, tableId],
    queryFn: () => tablesApi.collaborators.list(workspaceId!, tableId!),
    enabled: !!workspaceId && !!tableId,
  });

  const addMutation = useMutation({
    mutationFn: (data: {
      developer_id?: string;
      role_id?: string;
      team_id?: string;
      permission?: TablePermission;
    }) => tablesApi.collaborators.add(workspaceId!, tableId!, data),
    onSuccess: () => {
      toast.success("Collaborator added");
      queryClient.invalidateQueries({ queryKey: ["tableCollaborators", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to add collaborator");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ collabId, data }: {
      collabId: string;
      data: Partial<{ permission: TablePermission; hidden_columns: string[]; readonly_columns: string[] }>;
    }) => tablesApi.collaborators.update(workspaceId!, tableId!, collabId, data),
    onSuccess: () => {
      toast.success("Collaborator updated");
      queryClient.invalidateQueries({ queryKey: ["tableCollaborators", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update collaborator");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (collabId: string) =>
      tablesApi.collaborators.remove(workspaceId!, tableId!, collabId),
    onSuccess: () => {
      toast.success("Collaborator removed");
      queryClient.invalidateQueries({ queryKey: ["tableCollaborators", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove collaborator");
    },
  });

  return {
    collaborators: collaborators || [],
    isLoading,
    addCollaborator: addMutation.mutateAsync,
    updateCollaborator: updateMutation.mutateAsync,
    removeCollaborator: removeMutation.mutateAsync,
  };
}

// ==================== Saved Views Hook ====================

export function useSavedViews(workspaceId: string | null, tableId: string | null) {
  const queryClient = useQueryClient();

  const { data: views, isLoading, error } = useQuery<TableSavedView[]>({
    queryKey: ["tableViews", workspaceId, tableId],
    queryFn: () => tablesApi.views.list(workspaceId!, tableId!),
    enabled: !!workspaceId && !!tableId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      view_type?: "table" | "board" | "gallery" | "timeline";
      filters?: Record<string, unknown>[];
      sorts?: Record<string, unknown>[];
      visible_attributes?: string[];
      column_config?: ColumnDisplayConfig[];
      group_by_attribute?: string;
      is_private?: boolean;
    }) => tablesApi.views.create(workspaceId!, tableId!, data),
    onSuccess: () => {
      toast.success("View saved");
      queryClient.invalidateQueries({ queryKey: ["tableViews", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save view");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ viewId, data }: {
      viewId: string;
      data: Partial<{
        name: string;
        view_type: "table" | "board" | "gallery" | "timeline";
        filters: Record<string, unknown>[];
        sorts: Record<string, unknown>[];
        visible_attributes: string[];
        column_config: ColumnDisplayConfig[];
        group_by_attribute: string;
        is_private: boolean;
      }>;
    }) => tablesApi.views.update(workspaceId!, tableId!, viewId, data),
    onSuccess: () => {
      toast.success("View updated");
      queryClient.invalidateQueries({ queryKey: ["tableViews", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update view");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (viewId: string) => tablesApi.views.delete(workspaceId!, tableId!, viewId),
    onSuccess: () => {
      toast.success("View deleted");
      queryClient.invalidateQueries({ queryKey: ["tableViews", workspaceId, tableId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete view");
    },
  });

  return {
    views: views || [],
    isLoading,
    error,
    createView: createMutation.mutateAsync,
    updateView: updateMutation.mutateAsync,
    deleteView: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
