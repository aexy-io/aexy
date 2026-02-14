"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  leaveApi,
  LeaveType,
  LeavePolicy,
  LeaveRequest,
  LeaveBalance,
  Holiday,
  LeaveTypeCreate,
  LeavePolicyCreate,
  LeaveRequestCreate,
  HolidayCreate,
  TeamCalendarResponse,
  WhoIsOutResponse,
  AvailabilitySummary,
} from "@/lib/leave-api";
import { useWorkspace } from "./useWorkspace";

function useWorkspaceId() {
  const { currentWorkspaceId } = useWorkspace();
  return currentWorkspaceId;
}

// ─── Leave Types ──────────────────────────────────────────────────────────────

export function useLeaveTypes(includeInactive = false) {
  const workspaceId = useWorkspaceId();
  return useQuery<LeaveType[]>({
    queryKey: ["leaveTypes", workspaceId, includeInactive],
    queryFn: () => leaveApi.types.list(workspaceId!, includeInactive),
    enabled: !!workspaceId,
  });
}

export function useLeaveTypeMutations() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();

  const create = useMutation({
    mutationFn: (data: LeaveTypeCreate) =>
      leaveApi.types.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaveTypes"] });
    },
  });

  const update = useMutation({
    mutationFn: ({ typeId, data }: { typeId: string; data: Partial<LeaveTypeCreate> }) =>
      leaveApi.types.update(workspaceId!, typeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaveTypes"] });
    },
  });

  const remove = useMutation({
    mutationFn: (typeId: string) =>
      leaveApi.types.delete(workspaceId!, typeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaveTypes"] });
    },
  });

  return { create, update, remove };
}

// ─── Leave Balances ───────────────────────────────────────────────────────────

export function useLeaveBalances(year?: number) {
  const workspaceId = useWorkspaceId();
  return useQuery<LeaveBalance[]>({
    queryKey: ["leaveBalances", workspaceId, year],
    queryFn: () => leaveApi.balances.my(workspaceId!, year),
    enabled: !!workspaceId,
  });
}

export function useDeveloperLeaveBalances(developerId: string, year?: number) {
  const workspaceId = useWorkspaceId();
  return useQuery<LeaveBalance[]>({
    queryKey: ["leaveBalances", workspaceId, developerId, year],
    queryFn: () => leaveApi.balances.developer(workspaceId!, developerId, year),
    enabled: !!workspaceId && !!developerId,
  });
}

export function useTeamLeaveBalances(teamId: string, year?: number) {
  const workspaceId = useWorkspaceId();
  return useQuery<LeaveBalance[]>({
    queryKey: ["leaveBalances", "team", workspaceId, teamId, year],
    queryFn: () => leaveApi.balances.team(workspaceId!, teamId, year),
    enabled: !!workspaceId && !!teamId,
  });
}

// ─── Leave Requests ───────────────────────────────────────────────────────────

export function useMyLeaveRequests(status?: string) {
  const workspaceId = useWorkspaceId();
  return useQuery<LeaveRequest[]>({
    queryKey: ["leaveRequests", "my", workspaceId, status],
    queryFn: () => leaveApi.requests.listMy(workspaceId!, status),
    enabled: !!workspaceId,
  });
}

export function useLeaveRequests(params?: {
  developer_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
}) {
  const workspaceId = useWorkspaceId();
  return useQuery<LeaveRequest[]>({
    queryKey: ["leaveRequests", workspaceId, params],
    queryFn: () => leaveApi.requests.list(workspaceId!, params),
    enabled: !!workspaceId,
  });
}

export function useLeaveRequestMutations() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["leaveRequests"] });
    queryClient.invalidateQueries({ queryKey: ["leaveBalances"] });
    queryClient.invalidateQueries({ queryKey: ["pendingApprovals"] });
    queryClient.invalidateQueries({ queryKey: ["whoIsOut"] });
    queryClient.invalidateQueries({ queryKey: ["teamCalendar"] });
  };

  const submit = useMutation({
    mutationFn: (data: LeaveRequestCreate) =>
      leaveApi.requests.submit(workspaceId!, data),
    onSuccess: invalidateAll,
  });

  const approve = useMutation({
    mutationFn: (requestId: string) =>
      leaveApi.requests.approve(workspaceId!, requestId),
    onSuccess: invalidateAll,
  });

  const reject = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      leaveApi.requests.reject(workspaceId!, requestId, reason),
    onSuccess: invalidateAll,
  });

  const cancel = useMutation({
    mutationFn: (requestId: string) =>
      leaveApi.requests.cancel(workspaceId!, requestId),
    onSuccess: invalidateAll,
  });

  const withdraw = useMutation({
    mutationFn: (requestId: string) =>
      leaveApi.requests.withdraw(workspaceId!, requestId),
    onSuccess: invalidateAll,
  });

  return { submit, approve, reject, cancel, withdraw };
}

// ─── Pending Approvals ────────────────────────────────────────────────────────

export function usePendingApprovals() {
  const workspaceId = useWorkspaceId();
  return useQuery<LeaveRequest[]>({
    queryKey: ["pendingApprovals", workspaceId],
    queryFn: () => leaveApi.approvals.pending(workspaceId!),
    enabled: !!workspaceId,
  });
}

// ─── Holidays ─────────────────────────────────────────────────────────────────

export function useHolidays(year?: number) {
  const workspaceId = useWorkspaceId();
  return useQuery<Holiday[]>({
    queryKey: ["holidays", workspaceId, year],
    queryFn: () => leaveApi.holidays.list(workspaceId!, year),
    enabled: !!workspaceId,
  });
}

export function useHolidayMutations() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();

  const create = useMutation({
    mutationFn: (data: HolidayCreate) =>
      leaveApi.holidays.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
    },
  });

  const update = useMutation({
    mutationFn: ({ holidayId, data }: { holidayId: string; data: Partial<HolidayCreate> }) =>
      leaveApi.holidays.update(workspaceId!, holidayId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
    },
  });

  const remove = useMutation({
    mutationFn: (holidayId: string) =>
      leaveApi.holidays.delete(workspaceId!, holidayId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
    },
  });

  return { create, update, remove };
}

// ─── Leave Policies ───────────────────────────────────────────────────────────

export function useLeavePolicies() {
  const workspaceId = useWorkspaceId();
  return useQuery<LeavePolicy[]>({
    queryKey: ["leavePolicies", workspaceId],
    queryFn: () => leaveApi.policies.list(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useLeavePolicyMutations() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();

  const create = useMutation({
    mutationFn: (data: LeavePolicyCreate) =>
      leaveApi.policies.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leavePolicies"] });
    },
  });

  const update = useMutation({
    mutationFn: ({ policyId, data }: { policyId: string; data: Partial<LeavePolicyCreate> }) =>
      leaveApi.policies.update(workspaceId!, policyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leavePolicies"] });
    },
  });

  const remove = useMutation({
    mutationFn: (policyId: string) =>
      leaveApi.policies.delete(workspaceId!, policyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leavePolicies"] });
    },
  });

  return { create, update, remove };
}

// ─── Team Calendar ────────────────────────────────────────────────────────────

export function useTeamCalendar(params: {
  start_date: string;
  end_date: string;
  team_id?: string;
  event_types?: string[];
}) {
  const workspaceId = useWorkspaceId();
  return useQuery<TeamCalendarResponse>({
    queryKey: ["teamCalendar", workspaceId, params],
    queryFn: () => leaveApi.calendar.team(workspaceId!, params),
    enabled: !!workspaceId && !!params.start_date && !!params.end_date,
  });
}

export function useWhoIsOut(date?: string, teamId?: string) {
  const workspaceId = useWorkspaceId();
  return useQuery<WhoIsOutResponse>({
    queryKey: ["whoIsOut", workspaceId, date, teamId],
    queryFn: () => leaveApi.calendar.whoIsOut(workspaceId!, date, teamId),
    enabled: !!workspaceId,
  });
}

export function useAvailabilitySummary(date?: string, teamId?: string) {
  const workspaceId = useWorkspaceId();
  return useQuery<AvailabilitySummary>({
    queryKey: ["availabilitySummary", workspaceId, date, teamId],
    queryFn: () => leaveApi.calendar.availabilitySummary(workspaceId!, date, teamId),
    enabled: !!workspaceId,
  });
}
