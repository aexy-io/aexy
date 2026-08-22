"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  taskConfigApi,
  TaskStatusConfig,
  CustomField,
  StatusCategory,
  CategorySemantics,
  WorkspaceStatusCategory,
  CustomFieldType,
  CustomFieldOption,
} from "@/lib/api";
import { invalidateTaskCaches } from "@/hooks/invalidateTaskCaches";
import { EMPTY_ARRAY } from "@/lib/emptyArray";

// Task Statuses
// When `projectId` is supplied the hook returns the project's status set, with
// the backend falling back to workspace defaults if the project hasn't
// customized yet. Use this everywhere a board column is rendered.
export function useTaskStatuses(
  workspaceId: string | null,
  projectId: string | null = null,
) {
  const queryClient = useQueryClient();

  const {
    data: statuses,
    isLoading,
    error,
    refetch,
  } = useQuery<TaskStatusConfig[]>({
    queryKey: ["taskStatuses", workspaceId, projectId],
    queryFn: () => taskConfigApi.getStatuses(workspaceId!, { projectId }),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      category: StatusCategory;
      color?: string;
      icon?: string;
      is_default?: boolean;
    }) =>
      taskConfigApi.createStatus(workspaceId!, {
        ...data,
        // When this hook is project-scoped, every new status is created
        // as a project override rather than a workspace default.
        ...(projectId ? { project_id: projectId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId, projectId] });
    },
  });

  const cloneFromWorkspaceMutation = useMutation({
    mutationFn: () => {
      if (!workspaceId || !projectId) {
        throw new Error("cloneFromWorkspace requires both workspaceId and projectId");
      }
      return taskConfigApi.cloneToProject(workspaceId, projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId, projectId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      statusId,
      data,
    }: {
      statusId: string;
      data: {
        name?: string;
        category?: StatusCategory;
        color?: string;
        icon?: string;
        is_default?: boolean;
      };
    }) => taskConfigApi.updateStatus(workspaceId!, statusId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId, projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({
      statusId,
      migrateTo,
    }: {
      statusId: string;
      migrateTo?: string;
    }) => taskConfigApi.deleteStatus(workspaceId!, statusId, { migrateTo }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId, projectId] });
      // Only blow away the task caches when tasks were actually rewritten —
      // the common "delete an unused status" path leaves them alone.
      if (variables.migrateTo) {
        invalidateTaskCaches(queryClient, workspaceId);
      }
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (statusIds: string[]) =>
      taskConfigApi.reorderStatuses(workspaceId!, statusIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId, projectId] });
    },
  });

  // Helper to get statuses by category
  const getStatusesByCategory = useCallback(
    (category: StatusCategory) =>
      (statuses ?? EMPTY_ARRAY).filter((s) => s.category === category),
    [statuses],
  );

  /*
    Memoised for the same reason the empty array is shared: these three go out
    in the return object, and `.filter()` allocates a new array on every call.
    Left bare they were a fresh identity per render even when the data had not
    moved — the same dependency-array poison as `|| []`, one step further down.
  */
  const byCategory = useMemo(
    () => ({
      todo: getStatusesByCategory("todo"),
      inProgress: getStatusesByCategory("in_progress"),
      done: getStatusesByCategory("done"),
    }),
    [getStatusesByCategory],
  );

  // Helper to get status by slug
  const getStatusBySlug = (slug: string) => {
    return (statuses ?? EMPTY_ARRAY).find((s) => s.slug === slug);
  };

  // True when the rows we're showing for a project are actually workspace
  // defaults (the project hasn't customized yet). Useful for "Customize for
  // this project" CTAs in the UI.
  const isUsingWorkspaceFallback = !!projectId && (statuses ?? EMPTY_ARRAY).every(
    (s) => s.project_id === null,
  );

  return {
    statuses: statuses ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createStatus: createMutation.mutateAsync,
    updateStatus: updateMutation.mutateAsync,
    deleteStatus: deleteMutation.mutateAsync,
    reorderStatuses: reorderMutation.mutateAsync,
    cloneFromWorkspace: cloneFromWorkspaceMutation.mutateAsync,
    isCloning: cloneFromWorkspaceMutation.isPending,
    isUsingWorkspaceFallback,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isReordering: reorderMutation.isPending,
    // Helpers
    getStatusesByCategory,
    getStatusBySlug,
    todoStatuses: byCategory.todo,
    inProgressStatuses: byCategory.inProgress,
    doneStatuses: byCategory.done,
  };
}

// Status Categories
// Mirrors useTaskStatuses scope semantics: when `projectId` is supplied the
// hook returns the project's category set, falling back to workspace defaults
// when the project has no overrides. Used by the StatusModal so the bucket
// dropdown reflects whichever categories the workspace has defined.
export function useStatusCategories(
  workspaceId: string | null,
  projectId: string | null = null,
) {
  const queryClient = useQueryClient();

  const {
    data: categories,
    isLoading,
    error,
    refetch,
  } = useQuery<WorkspaceStatusCategory[]>({
    queryKey: ["statusCategories", workspaceId, projectId],
    queryFn: () => taskConfigApi.getCategories(workspaceId!, { projectId }),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      slug: string;
      label: string;
      color?: string;
      semantics?: CategorySemantics;
      is_default?: boolean;
    }) =>
      taskConfigApi.createCategory(workspaceId!, {
        ...data,
        ...(projectId ? { project_id: projectId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statusCategories", workspaceId, projectId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      categoryId,
      data,
    }: {
      categoryId: string;
      data: {
        label?: string;
        color?: string;
        semantics?: CategorySemantics;
        is_default?: boolean;
      };
    }) => taskConfigApi.updateCategory(workspaceId!, categoryId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statusCategories", workspaceId, projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) => taskConfigApi.deleteCategory(workspaceId!, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statusCategories", workspaceId, projectId] });
    },
  });

  return {
    categories: categories ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createCategory: createMutation.mutateAsync,
    updateCategory: updateMutation.mutateAsync,
    deleteCategory: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Single status hook
export function useTaskStatus(workspaceId: string | null, statusId: string | null) {
  const {
    data: status,
    isLoading,
    error,
    refetch,
  } = useQuery<TaskStatusConfig>({
    queryKey: ["taskStatus", workspaceId, statusId],
    queryFn: () => taskConfigApi.getStatus(workspaceId!, statusId!),
    enabled: !!workspaceId && !!statusId,
  });

  return {
    status,
    isLoading,
    error,
    refetch,
  };
}

// Custom Fields
export function useCustomFields(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: fields,
    isLoading,
    error,
    refetch,
  } = useQuery<CustomField[]>({
    queryKey: ["customFields", workspaceId],
    queryFn: () => taskConfigApi.getCustomFields(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      field_type: CustomFieldType;
      options?: CustomFieldOption[];
      is_required?: boolean;
      default_value?: string;
    }) => taskConfigApi.createCustomField(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customFields", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      fieldId,
      data,
    }: {
      fieldId: string;
      data: {
        name?: string;
        options?: CustomFieldOption[];
        is_required?: boolean;
        default_value?: string;
      };
    }) => taskConfigApi.updateCustomField(workspaceId!, fieldId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customFields", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fieldId: string) =>
      taskConfigApi.deleteCustomField(workspaceId!, fieldId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customFields", workspaceId] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (fieldIds: string[]) =>
      taskConfigApi.reorderCustomFields(workspaceId!, fieldIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customFields", workspaceId] });
    },
  });

  // Helper to get field by slug
  const getFieldBySlug = (slug: string) => {
    return (fields || []).find((f) => f.slug === slug);
  };

  // Helper to get fields by type
  const getFieldsByType = (type: CustomFieldType) => {
    return (fields || []).filter((f) => f.field_type === type);
  };

  // Helper to get required fields
  const getRequiredFields = () => {
    return (fields || []).filter((f) => f.is_required);
  };

  return {
    fields: fields ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createField: createMutation.mutateAsync,
    updateField: updateMutation.mutateAsync,
    deleteField: deleteMutation.mutateAsync,
    reorderFields: reorderMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isReordering: reorderMutation.isPending,
    // Helpers
    getFieldBySlug,
    getFieldsByType,
    requiredFields: getRequiredFields(),
  };
}

// Single custom field hook
export function useCustomField(workspaceId: string | null, fieldId: string | null) {
  const {
    data: field,
    isLoading,
    error,
    refetch,
  } = useQuery<CustomField>({
    queryKey: ["customField", workspaceId, fieldId],
    queryFn: () => taskConfigApi.getCustomField(workspaceId!, fieldId!),
    enabled: !!workspaceId && !!fieldId,
  });

  return {
    field,
    isLoading,
    error,
    refetch,
  };
}

// Combined hook for task configuration
export function useTaskConfig(workspaceId: string | null) {
  const statusesResult = useTaskStatuses(workspaceId);
  const fieldsResult = useCustomFields(workspaceId);

  return {
    // Statuses
    statuses: statusesResult.statuses,
    isLoadingStatuses: statusesResult.isLoading,
    statusError: statusesResult.error,
    createStatus: statusesResult.createStatus,
    updateStatus: statusesResult.updateStatus,
    deleteStatus: statusesResult.deleteStatus,
    reorderStatuses: statusesResult.reorderStatuses,
    todoStatuses: statusesResult.todoStatuses,
    inProgressStatuses: statusesResult.inProgressStatuses,
    doneStatuses: statusesResult.doneStatuses,
    getStatusBySlug: statusesResult.getStatusBySlug,

    // Custom Fields
    fields: fieldsResult.fields,
    isLoadingFields: fieldsResult.isLoading,
    fieldError: fieldsResult.error,
    createField: fieldsResult.createField,
    updateField: fieldsResult.updateField,
    deleteField: fieldsResult.deleteField,
    reorderFields: fieldsResult.reorderFields,
    requiredFields: fieldsResult.requiredFields,
    getFieldBySlug: fieldsResult.getFieldBySlug,

    // Combined loading state
    isLoading: statusesResult.isLoading || fieldsResult.isLoading,
  };
}
