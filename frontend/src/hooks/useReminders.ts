"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  remindersApi,
  Reminder,
  ReminderCreate,
  ReminderUpdate,
  ReminderInstance,
  ReminderListResponse,
  ReminderInstanceListResponse,
  ReminderDashboardStats,
  MyRemindersResponse,
  ReminderCalendarEvent,
  ControlOwner,
  ControlOwnerCreate,
  ControlOwnerUpdate,
  DomainTeamMapping,
  DomainTeamMappingCreate,
  AssignmentRule,
  AssignmentRuleCreate,
  ReminderSuggestion,
  ReminderStatus,
  ReminderCategory,
  ReminderPriority,
  ReminderInstanceStatus,
} from "@/lib/api";

// ============ Reminder List Hook ============

export function useReminders(
  workspaceId: string | null,
  options?: {
    status?: ReminderStatus;
    category?: ReminderCategory;
    priority?: ReminderPriority;
    search?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<ReminderListResponse>({
    queryKey: ["reminders", workspaceId, options],
    queryFn: () =>
      remindersApi.list(workspaceId!, {
        status: options?.status,
        category: options?.category,
        priority: options?.priority,
        search: options?.search,
        page: options?.page,
        page_size: options?.pageSize,
      }),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: ReminderCreate) => remindersApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ reminderId, data }: { reminderId: string; data: ReminderUpdate }) =>
      remindersApi.update(workspaceId!, reminderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminder", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (reminderId: string) => remindersApi.delete(workspaceId!, reminderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
    },
  });

  return {
    reminders: data?.reminders || [],
    total: data?.total || 0,
    page: data?.page || 1,
    pageSize: data?.page_size || 20,
    isLoading,
    error,
    refetch,
    createReminder: createMutation.mutateAsync,
    updateReminder: updateMutation.mutateAsync,
    deleteReminder: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============ Single Reminder Hook ============

export function useReminder(workspaceId: string | null, reminderId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: reminder,
    isLoading,
    error,
    refetch,
  } = useQuery<Reminder>({
    queryKey: ["reminder", workspaceId, reminderId],
    queryFn: () => remindersApi.get(workspaceId!, reminderId!),
    enabled: !!workspaceId && !!reminderId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: ReminderUpdate) => remindersApi.update(workspaceId!, reminderId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminder", workspaceId, reminderId] });
      queryClient.invalidateQueries({ queryKey: ["reminders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => remindersApi.delete(workspaceId!, reminderId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
    },
  });

  return {
    reminder,
    isLoading,
    error,
    refetch,
    updateReminder: updateMutation.mutateAsync,
    deleteReminder: deleteMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============ Reminder Instances Hook ============

export function useReminderInstances(
  workspaceId: string | null,
  reminderId: string | null,
  options?: {
    status?: ReminderInstanceStatus;
    page?: number;
    pageSize?: number;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<ReminderInstanceListResponse>({
    queryKey: ["reminderInstances", workspaceId, reminderId, options],
    queryFn: () =>
      remindersApi.listInstances(workspaceId!, reminderId!, {
        status: options?.status,
        page: options?.page,
        page_size: options?.pageSize,
      }),
    enabled: !!workspaceId && !!reminderId,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: ({ instanceId, notes }: { instanceId: string; notes?: string }) =>
      remindersApi.acknowledgeInstance(workspaceId!, instanceId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminderInstances", workspaceId, reminderId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["myReminders", workspaceId] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({
      instanceId,
      notes,
      evidenceUrl,
    }: {
      instanceId: string;
      notes?: string;
      evidenceUrl?: string;
    }) => remindersApi.completeInstance(workspaceId!, instanceId, { notes, evidence_url: evidenceUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminderInstances", workspaceId, reminderId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["myReminders", workspaceId] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: ({ instanceId, reason }: { instanceId: string; reason: string }) =>
      remindersApi.skipInstance(workspaceId!, instanceId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminderInstances", workspaceId, reminderId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["myReminders", workspaceId] });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: ({
      instanceId,
      ownerId,
      teamId,
    }: {
      instanceId: string;
      ownerId?: string;
      teamId?: string;
    }) => remindersApi.reassignInstance(workspaceId!, instanceId, { owner_id: ownerId, team_id: teamId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminderInstances", workspaceId, reminderId] });
      queryClient.invalidateQueries({ queryKey: ["myReminders", workspaceId] });
    },
  });

  return {
    instances: data?.instances || [],
    total: data?.total || 0,
    page: data?.page || 1,
    pageSize: data?.page_size || 20,
    isLoading,
    error,
    refetch,
    acknowledgeInstance: acknowledgeMutation.mutateAsync,
    completeInstance: completeMutation.mutateAsync,
    skipInstance: skipMutation.mutateAsync,
    reassignInstance: reassignMutation.mutateAsync,
    isAcknowledging: acknowledgeMutation.isPending,
    isCompleting: completeMutation.isPending,
    isSkipping: skipMutation.isPending,
    isReassigning: reassignMutation.isPending,
  };
}

// ============ Dashboard Hook ============

export function useReminderDashboard(workspaceId: string | null) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery<ReminderDashboardStats>({
    queryKey: ["reminderDashboard", workspaceId],
    queryFn: () => remindersApi.getDashboardStats(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: 60000, // Refetch every minute
  });

  return {
    stats,
    totalReminders: stats?.total_reminders || 0,
    activeReminders: stats?.active_reminders || 0,
    pausedReminders: stats?.paused_reminders || 0,
    pendingInstances: stats?.pending_instances || 0,
    overdueInstances: stats?.overdue_instances || 0,
    completedThisWeek: stats?.completed_this_week || 0,
    completionRate7d: stats?.completion_rate_7d || 0,
    byCategory: stats?.by_category || {},
    byPriority: stats?.by_priority || {},
    upcoming7Days: stats?.upcoming_7_days || [],
    isLoading,
    error,
    refetch,
  };
}

// ============ My Reminders Hook ============

export function useMyReminders(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<MyRemindersResponse>({
    queryKey: ["myReminders", workspaceId],
    queryFn: () => remindersApi.getMyReminders(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: 60000, // Refetch every minute
  });

  const acknowledgeMutation = useMutation({
    mutationFn: ({ instanceId, notes }: { instanceId: string; notes?: string }) =>
      remindersApi.acknowledgeInstance(workspaceId!, instanceId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myReminders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({
      instanceId,
      notes,
      evidenceUrl,
    }: {
      instanceId: string;
      notes?: string;
      evidenceUrl?: string;
    }) => remindersApi.completeInstance(workspaceId!, instanceId, { notes, evidence_url: evidenceUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myReminders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
    },
  });

  return {
    assignedToMe: data?.assigned_to_me || [],
    createdByMe: data?.created_by_me || [],
    overdue: data?.overdue || [],
    isLoading,
    error,
    refetch,
    acknowledgeInstance: acknowledgeMutation.mutateAsync,
    completeInstance: completeMutation.mutateAsync,
    isAcknowledging: acknowledgeMutation.isPending,
    isCompleting: completeMutation.isPending,
  };
}

// ============ Calendar View Hook ============

export function useReminderCalendar(
  workspaceId: string | null,
  startDate: string | null,
  endDate: string | null
) {
  const {
    data: events,
    isLoading,
    error,
    refetch,
  } = useQuery<ReminderCalendarEvent[]>({
    queryKey: ["reminderCalendar", workspaceId, startDate, endDate],
    queryFn: () => remindersApi.getCalendarView(workspaceId!, startDate!, endDate!),
    enabled: !!workspaceId && !!startDate && !!endDate,
  });

  return {
    events: events || [],
    isLoading,
    error,
    refetch,
  };
}

// ============ Control Owners Hook ============

export function useControlOwners(workspaceId: string | null, domain?: string) {
  const queryClient = useQueryClient();

  const {
    data: controlOwners,
    isLoading,
    error,
    refetch,
  } = useQuery<ControlOwner[]>({
    queryKey: ["controlOwners", workspaceId, domain],
    queryFn: () => remindersApi.listControlOwners(workspaceId!, domain),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: ControlOwnerCreate) => remindersApi.createControlOwner(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["controlOwners", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ controlOwnerId, data }: { controlOwnerId: string; data: ControlOwnerUpdate }) =>
      remindersApi.updateControlOwner(workspaceId!, controlOwnerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["controlOwners", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (controlOwnerId: string) => remindersApi.deleteControlOwner(workspaceId!, controlOwnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["controlOwners", workspaceId] });
    },
  });

  return {
    controlOwners: controlOwners || [],
    isLoading,
    error,
    refetch,
    createControlOwner: createMutation.mutateAsync,
    updateControlOwner: updateMutation.mutateAsync,
    deleteControlOwner: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============ Domain Team Mappings Hook ============

export function useDomainTeamMappings(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: mappings,
    isLoading,
    error,
    refetch,
  } = useQuery<DomainTeamMapping[]>({
    queryKey: ["domainTeamMappings", workspaceId],
    queryFn: () => remindersApi.listDomainMappings(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: DomainTeamMappingCreate) => remindersApi.createDomainMapping(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domainTeamMappings", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (mappingId: string) => remindersApi.deleteDomainMapping(workspaceId!, mappingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domainTeamMappings", workspaceId] });
    },
  });

  return {
    mappings: mappings || [],
    isLoading,
    error,
    refetch,
    createMapping: createMutation.mutateAsync,
    deleteMapping: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============ Assignment Rules Hook ============

export function useAssignmentRules(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: rules,
    isLoading,
    error,
    refetch,
  } = useQuery<AssignmentRule[]>({
    queryKey: ["assignmentRules", workspaceId],
    queryFn: () => remindersApi.listAssignmentRules(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: AssignmentRuleCreate) => remindersApi.createAssignmentRule(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignmentRules", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: Partial<AssignmentRuleCreate> }) =>
      remindersApi.updateAssignmentRule(workspaceId!, ruleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignmentRules", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => remindersApi.deleteAssignmentRule(workspaceId!, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignmentRules", workspaceId] });
    },
  });

  return {
    rules: rules || [],
    isLoading,
    error,
    refetch,
    createRule: createMutation.mutateAsync,
    updateRule: updateMutation.mutateAsync,
    deleteRule: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============ Reminder Suggestions Hook ============

export function useReminderSuggestions(
  workspaceId: string | null,
  questionnaireResponseId?: string
) {
  const queryClient = useQueryClient();

  const {
    data: suggestions,
    isLoading,
    error,
    refetch,
  } = useQuery<ReminderSuggestion[]>({
    queryKey: ["reminderSuggestions", workspaceId, questionnaireResponseId],
    queryFn: () => remindersApi.listSuggestions(workspaceId!, questionnaireResponseId),
    enabled: !!workspaceId,
  });

  const acceptMutation = useMutation({
    mutationFn: ({
      suggestionId,
      overrides,
    }: {
      suggestionId: string;
      overrides?: Partial<ReminderCreate>;
    }) => remindersApi.acceptSuggestion(workspaceId!, suggestionId, overrides),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminderSuggestions", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (suggestionId: string) => remindersApi.rejectSuggestion(workspaceId!, suggestionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminderSuggestions", workspaceId] });
    },
  });

  return {
    suggestions: suggestions || [],
    pendingSuggestions: (suggestions || []).filter((s) => s.status === "pending"),
    isLoading,
    error,
    refetch,
    acceptSuggestion: acceptMutation.mutateAsync,
    rejectSuggestion: rejectMutation.mutateAsync,
    isAccepting: acceptMutation.isPending,
    isRejecting: rejectMutation.isPending,
  };
}

// ============ Bulk Operations Hook ============

export function useBulkReminderOperations(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const bulkAssignMutation = useMutation({
    mutationFn: ({
      instanceIds,
      ownerId,
      teamId,
    }: {
      instanceIds: string[];
      ownerId?: string;
      teamId?: string;
    }) => remindersApi.bulkAssign(workspaceId!, { instance_ids: instanceIds, owner_id: ownerId, team_id: teamId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminderInstances", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["myReminders", workspaceId] });
    },
  });

  const bulkCompleteMutation = useMutation({
    mutationFn: ({ instanceIds, notes }: { instanceIds: string[]; notes?: string }) =>
      remindersApi.bulkComplete(workspaceId!, { instance_ids: instanceIds, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminderInstances", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["reminderDashboard", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["myReminders", workspaceId] });
    },
  });

  return {
    bulkAssign: bulkAssignMutation.mutateAsync,
    bulkComplete: bulkCompleteMutation.mutateAsync,
    isBulkAssigning: bulkAssignMutation.isPending,
    isBulkCompleting: bulkCompleteMutation.isPending,
  };
}
