"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  taskConfigApi,
  TaskStatusConfig,
  CustomField,
  StatusCategory,
  CustomFieldType,
  CustomFieldOption,
} from "@/lib/api";

// Task Statuses
export function useTaskStatuses(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: statuses,
    isLoading,
    error,
    refetch,
  } = useQuery<TaskStatusConfig[]>({
    queryKey: ["taskStatuses", workspaceId],
    queryFn: () => taskConfigApi.getStatuses(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      category: StatusCategory;
      color?: string;
      icon?: string;
      is_default?: boolean;
    }) => taskConfigApi.createStatus(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId] });
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
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (statusId: string) =>
      taskConfigApi.deleteStatus(workspaceId!, statusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (statusIds: string[]) =>
      taskConfigApi.reorderStatuses(workspaceId!, statusIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskStatuses", workspaceId] });
    },
  });

  // Helper to get statuses by category
  const getStatusesByCategory = (category: StatusCategory) => {
    return (statuses || []).filter((s) => s.category === category);
  };

  // Helper to get status by slug
  const getStatusBySlug = (slug: string) => {
    return (statuses || []).find((s) => s.slug === slug);
  };

  return {
    statuses: statuses || [],
    isLoading,
    error,
    refetch,
    createStatus: createMutation.mutateAsync,
    updateStatus: updateMutation.mutateAsync,
    deleteStatus: deleteMutation.mutateAsync,
    reorderStatuses: reorderMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isReordering: reorderMutation.isPending,
    // Helpers
    getStatusesByCategory,
    getStatusBySlug,
    todoStatuses: getStatusesByCategory("todo"),
    inProgressStatuses: getStatusesByCategory("in_progress"),
    doneStatuses: getStatusesByCategory("done"),
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
    fields: fields || [],
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
