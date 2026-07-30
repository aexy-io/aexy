import { api } from "./api";

// Types

export type RequestType = "query" | "policy_issuance" | "claims" | "payout";
export type PendingWith =
  | "insurer" | "partner" | "sales" | "third_party" | "finance" | "kam" | "marketing" | "closed";
export type TicketOrigin = "email" | "manual" | "internal";
export type MailboxChannel = "webhook" | "gmail_sync";
export type BreachLevel = "green" | "amber" | "red";

export interface Partner {
  id: string;
  workspace_id: string;
  name: string;
  assigned_kam_id: string | null;
  is_active: boolean;
  domains: string[];
  created_at: string;
}

export interface Insurer {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  domains: string[];
  created_at: string;
}

export interface LOB {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Mailbox {
  id: string;
  workspace_id: string;
  address: string;
  channel: MailboxChannel;
  integration_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ServiceDeskTicket {
  id: string;
  ticket_id: string;
  workspace_id: string;
  ticket_number: number | null;
  display_id: string | null;
  subject: string | null;
  requester_email: string | null;
  requester_name: string | null;
  status: string | null;
  lob_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  insurer_id: string | null;
  assigned_kam_id: string | null;
  request_type: RequestType;
  pending_with: PendingWith;
  origin: TicketOrigin;
  needs_triage: boolean;
  ai_confidence: number | null;
  created_at: string;
}

export interface Segment {
  id: string;
  pending_with: PendingWith;
  entered_at: string;
  exited_at: string | null;
  duration_seconds: number | null;
  changed_by_id: string | null;
  note: string | null;
}

export interface TicketTAT {
  overall_seconds: number;
  overall_days: number;
  current_pending_with: PendingWith | null;
  current_stage_seconds: number;
  current_stage_days: number;
  breach_level: BreachLevel;
  stakeholder_seconds: Record<string, number>;
}

export interface ServiceDeskTicketDetail extends ServiceDeskTicket {
  body: string | null;
  linked_task_id: string | null;
  segments: Segment[];
  tat: TicketTAT;
}

export interface StakeholderBucket {
  pending_with: PendingWith;
  green: number;
  amber: number;
  red: number;
  total: number;
}

export interface DashboardTicket {
  ticket_id: string;
  display_id: string;
  subject: string | null;
  lob_name: string | null;
  partner_name: string | null;
  request_type: RequestType;
  pending_with: PendingWith;
  assigned_kam_id: string | null;
  days_in_stage: number;
  overall_days: number;
  breach_level: BreachLevel;
  needs_triage: boolean;
  status: string | null;
}

export interface ServiceDeskDashboard {
  stakeholders: StakeholderBucket[];
  tickets: DashboardTicket[];
  total_open: number;
  breaching: number;
}

export interface ServiceDeskSettings {
  ai_classification_enabled: boolean;
  /** Whether the current user holds can_manage_service_desk. The server enforces
   *  this regardless; the UI uses it to avoid offering actions that would 403. */
  can_manage: boolean;
  /** How wide the caller's ticket view is. "none" means they belong to no
   *  department, so no ticket can ever match — an empty list is a
   *  misconfiguration, not a quiet day. */
  scope: "all" | "function" | "none";
  /** The shift the breach clock runs on, IST, as "HH:MM". Always populated —
   *  the API reports the defaults when nothing has been set. */
  working_hours_start: string;
  working_hours_end: string;
}

/** Only the fields being changed; the API leaves the rest alone. */
export interface ServiceDeskSettingsPatch {
  ai_classification_enabled?: boolean;
  working_hours_start?: string;
  working_hours_end?: string;
}

export interface ServiceDeskTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  customised: boolean;
}

const base = (ws: string) => `/workspaces/${ws}/service-desk`;

export const serviceDeskApi = {
  getSettings: async (ws: string): Promise<ServiceDeskSettings> =>
    (await api.get(`${base(ws)}/settings`)).data,
  /** Partial patch — send only the fields being changed. */
  updateSettings: async (ws: string, patch: ServiceDeskSettingsPatch): Promise<ServiceDeskSettings> =>
    (await api.patch(`${base(ws)}/settings`, patch)).data,
  listTemplates: async (ws: string): Promise<ServiceDeskTemplate[]> =>
    (await api.get(`${base(ws)}/templates`)).data,
  updateTemplate: async (ws: string, key: string, subject: string, body: string): Promise<ServiceDeskTemplate> =>
    (await api.patch(`${base(ws)}/templates/${key}`, { subject, body })).data,

  // dashboard + tickets
  getDashboard: async (ws: string): Promise<ServiceDeskDashboard> =>
    (await api.get(`${base(ws)}/dashboard`)).data,
  listTickets: async (ws: string): Promise<ServiceDeskTicket[]> =>
    (await api.get(`${base(ws)}/tickets`)).data,
  getTicket: async (ws: string, id: string): Promise<ServiceDeskTicketDetail> =>
    (await api.get(`${base(ws)}/tickets/${id}`)).data,
  changePendingWith: async (
    ws: string, id: string, pending_with: PendingWith, note?: string,
  ): Promise<ServiceDeskTicketDetail> =>
    (await api.patch(`${base(ws)}/tickets/${id}/pending-with`, { pending_with, note })).data,
  updateTicket: async (
    ws: string, id: string, data: Partial<{ request_type: RequestType; lob_id: string | null; partner_id: string | null; assigned_kam_id: string | null; needs_triage: boolean }>,
  ): Promise<ServiceDeskTicketDetail> =>
    (await api.patch(`${base(ws)}/tickets/${id}`, data)).data,
  createManual: async (
    ws: string, data: { subject: string; body?: string; requester_email?: string; requester_name?: string; request_type?: RequestType; lob_id?: string; partner_id?: string },
  ): Promise<{ ticket_id: string }> =>
    (await api.post(`${base(ws)}/tickets/manual`, data)).data,
  convertToTask: async (
    ws: string, ticketId: string, data: { project_id: string; sprint_id?: string; title?: string; priority?: string },
  ): Promise<{ task_id: string; task_title: string; linked: boolean }> =>
    (await api.post(`${base(ws)}/tickets/${ticketId}/convert-to-task`, data)).data,

  // partners
  listPartners: async (ws: string): Promise<Partner[]> => (await api.get(`${base(ws)}/partners`)).data,
  createPartner: async (ws: string, data: { name: string; assigned_kam_id?: string | null; domains?: string[] }): Promise<Partner> =>
    (await api.post(`${base(ws)}/partners`, data)).data,
  updatePartner: async (ws: string, id: string, data: Partial<{ name: string; assigned_kam_id: string | null; domains: string[]; is_active: boolean }>): Promise<Partner> =>
    (await api.patch(`${base(ws)}/partners/${id}`, data)).data,
  deletePartner: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/partners/${id}`); },

  // insurers
  listInsurers: async (ws: string): Promise<Insurer[]> => (await api.get(`${base(ws)}/insurers`)).data,
  createInsurer: async (ws: string, data: { name: string; domains?: string[] }): Promise<Insurer> =>
    (await api.post(`${base(ws)}/insurers`, data)).data,
  deleteInsurer: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/insurers/${id}`); },

  // LOBs
  listLobs: async (ws: string): Promise<LOB[]> => (await api.get(`${base(ws)}/lobs`)).data,
  createLob: async (ws: string, data: { name: string }): Promise<LOB> => (await api.post(`${base(ws)}/lobs`, data)).data,
  deleteLob: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/lobs/${id}`); },

  // mailboxes
  listMailboxes: async (ws: string): Promise<Mailbox[]> => (await api.get(`${base(ws)}/mailboxes`)).data,
  createMailbox: async (ws: string, data: { address: string; channel?: MailboxChannel; integration_id?: string | null }): Promise<Mailbox> =>
    (await api.post(`${base(ws)}/mailboxes`, data)).data,
  deleteMailbox: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/mailboxes/${id}`); },
};
