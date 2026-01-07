"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  crmApi,
  crmAutomationApi,
  CRMObject,
  CRMAttribute,
  CRMRecord,
  CRMNote,
  CRMActivity,
  CRMList,
  CRMListEntry,
  CRMAutomation,
  CRMAutomationRun,
  CRMSequence,
  CRMSequenceStep,
  CRMSequenceEnrollment,
  CRMWebhook,
  CRMWebhookDelivery,
  CRMObjectType,
  CRMAttributeType,
  CRMAutomationTriggerType,
  CRMAutomationActionType,
} from "@/lib/api";

// ==================== Object Hooks ====================

export function useCRMObjects(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: objects,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMObject[]>({
    queryKey: ["crmObjects", workspaceId],
    queryFn: () => crmApi.objects.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      plural_name: string;
      object_type?: CRMObjectType;
      description?: string;
      icon?: string;
      color?: string;
    }) => crmApi.objects.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      objectId,
      data,
    }: {
      objectId: string;
      data: Partial<{ name: string; plural_name: string; description: string; icon: string; color: string; is_active: boolean }>;
    }) => crmApi.objects.update(workspaceId!, objectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (objectId: string) => crmApi.objects.delete(workspaceId!, objectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => crmApi.objects.seed(workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
  });

  return {
    objects: objects || [],
    isLoading,
    error,
    refetch,
    createObject: createMutation.mutateAsync,
    updateObject: updateMutation.mutateAsync,
    deleteObject: deleteMutation.mutateAsync,
    seedObjects: seedMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isSeeding: seedMutation.isPending,
  };
}

export function useCRMObject(workspaceId: string | null, objectId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: object,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMObject>({
    queryKey: ["crmObject", workspaceId, objectId],
    queryFn: () => crmApi.objects.get(workspaceId!, objectId!),
    enabled: !!workspaceId && !!objectId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<{ name: string; plural_name: string; description: string; icon: string; color: string; is_active: boolean }>) =>
      crmApi.objects.update(workspaceId!, objectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmObject", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
  });

  return {
    object,
    isLoading,
    error,
    refetch,
    updateObject: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

// ==================== Attribute Hooks ====================

export function useCRMAttributes(workspaceId: string | null, objectId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: attributes,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMAttribute[]>({
    queryKey: ["crmAttributes", workspaceId, objectId],
    queryFn: () => crmApi.attributes.list(workspaceId!, objectId!),
    enabled: !!workspaceId && !!objectId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      attribute_type: CRMAttributeType;
      description?: string;
      is_required?: boolean;
      config?: Record<string, unknown>;
      default_value?: unknown;
    }) => crmApi.attributes.create(workspaceId!, objectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmAttributes", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObject", workspaceId, objectId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      attributeId,
      data,
    }: {
      attributeId: string;
      data: Partial<{
        name: string;
        description: string;
        is_required: boolean;
        is_searchable: boolean;
        is_filterable: boolean;
        is_sortable: boolean;
        config: Record<string, unknown>;
        default_value: unknown;
      }>;
    }) => crmApi.attributes.update(workspaceId!, attributeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmAttributes", workspaceId, objectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attributeId: string) => crmApi.attributes.delete(workspaceId!, attributeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmAttributes", workspaceId, objectId] });
    },
  });

  return {
    attributes: attributes || [],
    isLoading,
    error,
    refetch,
    createAttribute: createMutation.mutateAsync,
    updateAttribute: updateMutation.mutateAsync,
    deleteAttribute: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ==================== Record Hooks ====================

export function useCRMRecords(
  workspaceId: string | null,
  objectId: string | null,
  params?: { filters?: Record<string, unknown>[]; sorts?: Record<string, unknown>[]; skip?: number; limit?: number; include_archived?: boolean }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ records: CRMRecord[]; total: number }>({
    queryKey: ["crmRecords", workspaceId, objectId, params],
    queryFn: () => crmApi.records.list(workspaceId!, objectId!, params),
    enabled: !!workspaceId && !!objectId,
  });

  const createMutation = useMutation({
    mutationFn: (recordData: { values: Record<string, unknown>; owner_id?: string }) =>
      crmApi.records.create(workspaceId!, objectId!, recordData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      recordId,
      data: recordData,
    }: {
      recordId: string;
      data: { values?: Record<string, unknown>; owner_id?: string };
    }) => crmApi.records.update(workspaceId!, recordId, recordData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId, objectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ recordId, permanent }: { recordId: string; permanent?: boolean }) =>
      crmApi.records.delete(workspaceId!, recordId, permanent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ recordIds, permanent }: { recordIds: string[]; permanent?: boolean }) =>
      crmApi.records.bulkDelete(workspaceId!, recordIds, permanent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
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
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending || bulkDeleteMutation.isPending,
  };
}

export function useCRMRecord(workspaceId: string | null, recordId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: record,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMRecord>({
    queryKey: ["crmRecord", workspaceId, recordId],
    queryFn: () => crmApi.records.get(workspaceId!, recordId!),
    enabled: !!workspaceId && !!recordId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { values?: Record<string, unknown>; owner_id?: string }) =>
      crmApi.records.update(workspaceId!, recordId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmRecord", workspaceId, recordId] });
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (permanent?: boolean) => crmApi.records.delete(workspaceId!, recordId!, permanent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId] });
    },
  });

  return {
    record,
    isLoading,
    error,
    refetch,
    updateRecord: updateMutation.mutateAsync,
    deleteRecord: deleteMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ==================== Note Hooks ====================

export function useCRMNotes(workspaceId: string | null, recordId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: notes,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMNote[]>({
    queryKey: ["crmNotes", workspaceId, recordId],
    queryFn: () => crmApi.notes.list(workspaceId!, recordId!),
    enabled: !!workspaceId && !!recordId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { content: string; content_html?: string }) =>
      crmApi.notes.create(workspaceId!, recordId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmNotes", workspaceId, recordId] });
      queryClient.invalidateQueries({ queryKey: ["crmActivities", workspaceId, recordId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      noteId,
      data,
    }: {
      noteId: string;
      data: { content?: string; content_html?: string; is_pinned?: boolean };
    }) => crmApi.notes.update(workspaceId!, noteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmNotes", workspaceId, recordId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => crmApi.notes.delete(workspaceId!, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmNotes", workspaceId, recordId] });
    },
  });

  return {
    notes: notes || [],
    isLoading,
    error,
    refetch,
    createNote: createMutation.mutateAsync,
    updateNote: updateMutation.mutateAsync,
    deleteNote: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ==================== Activity Hooks ====================

export function useCRMActivities(workspaceId: string | null, recordId: string | null, params?: { skip?: number; limit?: number }) {
  const {
    data: activities,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMActivity[]>({
    queryKey: ["crmActivities", workspaceId, recordId, params],
    queryFn: () => crmApi.activities.list(workspaceId!, recordId!, params),
    enabled: !!workspaceId && !!recordId,
  });

  return {
    activities: activities || [],
    isLoading,
    error,
    refetch,
  };
}

// ==================== List Hooks ====================

export function useCRMLists(workspaceId: string | null, objectId?: string) {
  const queryClient = useQueryClient();

  const {
    data: lists,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMList[]>({
    queryKey: ["crmLists", workspaceId, objectId],
    queryFn: () => crmApi.lists.list(workspaceId!, objectId),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      object_id: string;
      name: string;
      description?: string;
      view_type?: "table" | "board" | "gallery" | "timeline";
      is_smart?: boolean;
      filters?: Record<string, unknown>[];
      sorts?: Record<string, unknown>[];
      columns?: string[];
    }) => crmApi.lists.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmLists", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      listId,
      data,
    }: {
      listId: string;
      data: Partial<{
        name: string;
        description: string;
        view_type: "table" | "board" | "gallery" | "timeline";
        filters: Record<string, unknown>[];
        sorts: Record<string, unknown>[];
        columns: string[];
        settings: Record<string, unknown>;
        is_shared: boolean;
      }>;
    }) => crmApi.lists.update(workspaceId!, listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmLists", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (listId: string) => crmApi.lists.delete(workspaceId!, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmLists", workspaceId] });
    },
  });

  return {
    lists: lists || [],
    isLoading,
    error,
    refetch,
    createList: createMutation.mutateAsync,
    updateList: updateMutation.mutateAsync,
    deleteList: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useCRMList(workspaceId: string | null, listId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: list,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMList>({
    queryKey: ["crmList", workspaceId, listId],
    queryFn: () => crmApi.lists.get(workspaceId!, listId!),
    enabled: !!workspaceId && !!listId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<{
      name: string;
      description: string;
      view_type: "table" | "board" | "gallery" | "timeline";
      filters: Record<string, unknown>[];
      sorts: Record<string, unknown>[];
      columns: string[];
      settings: Record<string, unknown>;
      is_shared: boolean;
    }>) => crmApi.lists.update(workspaceId!, listId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmList", workspaceId, listId] });
      queryClient.invalidateQueries({ queryKey: ["crmLists", workspaceId] });
    },
  });

  return {
    list,
    isLoading,
    error,
    refetch,
    updateList: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

export function useCRMListEntries(workspaceId: string | null, listId: string | null, params?: { skip?: number; limit?: number }) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ entries: CRMListEntry[]; total: number }>({
    queryKey: ["crmListEntries", workspaceId, listId, params],
    queryFn: () => crmApi.lists.getEntries(workspaceId!, listId!, params),
    enabled: !!workspaceId && !!listId,
  });

  const addEntryMutation = useMutation({
    mutationFn: (recordId: string) => crmApi.lists.addEntry(workspaceId!, listId!, recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmListEntries", workspaceId, listId] });
      queryClient.invalidateQueries({ queryKey: ["crmList", workspaceId, listId] });
    },
  });

  const removeEntryMutation = useMutation({
    mutationFn: (recordId: string) => crmApi.lists.removeEntry(workspaceId!, listId!, recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmListEntries", workspaceId, listId] });
      queryClient.invalidateQueries({ queryKey: ["crmList", workspaceId, listId] });
    },
  });

  return {
    entries: data?.entries || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    addEntry: addEntryMutation.mutateAsync,
    removeEntry: removeEntryMutation.mutateAsync,
    isAdding: addEntryMutation.isPending,
    isRemoving: removeEntryMutation.isPending,
  };
}

// ==================== Automation Hooks ====================

export function useCRMAutomations(workspaceId: string | null, params?: { object_id?: string; is_active?: boolean }) {
  const queryClient = useQueryClient();

  const {
    data: automations,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMAutomation[]>({
    queryKey: ["crmAutomations", workspaceId, params],
    queryFn: () => crmAutomationApi.automations.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      object_id: string;
      trigger_type: CRMAutomationTriggerType;
      description?: string;
      trigger_config?: Record<string, unknown>;
      conditions?: Record<string, unknown>[];
      actions: { type: CRMAutomationActionType; config: Record<string, unknown> }[];
    }) => crmAutomationApi.automations.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmAutomations", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      automationId,
      data,
    }: {
      automationId: string;
      data: Partial<{
        name: string;
        description: string;
        trigger_type: CRMAutomationTriggerType;
        trigger_config: Record<string, unknown>;
        conditions: Record<string, unknown>[];
        actions: { type: CRMAutomationActionType; config: Record<string, unknown> }[];
        is_active: boolean;
        run_limit_per_month: number;
        error_handling: "stop" | "continue" | "retry";
      }>;
    }) => crmAutomationApi.automations.update(workspaceId!, automationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmAutomations", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (automationId: string) => crmAutomationApi.automations.delete(workspaceId!, automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmAutomations", workspaceId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (automationId: string) => crmAutomationApi.automations.toggle(workspaceId!, automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmAutomations", workspaceId] });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: ({ automationId, recordId }: { automationId: string; recordId: string }) =>
      crmAutomationApi.automations.trigger(workspaceId!, automationId, recordId),
  });

  return {
    automations: automations || [],
    isLoading,
    error,
    refetch,
    createAutomation: createMutation.mutateAsync,
    updateAutomation: updateMutation.mutateAsync,
    deleteAutomation: deleteMutation.mutateAsync,
    toggleAutomation: toggleMutation.mutateAsync,
    triggerAutomation: triggerMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isTriggering: triggerMutation.isPending,
  };
}

export function useCRMAutomationRuns(workspaceId: string | null, automationId: string | null, params?: { skip?: number; limit?: number }) {
  const {
    data: runs,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMAutomationRun[]>({
    queryKey: ["crmAutomationRuns", workspaceId, automationId, params],
    queryFn: () => crmAutomationApi.automations.listRuns(workspaceId!, automationId!, params),
    enabled: !!workspaceId && !!automationId,
  });

  return {
    runs: runs || [],
    isLoading,
    error,
    refetch,
  };
}

// ==================== Sequence Hooks ====================

export function useCRMSequences(workspaceId: string | null, params?: { object_id?: string; is_active?: boolean }) {
  const queryClient = useQueryClient();

  const {
    data: sequences,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMSequence[]>({
    queryKey: ["crmSequences", workspaceId, params],
    queryFn: () => crmAutomationApi.sequences.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; object_id: string; description?: string }) =>
      crmAutomationApi.sequences.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      sequenceId,
      data,
    }: {
      sequenceId: string;
      data: Partial<{ name: string; description: string; is_active: boolean }>;
    }) => crmAutomationApi.sequences.update(workspaceId!, sequenceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sequenceId: string) => crmAutomationApi.sequences.delete(workspaceId!, sequenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (sequenceId: string) => crmAutomationApi.sequences.toggle(workspaceId!, sequenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
  });

  return {
    sequences: sequences || [],
    isLoading,
    error,
    refetch,
    createSequence: createMutation.mutateAsync,
    updateSequence: updateMutation.mutateAsync,
    deleteSequence: deleteMutation.mutateAsync,
    toggleSequence: toggleMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
  };
}

export function useCRMSequenceSteps(workspaceId: string | null, sequenceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: steps,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMSequenceStep[]>({
    queryKey: ["crmSequenceSteps", workspaceId, sequenceId],
    queryFn: () => crmAutomationApi.sequences.listSteps(workspaceId!, sequenceId!),
    enabled: !!workspaceId && !!sequenceId,
  });

  const addStepMutation = useMutation({
    mutationFn: (data: { step_type: string; config: Record<string, unknown>; delay_days?: number; delay_hours?: number; order?: number }) =>
      crmAutomationApi.sequences.addStep(workspaceId!, sequenceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequenceSteps", workspaceId, sequenceId] });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: ({
      stepId,
      data,
    }: {
      stepId: string;
      data: Partial<{ step_type: string; config: Record<string, unknown>; delay_days: number; delay_hours: number }>;
    }) => crmAutomationApi.sequences.updateStep(workspaceId!, stepId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequenceSteps", workspaceId, sequenceId] });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) => crmAutomationApi.sequences.deleteStep(workspaceId!, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequenceSteps", workspaceId, sequenceId] });
    },
  });

  return {
    steps: steps || [],
    isLoading,
    error,
    refetch,
    addStep: addStepMutation.mutateAsync,
    updateStep: updateStepMutation.mutateAsync,
    deleteStep: deleteStepMutation.mutateAsync,
    isAdding: addStepMutation.isPending,
    isUpdating: updateStepMutation.isPending,
    isDeleting: deleteStepMutation.isPending,
  };
}

export function useCRMSequenceEnrollments(workspaceId: string | null, sequenceId: string | null, params?: { status?: string }) {
  const queryClient = useQueryClient();

  const {
    data: enrollments,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMSequenceEnrollment[]>({
    queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId, params],
    queryFn: () => crmAutomationApi.sequences.listEnrollments(workspaceId!, sequenceId!, params),
    enabled: !!workspaceId && !!sequenceId,
  });

  const enrollMutation = useMutation({
    mutationFn: (recordId: string) => crmAutomationApi.sequences.enroll(workspaceId!, sequenceId!, recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (enrollmentId: string) => crmAutomationApi.sequences.pauseEnrollment(workspaceId!, enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (enrollmentId: string) => crmAutomationApi.sequences.resumeEnrollment(workspaceId!, enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId] });
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: (enrollmentId: string) => crmAutomationApi.sequences.unenroll(workspaceId!, enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
  });

  return {
    enrollments: enrollments || [],
    isLoading,
    error,
    refetch,
    enroll: enrollMutation.mutateAsync,
    pause: pauseMutation.mutateAsync,
    resume: resumeMutation.mutateAsync,
    unenroll: unenrollMutation.mutateAsync,
    isEnrolling: enrollMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isUnenrolling: unenrollMutation.isPending,
  };
}

// ==================== Webhook Hooks ====================

export function useCRMWebhooks(workspaceId: string | null, params?: { object_id?: string; is_active?: boolean }) {
  const queryClient = useQueryClient();

  const {
    data: webhooks,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMWebhook[]>({
    queryKey: ["crmWebhooks", workspaceId, params],
    queryFn: () => crmAutomationApi.webhooks.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      url: string;
      events: string[];
      object_id?: string;
      description?: string;
      headers?: Record<string, string>;
    }) => crmAutomationApi.webhooks.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      webhookId,
      data,
    }: {
      webhookId: string;
      data: Partial<{
        name: string;
        description: string;
        url: string;
        events: string[];
        headers: Record<string, string>;
        is_active: boolean;
      }>;
    }) => crmAutomationApi.webhooks.update(workspaceId!, webhookId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (webhookId: string) => crmAutomationApi.webhooks.delete(workspaceId!, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (webhookId: string) => crmAutomationApi.webhooks.toggle(workspaceId!, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
  });

  const rotateSecretMutation = useMutation({
    mutationFn: (webhookId: string) => crmAutomationApi.webhooks.rotateSecret(workspaceId!, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (webhookId: string) => crmAutomationApi.webhooks.test(workspaceId!, webhookId),
  });

  return {
    webhooks: webhooks || [],
    isLoading,
    error,
    refetch,
    createWebhook: createMutation.mutateAsync,
    updateWebhook: updateMutation.mutateAsync,
    deleteWebhook: deleteMutation.mutateAsync,
    toggleWebhook: toggleMutation.mutateAsync,
    rotateSecret: rotateSecretMutation.mutateAsync,
    testWebhook: testMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isRotating: rotateSecretMutation.isPending,
    isTesting: testMutation.isPending,
  };
}

export function useCRMWebhookDeliveries(workspaceId: string | null, webhookId: string | null, params?: { skip?: number; limit?: number }) {
  const queryClient = useQueryClient();

  const {
    data: deliveries,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMWebhookDelivery[]>({
    queryKey: ["crmWebhookDeliveries", workspaceId, webhookId, params],
    queryFn: () => crmAutomationApi.webhooks.listDeliveries(workspaceId!, webhookId!, params),
    enabled: !!workspaceId && !!webhookId,
  });

  const retryMutation = useMutation({
    mutationFn: (deliveryId: string) => crmAutomationApi.webhooks.retryDelivery(workspaceId!, deliveryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crmWebhookDeliveries", workspaceId, webhookId] });
    },
  });

  return {
    deliveries: deliveries || [],
    isLoading,
    error,
    refetch,
    retryDelivery: retryMutation.mutateAsync,
    isRetrying: retryMutation.isPending,
  };
}
