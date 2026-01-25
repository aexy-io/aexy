import { api } from "./api";

// Types

export type UptimeCheckType = "http" | "tcp" | "websocket";
export type UptimeMonitorStatus = "up" | "down" | "degraded" | "paused" | "unknown";
export type UptimeIncidentStatus = "ongoing" | "resolved" | "acknowledged";
export type UptimeErrorType = "timeout" | "connection_refused" | "ssl_error" | "dns_error" | "unexpected_response" | "invalid_status_code" | "unknown";

export interface UptimeMonitor {
  id: string;
  workspace_id: string;
  name: string;
  check_type: UptimeCheckType;
  url: string | null;
  host: string | null;
  port: number | null;
  http_method: string;
  expected_status_codes: number[];
  request_headers: Record<string, string>;
  request_body: string | null;
  verify_ssl: boolean;
  follow_redirects: boolean;
  ws_message: string | null;
  ws_expected_response: string | null;
  check_interval_seconds: number;
  timeout_seconds: number;
  consecutive_failures_threshold: number;
  current_status: UptimeMonitorStatus;
  last_check_at: string | null;
  next_check_at: string | null;
  last_response_time_ms: number | null;
  consecutive_failures: number;
  notification_channels: string[];
  slack_channel_id: string | null;
  webhook_url: string | null;
  notify_on_recovery: boolean;
  team_id: string | null;
  team_name?: string | null;
  is_active: boolean;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  uptime_percentage_24h?: number;
  avg_response_time_24h?: number;
}

export interface UptimeMonitorCreate {
  name: string;
  check_type: UptimeCheckType;
  url?: string;
  host?: string;
  port?: number;
  http_method?: string;
  expected_status_codes?: number[];
  request_headers?: Record<string, string>;
  request_body?: string;
  verify_ssl?: boolean;
  follow_redirects?: boolean;
  ws_message?: string;
  ws_expected_response?: string;
  check_interval_seconds?: number;
  timeout_seconds?: number;
  consecutive_failures_threshold?: number;
  notification_channels?: string[];
  slack_channel_id?: string;
  webhook_url?: string;
  notify_on_recovery?: boolean;
  team_id?: string;
}

export interface UptimeMonitorUpdate {
  name?: string;
  url?: string;
  host?: string;
  port?: number;
  http_method?: string;
  expected_status_codes?: number[];
  request_headers?: Record<string, string>;
  request_body?: string;
  verify_ssl?: boolean;
  follow_redirects?: boolean;
  ws_message?: string;
  ws_expected_response?: string;
  check_interval_seconds?: number;
  timeout_seconds?: number;
  consecutive_failures_threshold?: number;
  notification_channels?: string[];
  slack_channel_id?: string;
  webhook_url?: string;
  notify_on_recovery?: boolean;
  team_id?: string;
}

export interface UptimeCheck {
  id: string;
  monitor_id: string;
  is_up: boolean;
  status_code: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  error_type: UptimeErrorType | null;
  ssl_expiry_days: number | null;
  checked_at: string;
}

export interface UptimeIncident {
  id: string;
  monitor_id: string;
  workspace_id: string;
  ticket_id: string | null;
  status: UptimeIncidentStatus;
  started_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by_id: string | null;
  first_error_message: string | null;
  last_error_message: string | null;
  total_checks: number;
  failed_checks: number;
  root_cause: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  monitor?: UptimeMonitor;
  acknowledged_by?: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

export interface UptimeIncidentUpdate {
  root_cause?: string;
  resolution_notes?: string;
}

export interface MonitorStats {
  uptime_percentage_24h: number;
  uptime_percentage_7d: number;
  uptime_percentage_30d: number;
  avg_response_time_24h: number | null;
  avg_response_time_7d: number | null;
  avg_response_time_30d: number | null;
  total_checks_24h: number;
  failed_checks_24h: number;
  incidents_24h: number;
  total_incidents: number;
  current_streak_up: number;
  longest_streak_up: number;
}

export interface WorkspaceUptimeStats {
  total_monitors: number;
  active_monitors: number;
  monitors_up: number;
  monitors_down: number;
  monitors_degraded: number;
  monitors_paused: number;
  ongoing_incidents: number;
  incidents_24h: number;
  avg_uptime_24h: number | null;
}

// API functions

export const uptimeApi = {
  // Monitors
  monitors: {
    list: async (workspaceId: string, params?: { status?: UptimeMonitorStatus; is_active?: boolean; team_id?: string }) => {
      const response = await api.get(`/workspaces/${workspaceId}/uptime/monitors`, { params });
      // Backend returns array directly
      const data = response.data;
      const monitors = Array.isArray(data) ? data : (data?.monitors || data?.items || []);
      return { monitors: monitors as UptimeMonitor[], total: monitors.length };
    },

    get: async (workspaceId: string, monitorId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/uptime/monitors/${monitorId}`);
      return response.data as UptimeMonitor;
    },

    create: async (workspaceId: string, data: UptimeMonitorCreate) => {
      const response = await api.post(`/workspaces/${workspaceId}/uptime/monitors`, data);
      return response.data as UptimeMonitor;
    },

    update: async (workspaceId: string, monitorId: string, data: UptimeMonitorUpdate) => {
      const response = await api.patch(`/workspaces/${workspaceId}/uptime/monitors/${monitorId}`, data);
      return response.data as UptimeMonitor;
    },

    delete: async (workspaceId: string, monitorId: string) => {
      await api.delete(`/workspaces/${workspaceId}/uptime/monitors/${monitorId}`);
    },

    pause: async (workspaceId: string, monitorId: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/uptime/monitors/${monitorId}/pause`);
      return response.data as UptimeMonitor;
    },

    resume: async (workspaceId: string, monitorId: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/uptime/monitors/${monitorId}/resume`);
      return response.data as UptimeMonitor;
    },

    test: async (workspaceId: string, monitorId: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/uptime/monitors/${monitorId}/test`);
      return response.data as UptimeCheck;
    },

    getChecks: async (workspaceId: string, monitorId: string, params?: { start_date?: string; end_date?: string; limit?: number; offset?: number }) => {
      const response = await api.get(`/workspaces/${workspaceId}/uptime/monitors/${monitorId}/checks`, { params });
      // Backend returns { items: [], total, ... }
      const data = response.data;
      const checks = data?.checks || data?.items || [];
      return { checks: checks as UptimeCheck[], total: data?.total || checks.length };
    },

    getStats: async (workspaceId: string, monitorId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/uptime/monitors/${monitorId}/stats`);
      return response.data as MonitorStats;
    },
  },

  // Incidents
  incidents: {
    list: async (workspaceId: string, params?: { status?: UptimeIncidentStatus; monitor_id?: string; limit?: number; offset?: number }) => {
      const response = await api.get(`/workspaces/${workspaceId}/uptime/incidents`, { params });
      // Backend returns { items: [], total, ... }
      const data = response.data;
      const incidents = data?.incidents || data?.items || [];
      return { incidents: incidents as UptimeIncident[], total: data?.total || incidents.length };
    },

    get: async (workspaceId: string, incidentId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/uptime/incidents/${incidentId}`);
      return response.data as UptimeIncident;
    },

    update: async (workspaceId: string, incidentId: string, data: UptimeIncidentUpdate) => {
      const response = await api.patch(`/workspaces/${workspaceId}/uptime/incidents/${incidentId}`, data);
      return response.data as UptimeIncident;
    },

    resolve: async (workspaceId: string, incidentId: string, resolutionNotes?: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/uptime/incidents/${incidentId}/resolve`, { resolution_notes: resolutionNotes });
      return response.data as UptimeIncident;
    },

    acknowledge: async (workspaceId: string, incidentId: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/uptime/incidents/${incidentId}/acknowledge`);
      return response.data as UptimeIncident;
    },
  },

  // Stats
  stats: {
    getWorkspaceStats: async (workspaceId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/uptime/stats`);
      return response.data as WorkspaceUptimeStats;
    },
  },
};
