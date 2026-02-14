import { api } from "./api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeaveType {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string | null;
  is_paid: boolean;
  requires_approval: boolean;
  min_notice_days: number;
  allows_half_day: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveTypeCreate {
  name: string;
  slug: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  is_paid?: boolean;
  requires_approval?: boolean;
  min_notice_days?: number;
  allows_half_day?: boolean;
  sort_order?: number;
}

export interface LeavePolicy {
  id: string;
  workspace_id: string;
  leave_type_id: string;
  leave_type: LeaveType | null;
  annual_quota: number;
  accrual_type: string;
  carry_forward_enabled: boolean;
  max_carry_forward_days: number;
  applicable_roles: string[];
  applicable_team_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeavePolicyCreate {
  leave_type_id: string;
  annual_quota?: number;
  accrual_type?: string;
  carry_forward_enabled?: boolean;
  max_carry_forward_days?: number;
  applicable_roles?: string[];
  applicable_team_ids?: string[];
}

export interface DeveloperBrief {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface LeaveRequest {
  id: string;
  workspace_id: string;
  developer_id: string;
  leave_type_id: string;
  developer: DeveloperBrief | null;
  leave_type: LeaveType | null;
  approver: DeveloperBrief | null;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  half_day_period: string | null;
  total_days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | "withdrawn";
  approver_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequestCreate {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  is_half_day?: boolean;
  half_day_period?: string | null;
  reason?: string | null;
}

export interface LeaveBalance {
  id: string;
  workspace_id: string;
  developer_id: string;
  leave_type_id: string;
  leave_type: LeaveType | null;
  year: number;
  total_allocated: number;
  used: number;
  pending: number;
  carried_forward: number;
  available: number;
}

export interface Holiday {
  id: string;
  workspace_id: string;
  name: string;
  date: string;
  description: string | null;
  is_optional: boolean;
  applicable_team_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface HolidayCreate {
  name: string;
  date: string;
  description?: string | null;
  is_optional?: boolean;
  applicable_team_ids?: string[];
}

export interface TeamCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: "leave" | "booking" | "holiday";
  color: string;
  all_day: boolean;
  developer_id: string | null;
  developer_name: string | null;
  developer_avatar: string | null;
  metadata: Record<string, unknown>;
}

export interface TeamCalendarResponse {
  events: TeamCalendarEvent[];
  total: number;
}

export interface WhoIsOutEntry {
  developer_id: string;
  developer_name: string | null;
  developer_avatar: string | null;
  leave_type: string;
  leave_type_color: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  half_day_period: string | null;
}

export interface WhoIsOutResponse {
  date: string;
  entries: WhoIsOutEntry[];
  total_out: number;
}

export interface AvailabilitySummary {
  date: string;
  total: number;
  available: number;
  on_leave: number;
  on_holiday: number;
}

// ─── API Client ───────────────────────────────────────────────────────────────

export const leaveApi = {
  // Leave Types
  types: {
    list: async (workspaceId: string, includeInactive = false) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/types`, {
        params: { include_inactive: includeInactive },
      });
      return response.data as LeaveType[];
    },
    create: async (workspaceId: string, data: LeaveTypeCreate) => {
      const response = await api.post(`/workspaces/${workspaceId}/leave/types`, data);
      return response.data as LeaveType;
    },
    update: async (workspaceId: string, typeId: string, data: Partial<LeaveTypeCreate>) => {
      const response = await api.put(`/workspaces/${workspaceId}/leave/types/${typeId}`, data);
      return response.data as LeaveType;
    },
    delete: async (workspaceId: string, typeId: string) => {
      await api.delete(`/workspaces/${workspaceId}/leave/types/${typeId}`);
    },
  },

  // Leave Policies
  policies: {
    list: async (workspaceId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/policies`);
      return response.data as LeavePolicy[];
    },
    create: async (workspaceId: string, data: LeavePolicyCreate) => {
      const response = await api.post(`/workspaces/${workspaceId}/leave/policies`, data);
      return response.data as LeavePolicy;
    },
    update: async (workspaceId: string, policyId: string, data: Partial<LeavePolicyCreate>) => {
      const response = await api.put(`/workspaces/${workspaceId}/leave/policies/${policyId}`, data);
      return response.data as LeavePolicy;
    },
    delete: async (workspaceId: string, policyId: string) => {
      await api.delete(`/workspaces/${workspaceId}/leave/policies/${policyId}`);
    },
  },

  // Leave Requests
  requests: {
    list: async (workspaceId: string, params?: {
      developer_id?: string;
      status?: string;
      start_date?: string;
      end_date?: string;
    }) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/requests`, { params });
      return response.data as LeaveRequest[];
    },
    listMy: async (workspaceId: string, status?: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/requests/my`, {
        params: status ? { status } : undefined,
      });
      return response.data as LeaveRequest[];
    },
    submit: async (workspaceId: string, data: LeaveRequestCreate) => {
      const response = await api.post(`/workspaces/${workspaceId}/leave/requests`, data);
      return response.data as LeaveRequest;
    },
    approve: async (workspaceId: string, requestId: string) => {
      const response = await api.put(`/workspaces/${workspaceId}/leave/requests/${requestId}/approve`);
      return response.data as LeaveRequest;
    },
    reject: async (workspaceId: string, requestId: string, reason?: string) => {
      const response = await api.put(`/workspaces/${workspaceId}/leave/requests/${requestId}/reject`, { reason });
      return response.data as LeaveRequest;
    },
    cancel: async (workspaceId: string, requestId: string) => {
      const response = await api.put(`/workspaces/${workspaceId}/leave/requests/${requestId}/cancel`);
      return response.data as LeaveRequest;
    },
    withdraw: async (workspaceId: string, requestId: string) => {
      const response = await api.put(`/workspaces/${workspaceId}/leave/requests/${requestId}/withdraw`);
      return response.data as LeaveRequest;
    },
  },

  // Leave Balances
  balances: {
    my: async (workspaceId: string, year?: number) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/balance`, {
        params: year ? { year } : undefined,
      });
      return response.data as LeaveBalance[];
    },
    developer: async (workspaceId: string, developerId: string, year?: number) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/balance/${developerId}`, {
        params: year ? { year } : undefined,
      });
      return response.data as LeaveBalance[];
    },
    team: async (workspaceId: string, teamId: string, year?: number) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/balance/team/${teamId}`, {
        params: year ? { year } : undefined,
      });
      return response.data as LeaveBalance[];
    },
  },

  // Approvals
  approvals: {
    pending: async (workspaceId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/approvals/pending`);
      return response.data as LeaveRequest[];
    },
  },

  // Holidays
  holidays: {
    list: async (workspaceId: string, year?: number) => {
      const response = await api.get(`/workspaces/${workspaceId}/leave/holidays`, {
        params: year ? { year } : undefined,
      });
      return response.data as Holiday[];
    },
    create: async (workspaceId: string, data: HolidayCreate) => {
      const response = await api.post(`/workspaces/${workspaceId}/leave/holidays`, data);
      return response.data as Holiday;
    },
    update: async (workspaceId: string, holidayId: string, data: Partial<HolidayCreate>) => {
      const response = await api.put(`/workspaces/${workspaceId}/leave/holidays/${holidayId}`, data);
      return response.data as Holiday;
    },
    delete: async (workspaceId: string, holidayId: string) => {
      await api.delete(`/workspaces/${workspaceId}/leave/holidays/${holidayId}`);
    },
  },

  // Team Calendar
  calendar: {
    team: async (workspaceId: string, params: {
      start_date: string;
      end_date: string;
      team_id?: string;
      event_types?: string[];
    }) => {
      const response = await api.get(`/workspaces/${workspaceId}/calendar/team`, { params });
      return response.data as TeamCalendarResponse;
    },
    whoIsOut: async (workspaceId: string, date?: string, teamId?: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/calendar/who-is-out`, {
        params: { date, team_id: teamId },
      });
      return response.data as WhoIsOutResponse;
    },
    availabilitySummary: async (workspaceId: string, date?: string, teamId?: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/calendar/availability-summary`, {
        params: { date, team_id: teamId },
      });
      return response.data as AvailabilitySummary;
    },
  },
};
