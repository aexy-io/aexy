"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      toast.success("Object created");
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create object");
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
      toast.success("Object updated");
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update object");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (objectId: string) => crmApi.objects.delete(workspaceId!, objectId),
    onSuccess: () => {
      toast.success("Object deleted");
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete object");
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => crmApi.objects.seed(workspaceId!),
    onSuccess: () => {
      toast.success("Default objects created");
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to seed objects");
    },
  });

  const recalculateCountsMutation = useMutation({
    mutationFn: () => crmApi.objects.recalculateCounts(workspaceId!),
    onSuccess: () => {
      toast.success("Counts recalculated");
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to recalculate counts");
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
    recalculateCounts: recalculateCountsMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isSeeding: seedMutation.isPending,
    isRecalculating: recalculateCountsMutation.isPending,
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
      toast.success("Object updated");
      queryClient.invalidateQueries({ queryKey: ["crmObject", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update object");
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
      toast.success("Attribute created");
      queryClient.invalidateQueries({ queryKey: ["crmAttributes", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObject", workspaceId, objectId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create attribute");
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
      toast.success("Attribute updated");
      queryClient.invalidateQueries({ queryKey: ["crmAttributes", workspaceId, objectId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update attribute");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attributeId: string) => crmApi.attributes.delete(workspaceId!, attributeId),
    onSuccess: () => {
      toast.success("Attribute deleted");
      queryClient.invalidateQueries({ queryKey: ["crmAttributes", workspaceId, objectId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete attribute");
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
      toast.success("Record created");
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create record");
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
      toast.success("Record updated");
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId, objectId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update record");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ recordId, permanent }: { recordId: string; permanent?: boolean }) =>
      crmApi.records.delete(workspaceId!, recordId, permanent),
    onSuccess: () => {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete record");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ recordIds, permanent }: { recordIds: string[]; permanent?: boolean }) =>
      crmApi.records.bulkDelete(workspaceId!, recordIds, permanent),
    onSuccess: () => {
      toast.success("Records deleted");
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId, objectId] });
      queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
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
      toast.success("Record updated");
      queryClient.invalidateQueries({ queryKey: ["crmRecord", workspaceId, recordId] });
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update record");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (permanent?: boolean) => crmApi.records.delete(workspaceId!, recordId!, permanent),
    onSuccess: () => {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete record");
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
      toast.success("Note added");
      queryClient.invalidateQueries({ queryKey: ["crmNotes", workspaceId, recordId] });
      queryClient.invalidateQueries({ queryKey: ["crmActivities", workspaceId, recordId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to add note");
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
      toast.success("Note updated");
      queryClient.invalidateQueries({ queryKey: ["crmNotes", workspaceId, recordId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update note");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => crmApi.notes.delete(workspaceId!, noteId),
    onSuccess: () => {
      toast.success("Note deleted");
      queryClient.invalidateQueries({ queryKey: ["crmNotes", workspaceId, recordId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete note");
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
      toast.success("List created");
      queryClient.invalidateQueries({ queryKey: ["crmLists", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create list");
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
      toast.success("List updated");
      queryClient.invalidateQueries({ queryKey: ["crmLists", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update list");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (listId: string) => crmApi.lists.delete(workspaceId!, listId),
    onSuccess: () => {
      toast.success("List deleted");
      queryClient.invalidateQueries({ queryKey: ["crmLists", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete list");
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
      toast.success("List updated");
      queryClient.invalidateQueries({ queryKey: ["crmList", workspaceId, listId] });
      queryClient.invalidateQueries({ queryKey: ["crmLists", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update list");
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
      toast.success("Entry added to list");
      queryClient.invalidateQueries({ queryKey: ["crmListEntries", workspaceId, listId] });
      queryClient.invalidateQueries({ queryKey: ["crmList", workspaceId, listId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to add entry to list");
    },
  });

  const removeEntryMutation = useMutation({
    mutationFn: (recordId: string) => crmApi.lists.removeEntry(workspaceId!, listId!, recordId),
    onSuccess: () => {
      toast.success("Entry removed from list");
      queryClient.invalidateQueries({ queryKey: ["crmListEntries", workspaceId, listId] });
      queryClient.invalidateQueries({ queryKey: ["crmList", workspaceId, listId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove entry from list");
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
      toast.success("Automation created");
      queryClient.invalidateQueries({ queryKey: ["crmAutomations", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create automation");
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
      toast.success("Automation updated");
      queryClient.invalidateQueries({ queryKey: ["crmAutomations", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update automation");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (automationId: string) => crmAutomationApi.automations.delete(workspaceId!, automationId),
    onSuccess: () => {
      toast.success("Automation deleted");
      queryClient.invalidateQueries({ queryKey: ["crmAutomations", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete automation");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (automationId: string) => crmAutomationApi.automations.toggle(workspaceId!, automationId),
    onSuccess: () => {
      toast.success("Automation toggled");
      queryClient.invalidateQueries({ queryKey: ["crmAutomations", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to toggle automation");
    },
  });

  const triggerMutation = useMutation({
    mutationFn: ({ automationId, recordId }: { automationId: string; recordId: string }) =>
      crmAutomationApi.automations.trigger(workspaceId!, automationId, recordId),
    onSuccess: () => {
      toast.success("Automation triggered");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to trigger automation");
    },
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
      toast.success("Sequence created");
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create sequence");
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
      toast.success("Sequence updated");
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update sequence");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sequenceId: string) => crmAutomationApi.sequences.delete(workspaceId!, sequenceId),
    onSuccess: () => {
      toast.success("Sequence deleted");
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete sequence");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (sequenceId: string) => crmAutomationApi.sequences.toggle(workspaceId!, sequenceId),
    onSuccess: () => {
      toast.success("Sequence toggled");
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to toggle sequence");
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
      toast.success("Step added");
      queryClient.invalidateQueries({ queryKey: ["crmSequenceSteps", workspaceId, sequenceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to add step");
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
      toast.success("Step updated");
      queryClient.invalidateQueries({ queryKey: ["crmSequenceSteps", workspaceId, sequenceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update step");
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) => crmAutomationApi.sequences.deleteStep(workspaceId!, stepId),
    onSuccess: () => {
      toast.success("Step deleted");
      queryClient.invalidateQueries({ queryKey: ["crmSequenceSteps", workspaceId, sequenceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete step");
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
      toast.success("Sequence started");
      queryClient.invalidateQueries({ queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to enroll in sequence");
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (enrollmentId: string) => crmAutomationApi.sequences.pauseEnrollment(workspaceId!, enrollmentId),
    onSuccess: () => {
      toast.success("Enrollment paused");
      queryClient.invalidateQueries({ queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to pause enrollment");
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (enrollmentId: string) => crmAutomationApi.sequences.resumeEnrollment(workspaceId!, enrollmentId),
    onSuccess: () => {
      toast.success("Enrollment resumed");
      queryClient.invalidateQueries({ queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to resume enrollment");
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: (enrollmentId: string) => crmAutomationApi.sequences.unenroll(workspaceId!, enrollmentId),
    onSuccess: () => {
      toast.success("Unenrolled from sequence");
      queryClient.invalidateQueries({ queryKey: ["crmSequenceEnrollments", workspaceId, sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["crmSequences", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to unenroll from sequence");
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
      toast.success("Webhook created");
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create webhook");
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
      toast.success("Webhook updated");
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update webhook");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (webhookId: string) => crmAutomationApi.webhooks.delete(workspaceId!, webhookId),
    onSuccess: () => {
      toast.success("Webhook deleted");
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete webhook");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (webhookId: string) => crmAutomationApi.webhooks.toggle(workspaceId!, webhookId),
    onSuccess: () => {
      toast.success("Webhook toggled");
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to toggle webhook");
    },
  });

  const rotateSecretMutation = useMutation({
    mutationFn: (webhookId: string) => crmAutomationApi.webhooks.rotateSecret(workspaceId!, webhookId),
    onSuccess: () => {
      toast.success("Webhook secret rotated");
      queryClient.invalidateQueries({ queryKey: ["crmWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to rotate webhook secret");
    },
  });

  const testMutation = useMutation({
    mutationFn: (webhookId: string) => crmAutomationApi.webhooks.test(workspaceId!, webhookId),
    onSuccess: () => {
      toast.success("Webhook test sent");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to test webhook");
    },
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
      toast.success("Delivery retry queued");
      queryClient.invalidateQueries({ queryKey: ["crmWebhookDeliveries", workspaceId, webhookId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to retry delivery");
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
