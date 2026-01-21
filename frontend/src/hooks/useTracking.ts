"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  trackingApi,
  Standup,
  StandupCreate,
  StandupListResponse,
  WorkLog,
  WorkLogCreate,
  WorkLogListResponse,
  TimeEntry,
  TimeEntryCreate,
  TimeEntryListResponse,
  Blocker,
  BlockerCreate,
  BlockerListResponse,
  IndividualDashboard,
  TeamDashboard,
  SlackChannelConfig,
  SlackChannelConfigCreate,
  TeamAnalytics,
  BlockerAnalytics,
  TimeReport,
} from "@/lib/api";

// ==================== Standup Hooks ====================

export function useMyStandups(options?: { limit?: number; sprintId?: string }) {
  return useQuery<StandupListResponse>({
    queryKey: ["standups", "me", options],
    queryFn: () => trackingApi.getMyStandups({ limit: options?.limit, sprint_id: options?.sprintId }),
  });
}

export function useTeamStandups(teamId: string, date?: string) {
  return useQuery<Standup[]>({
    queryKey: ["standups", "team", teamId, date],
    queryFn: () => trackingApi.getTeamStandups(teamId, date),
    enabled: !!teamId,
  });
}

export function useSubmitStandup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StandupCreate) => trackingApi.submitStandup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["standups"] });
      queryClient.invalidateQueries({ queryKey: ["tracking", "dashboard"] });
    },
  });
}

// ==================== Work Log Hooks ====================

export function useMyWorkLogs(options?: { limit?: number; taskId?: string }) {
  return useQuery<WorkLogListResponse>({
    queryKey: ["workLogs", "me", options],
    queryFn: () => trackingApi.getMyLogs({ limit: options?.limit, task_id: options?.taskId }),
  });
}

export function useTaskLogs(taskId: string) {
  return useQuery<WorkLog[]>({
    queryKey: ["workLogs", "task", taskId],
    queryFn: () => trackingApi.getTaskLogs(taskId),
    enabled: !!taskId,
  });
}

export function useCreateWorkLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: WorkLogCreate) => trackingApi.createLog(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workLogs"] });
      queryClient.invalidateQueries({ queryKey: ["tracking", "dashboard"] });
    },
  });
}

// ==================== Time Entry Hooks ====================

export function useMyTimeEntries(dateRange?: { start?: string; end?: string }) {
  return useQuery<TimeEntryListResponse>({
    queryKey: ["timeEntries", "me", dateRange],
    queryFn: () => trackingApi.getMyTimeEntries({ start_date: dateRange?.start, end_date: dateRange?.end }),
  });
}

export function useTaskTimeSummary(taskId: string) {
  return useQuery({
    queryKey: ["timeEntries", "task", taskId],
    queryFn: () => trackingApi.getTaskTime(taskId),
    enabled: !!taskId,
  });
}

export function useLogTime() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TimeEntryCreate) => trackingApi.logTime(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeEntries"] });
      queryClient.invalidateQueries({ queryKey: ["tracking", "dashboard"] });
    },
  });
}

// ==================== Blocker Hooks ====================

export function useActiveBlockers(teamId?: string) {
  return useQuery<BlockerListResponse>({
    queryKey: ["blockers", "active", teamId],
    queryFn: () => trackingApi.getActiveBlockers(teamId),
  });
}

export function useReportBlocker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BlockerCreate) => trackingApi.reportBlocker(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockers"] });
      queryClient.invalidateQueries({ queryKey: ["tracking", "dashboard"] });
    },
  });
}

export function useResolveBlocker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ blockerId, notes }: { blockerId: string; notes?: string }) =>
      trackingApi.resolveBlocker(blockerId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockers"] });
      queryClient.invalidateQueries({ queryKey: ["tracking", "dashboard"] });
    },
  });
}

export function useEscalateBlocker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      blockerId,
      escalateToId,
      notes,
    }: {
      blockerId: string;
      escalateToId: string;
      notes?: string;
    }) => trackingApi.escalateBlocker(blockerId, escalateToId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockers"] });
      queryClient.invalidateQueries({ queryKey: ["tracking", "dashboard"] });
    },
  });
}

// ==================== Dashboard Hooks ====================

export function useTrackingDashboard() {
  return useQuery<IndividualDashboard>({
    queryKey: ["tracking", "dashboard", "me"],
    queryFn: () => trackingApi.getMyDashboard(),
  });
}

export function useTeamTrackingDashboard(teamId: string) {
  return useQuery<TeamDashboard>({
    queryKey: ["tracking", "dashboard", "team", teamId],
    queryFn: () => trackingApi.getTeamDashboard(teamId),
    enabled: !!teamId,
  });
}

// ==================== Channel Config Hooks ====================

export function useChannelConfigs(workspaceId: string) {
  return useQuery<SlackChannelConfig[]>({
    queryKey: ["channelConfigs", workspaceId],
    queryFn: () => trackingApi.getChannelConfigs(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useCreateChannelConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SlackChannelConfigCreate) => trackingApi.createChannelConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channelConfigs"] });
    },
  });
}

export function useUpdateChannelConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      configId,
      data,
    }: {
      configId: string;
      data: Partial<SlackChannelConfigCreate & { is_active?: boolean }>;
    }) => trackingApi.updateChannelConfig(configId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channelConfigs"] });
    },
  });
}

export function useDeleteChannelConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (configId: string) => trackingApi.deleteChannelConfig(configId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channelConfigs"] });
    },
  });
}

// ==================== Analytics Hooks ====================

export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

export function useTeamAnalytics(teamId: string, dateRange?: DateRangeParams) {
  return useQuery<TeamAnalytics>({
    queryKey: ["tracking", "analytics", "team", teamId, dateRange],
    queryFn: () =>
      trackingApi.getTeamAnalytics(teamId, {
        start_date: dateRange?.startDate,
        end_date: dateRange?.endDate,
      }),
    enabled: !!teamId,
  });
}

export function useBlockerAnalytics(teamId: string, dateRange?: DateRangeParams) {
  return useQuery<BlockerAnalytics>({
    queryKey: ["tracking", "analytics", "blockers", teamId, dateRange],
    queryFn: () =>
      trackingApi.getBlockerAnalytics(teamId, {
        start_date: dateRange?.startDate,
        end_date: dateRange?.endDate,
      }),
    enabled: !!teamId,
  });
}

export function useTimeReport(
  dateRange?: DateRangeParams,
  groupBy?: "day" | "week" | "project" | "task"
) {
  return useQuery<TimeReport>({
    queryKey: ["tracking", "analytics", "time", dateRange, groupBy],
    queryFn: () =>
      trackingApi.getTimeReport({
        start_date: dateRange?.startDate,
        end_date: dateRange?.endDate,
        group_by: groupBy,
      }),
  });
}

// ==================== Export Hooks ====================

export function useExportStandups() {
  return useMutation({
    mutationFn: (options: {
      startDate: string;
      endDate: string;
      format: "csv" | "pdf" | "json";
      teamId?: string;
    }) =>
      trackingApi.exportStandups({
        start_date: options.startDate,
        end_date: options.endDate,
        format: options.format,
        team_id: options.teamId,
      }),
    onSuccess: (blob, variables) => {
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `standups_${variables.startDate}_${variables.endDate}.${variables.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

export function useExportTimesheet() {
  return useMutation({
    mutationFn: (options: {
      startDate: string;
      endDate: string;
      format: "csv" | "pdf" | "json";
    }) =>
      trackingApi.exportTimesheet({
        start_date: options.startDate,
        end_date: options.endDate,
        format: options.format,
      }),
    onSuccess: (blob, variables) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timesheet_${variables.startDate}_${variables.endDate}.${variables.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

export function useExportBlockers() {
  return useMutation({
    mutationFn: (options: {
      startDate: string;
      endDate: string;
      format: "csv" | "pdf" | "json";
      teamId?: string;
    }) =>
      trackingApi.exportBlockers({
        start_date: options.startDate,
        end_date: options.endDate,
        format: options.format,
        team_id: options.teamId,
      }),
    onSuccess: (blob, variables) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blockers_${variables.startDate}_${variables.endDate}.${variables.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

// ==================== Combined Hook ====================

export function useTracking(teamId?: string) {
  const dashboard = useTrackingDashboard();
  const teamDashboard = useTeamTrackingDashboard(teamId || "");
  const blockers = useActiveBlockers(teamId);
  const submitStandup = useSubmitStandup();
  const createWorkLog = useCreateWorkLog();
  const logTime = useLogTime();
  const reportBlocker = useReportBlocker();
  const resolveBlocker = useResolveBlocker();

  return {
    // Data
    dashboard: dashboard.data,
    teamDashboard: teamDashboard.data,
    blockers: blockers.data,

    // Loading states
    isDashboardLoading: dashboard.isLoading,
    isTeamDashboardLoading: teamDashboard.isLoading,
    isBlockersLoading: blockers.isLoading,

    // Mutations
    submitStandup: submitStandup.mutateAsync,
    isSubmittingStandup: submitStandup.isPending,

    createWorkLog: createWorkLog.mutateAsync,
    isCreatingWorkLog: createWorkLog.isPending,

    logTime: logTime.mutateAsync,
    isLoggingTime: logTime.isPending,

    reportBlocker: reportBlocker.mutateAsync,
    isReportingBlocker: reportBlocker.isPending,

    resolveBlocker: resolveBlocker.mutateAsync,
    isResolvingBlocker: resolveBlocker.isPending,

    // Errors
    dashboardError: dashboard.error,
    teamDashboardError: teamDashboard.error,
    blockersError: blockers.error,
  };
}
