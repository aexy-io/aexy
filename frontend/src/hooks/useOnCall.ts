"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  oncallApi,
  googleCalendarApi,
  OnCallConfig,
  OnCallSchedule,
  OnCallScheduleListResponse,
  CurrentOnCallResponse,
  SwapRequest,
  GoogleCalendarStatus,
  GoogleCalendarInfo,
} from "@/lib/api";

// ============ On-Call Config Hooks ============

export function useOnCallConfig(workspaceId: string | null, teamId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery<OnCallConfig | null>({
    queryKey: ["oncallConfig", workspaceId, teamId],
    queryFn: () => oncallApi.getConfig(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
  });

  const enableMutation = useMutation({
    mutationFn: (configData: Parameters<typeof oncallApi.enableOnCall>[2]) =>
      oncallApi.enableOnCall(workspaceId!, teamId!, configData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallConfig", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["currentOnCall", workspaceId, teamId] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => oncallApi.disableOnCall(workspaceId!, teamId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallConfig", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["currentOnCall", workspaceId, teamId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof oncallApi.updateConfig>[2]) =>
      oncallApi.updateConfig(workspaceId!, teamId!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallConfig", workspaceId, teamId] });
    },
  });

  return {
    config,
    isLoading,
    error,
    refetch,
    enableOnCall: enableMutation.mutateAsync,
    disableOnCall: disableMutation.mutateAsync,
    updateConfig: updateMutation.mutateAsync,
    isEnabling: enableMutation.isPending,
    isDisabling: disableMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

// ============ On-Call Schedule Hooks ============

export function useOnCallSchedules(
  workspaceId: string | null,
  teamId: string | null,
  startDate: string | null,
  endDate: string | null
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<OnCallScheduleListResponse>({
    queryKey: ["oncallSchedules", workspaceId, teamId, startDate, endDate],
    queryFn: () => oncallApi.getSchedules(workspaceId!, teamId!, startDate!, endDate!),
    enabled: !!workspaceId && !!teamId && !!startDate && !!endDate,
  });

  const createMutation = useMutation({
    mutationFn: (schedule: { developer_id: string; start_time: string; end_time: string }) =>
      oncallApi.createSchedule(workspaceId!, teamId!, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallSchedules", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["currentOnCall", workspaceId, teamId] });
    },
  });

  const createBulkMutation = useMutation({
    mutationFn: (schedules: Array<{ developer_id: string; start_time: string; end_time: string }>) =>
      oncallApi.createBulkSchedules(workspaceId!, teamId!, schedules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallSchedules", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["currentOnCall", workspaceId, teamId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      scheduleId,
      updates,
    }: {
      scheduleId: string;
      updates: Partial<{ developer_id: string; start_time: string; end_time: string }>;
    }) => oncallApi.updateSchedule(workspaceId!, teamId!, scheduleId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallSchedules", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["currentOnCall", workspaceId, teamId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => oncallApi.deleteSchedule(workspaceId!, teamId!, scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallSchedules", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["currentOnCall", workspaceId, teamId] });
    },
  });

  return {
    schedules: data?.schedules || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createSchedule: createMutation.mutateAsync,
    createBulkSchedules: createBulkMutation.mutateAsync,
    updateSchedule: updateMutation.mutateAsync,
    deleteSchedule: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isCreatingBulk: createBulkMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============ Current On-Call Hook ============

export function useCurrentOnCall(workspaceId: string | null, teamId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<CurrentOnCallResponse>({
    queryKey: ["currentOnCall", workspaceId, teamId],
    queryFn: () => oncallApi.getCurrentOnCall(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
    refetchInterval: 60000, // Refetch every minute
  });

  return {
    isActive: data?.is_active || false,
    currentSchedule: data?.schedule || null,
    nextSchedule: data?.next_schedule || null,
    isLoading,
    error,
    refetch,
  };
}

// ============ Swap Request Hooks ============

export function useSwapRequests(workspaceId: string | null, teamId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: swapRequests,
    isLoading,
    error,
    refetch,
  } = useQuery<SwapRequest[]>({
    queryKey: ["swapRequests", workspaceId, teamId],
    queryFn: () => oncallApi.getSwapRequests(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
  });

  const requestSwapMutation = useMutation({
    mutationFn: ({
      scheduleId,
      targetId,
      message,
    }: {
      scheduleId: string;
      targetId: string;
      message?: string;
    }) => oncallApi.requestSwap(workspaceId!, teamId!, scheduleId, targetId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swapRequests", workspaceId, teamId] });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (swapId: string) => oncallApi.acceptSwap(workspaceId!, teamId!, swapId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swapRequests", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["oncallSchedules", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["currentOnCall", workspaceId, teamId] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: ({ swapId, responseMessage }: { swapId: string; responseMessage?: string }) =>
      oncallApi.declineSwap(workspaceId!, teamId!, swapId, responseMessage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swapRequests", workspaceId, teamId] });
    },
  });

  return {
    swapRequests: swapRequests || [],
    isLoading,
    error,
    refetch,
    requestSwap: requestSwapMutation.mutateAsync,
    acceptSwap: acceptMutation.mutateAsync,
    declineSwap: declineMutation.mutateAsync,
    isRequesting: requestSwapMutation.isPending,
    isAccepting: acceptMutation.isPending,
    isDeclining: declineMutation.isPending,
  };
}

// ============ Override Hook ============

export function useOnCallOverride(workspaceId: string | null, teamId: string | null) {
  const queryClient = useQueryClient();

  const overrideMutation = useMutation({
    mutationFn: ({
      scheduleId,
      newDeveloperId,
      reason,
    }: {
      scheduleId: string;
      newDeveloperId: string;
      reason?: string;
    }) => oncallApi.createOverride(workspaceId!, teamId!, scheduleId, newDeveloperId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallSchedules", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["currentOnCall", workspaceId, teamId] });
    },
  });

  return {
    createOverride: overrideMutation.mutateAsync,
    isCreating: overrideMutation.isPending,
  };
}

// ============ Google Calendar Hooks ============

export function useGoogleCalendarStatus(workspaceId: string | null) {
  const {
    data: status,
    isLoading,
    error,
    refetch,
  } = useQuery<GoogleCalendarStatus>({
    queryKey: ["googleCalendarStatus", workspaceId],
    queryFn: () => googleCalendarApi.getStatus(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    status,
    isConnected: status?.is_connected || false,
    calendarEmail: status?.calendar_email || null,
    lastSyncAt: status?.last_sync_at || null,
    lastError: status?.last_error || null,
    isLoading,
    error,
    refetch,
  };
}

export function useGoogleCalendarConnect(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const getUrlMutation = useMutation({
    mutationFn: () => googleCalendarApi.getConnectUrl(workspaceId!),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => googleCalendarApi.disconnect(workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["googleCalendarStatus", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["googleCalendars", workspaceId] });
    },
  });

  return {
    getConnectUrl: getUrlMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    isGettingUrl: getUrlMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
  };
}

export function useGoogleCalendars(workspaceId: string | null, isConnected: boolean = false) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ calendars: GoogleCalendarInfo[] }>({
    queryKey: ["googleCalendars", workspaceId],
    queryFn: () => googleCalendarApi.listCalendars(workspaceId!),
    enabled: !!workspaceId && isConnected,
  });

  const selectMutation = useMutation({
    mutationFn: ({ teamId, calendarId }: { teamId: string; calendarId: string }) =>
      googleCalendarApi.selectCalendar(workspaceId!, teamId, calendarId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncallConfig"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (teamId: string) => googleCalendarApi.sync(workspaceId!, teamId),
  });

  return {
    calendars: data?.calendars || [],
    isLoading,
    error,
    refetch,
    selectCalendar: selectMutation.mutateAsync,
    syncCalendar: syncMutation.mutateAsync,
    isSelecting: selectMutation.isPending,
    isSyncing: syncMutation.isPending,
  };
}
