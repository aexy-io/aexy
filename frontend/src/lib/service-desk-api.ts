import { api } from "./api";

// Types

/**
 * Stakeholder and request-type slugs are defined per workspace, so these are
 * plain strings rather than unions of one industry's vocabulary. They used to be
 * `"insurer" | "partner" | "kam" | …`, which meant adding a stakeholder needed a
 * frontend release — and every workspace saw insurance words.
 *
 * Resolve labels and ordering from `listStakeholders` / `listRequestTypes`; never
 * compare a slug to a literal in a component.
 */
export type RequestType = string;
export type PendingWith = string;

export type TicketOrigin = "email" | "manual" | "internal";
export type MailboxChannel = "webhook" | "gmail_sync";
export type BreachLevel = "green" | "amber" | "red";

/** Which bucket a ticket is waiting in. Code branches on `semantics`, never `slug`. */
export type StakeholderSemantics = "internal" | "external" | "closed";

export interface Stakeholder {
  id: string;
  workspace_id: string;
  slug: string;
  label: string;
  semantics: StakeholderSemantics;
  /** The department that owns this queue — only meaningful when internal. */
  function_key: string | null;
  position: number;
  is_active: boolean;
}

export interface RequestTypeRow {
  id: string;
  workspace_id: string;
  slug: string;
  label: string;
  is_default: boolean;
  position: number;
  is_active: boolean;
}

/** A starting point for a desk. Carries no company-specific data. */
export interface IndustryTemplate {
  slug: string;
  name: string;
  description: string;
  terminology: Record<string, string>;
  stakeholders: { slug: string; label: string; semantics: StakeholderSemantics; function_key: string | null }[];
  request_types: { slug: string; label: string; is_default: boolean }[];
  departments: string[];
}

export interface ApplyTemplateResult {
  template_slug: string;
  stakeholders_added: number;
  request_types_added: number;
  departments_created: string[];
  terminology_applied: boolean;
}

export interface Account {
  id: string;
  workspace_id: string;
  name: string;
  assigned_owner_id: string | null;
  is_active: boolean;
  domains: string[];
  created_at: string;
}

export interface Vendor {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  domains: string[];
  created_at: string;
}

export interface Product {
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
  product_id: string | null;
  account_id: string | null;
  account_name: string | null;
  vendor_id: string | null;
  assigned_owner_id: string | null;
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
  product_name: string | null;
  account_name: string | null;
  request_type: RequestType;
  pending_with: PendingWith;
  assigned_owner_id: string | null;
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
  /** The shift the breach clock runs on, in `timezone`, as "HH:MM". Always
   *  populated — the API reports the defaults when nothing has been set. */
  working_hours_start: string;
  working_hours_end: string;
  /** Desk identity and SLA, per workspace. These were code constants fixed to
   *  one customer's operation (BSD ticket ids, Asia/Kolkata, 2 business days);
   *  the defaults still report exactly that, so nothing changes unless edited. */
  ticket_prefix: string;
  timezone: string;
  breach_red_days: number;
  breach_amber_days: number;
  /** Local hours the digest goes out, in `timezone`. Was a global IST cron. */
  digest_hours: number[];
  /** Which industry template this desk started from, if any. */
  industry_template: string | null;
  /** Resolved labels for accounts/vendors/products — always fully populated. */
  terminology: Record<string, string>;
  /** Name used in outbound email copy; defaults to the workspace name. */
  desk_name: string | null;
  /** The department that runs this desk: incoming tickets are auto-assigned to
   *  its members and its head receives the digest of everything open.
   *
   *  Resolved, not raw — with nothing chosen the server infers the department
   *  behind the desk's first internal queue, so this names whoever is actually
   *  receiving work. `is_explicit` separates a deliberate choice from that
   *  fallback (and is false for a stale choice that no longer resolves). */
  desk_department_id: string | null;
  desk_department_name: string | null;
  desk_department_is_explicit: boolean;
}

/** Only the fields being changed; the API leaves the rest alone. */
export interface ServiceDeskSettingsPatch {
  ai_classification_enabled?: boolean;
  working_hours_start?: string;
  working_hours_end?: string;
  ticket_prefix?: string;
  timezone?: string;
  breach_red_days?: number;
  breach_amber_days?: number;
  digest_hours?: number[];
  /** Merged into the stored map — send only the nouns being relabelled. */
  terminology?: Record<string, string>;
  desk_name?: string;
  /** Empty string clears it, putting the desk back on inferring a department. */
  desk_department_id?: string;
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
    ws: string, id: string, data: Partial<{ request_type: RequestType; product_id: string | null; account_id: string | null; assigned_owner_id: string | null; needs_triage: boolean }>,
  ): Promise<ServiceDeskTicketDetail> =>
    (await api.patch(`${base(ws)}/tickets/${id}`, data)).data,
  createManual: async (
    ws: string, data: { subject: string; body?: string; requester_email?: string; requester_name?: string; request_type?: RequestType; product_id?: string; account_id?: string },
  ): Promise<{ ticket_id: string }> =>
    (await api.post(`${base(ws)}/tickets/manual`, data)).data,
  convertToTask: async (
    ws: string, ticketId: string, data: { project_id: string; sprint_id?: string; title?: string; priority?: string },
  ): Promise<{ task_id: string; task_title: string; linked: boolean }> =>
    (await api.post(`${base(ws)}/tickets/${ticketId}/convert-to-task`, data)).data,

  // accounts
  listAccounts: async (ws: string): Promise<Account[]> => (await api.get(`${base(ws)}/accounts`)).data,
  createAccount: async (ws: string, data: { name: string; assigned_owner_id?: string | null; domains?: string[] }): Promise<Account> =>
    (await api.post(`${base(ws)}/accounts`, data)).data,
  updateAccount: async (ws: string, id: string, data: Partial<{ name: string; assigned_owner_id: string | null; domains: string[]; is_active: boolean }>): Promise<Account> =>
    (await api.patch(`${base(ws)}/accounts/${id}`, data)).data,
  deleteAccount: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/accounts/${id}`); },

  // vendors
  listVendors: async (ws: string): Promise<Vendor[]> => (await api.get(`${base(ws)}/vendors`)).data,
  createVendor: async (ws: string, data: { name: string; domains?: string[] }): Promise<Vendor> =>
    (await api.post(`${base(ws)}/vendors`, data)).data,
  deleteVendor: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/vendors/${id}`); },

  // products
  listProducts: async (ws: string): Promise<Product[]> => (await api.get(`${base(ws)}/products`)).data,
  createProduct: async (ws: string, data: { name: string }): Promise<Product> => (await api.post(`${base(ws)}/products`, data)).data,
  deleteProduct: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/products/${id}`); },

  // taxonomy — the workspace's own stakeholders and request types
  listStakeholders: async (ws: string): Promise<Stakeholder[]> =>
    (await api.get(`${base(ws)}/stakeholders`)).data,
  createStakeholder: async (
    ws: string,
    data: { slug: string; label: string; semantics?: StakeholderSemantics; function_key?: string | null; position?: number },
  ): Promise<Stakeholder> => (await api.post(`${base(ws)}/stakeholders`, data)).data,
  updateStakeholder: async (
    ws: string, id: string,
    data: Partial<{ label: string; semantics: StakeholderSemantics; function_key: string | null; position: number; is_active: boolean }>,
  ): Promise<Stakeholder> => (await api.patch(`${base(ws)}/stakeholders/${id}`, data)).data,
  deleteStakeholder: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/stakeholders/${id}`); },

  listRequestTypes: async (ws: string): Promise<RequestTypeRow[]> =>
    (await api.get(`${base(ws)}/request-types`)).data,
  createRequestType: async (
    ws: string, data: { slug: string; label: string; is_default?: boolean; position?: number },
  ): Promise<RequestTypeRow> => (await api.post(`${base(ws)}/request-types`, data)).data,
  updateRequestType: async (
    ws: string, id: string,
    data: Partial<{ label: string; is_default: boolean; position: number; is_active: boolean }>,
  ): Promise<RequestTypeRow> => (await api.patch(`${base(ws)}/request-types/${id}`, data)).data,
  deleteRequestType: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/request-types/${id}`); },

  // industry templates
  listIndustryTemplates: async (ws: string): Promise<IndustryTemplate[]> =>
    (await api.get(`${base(ws)}/industry-templates`)).data,
  applyIndustryTemplate: async (
    ws: string,
    data: { template_slug: string; apply_terminology?: boolean; create_departments?: boolean },
  ): Promise<ApplyTemplateResult> =>
    (await api.post(`${base(ws)}/industry-templates/apply`, data)).data,

  // mailboxes
  listMailboxes: async (ws: string): Promise<Mailbox[]> => (await api.get(`${base(ws)}/mailboxes`)).data,
  createMailbox: async (ws: string, data: { address: string; channel?: MailboxChannel; integration_id?: string | null }): Promise<Mailbox> =>
    (await api.post(`${base(ws)}/mailboxes`, data)).data,
  deleteMailbox: async (ws: string, id: string): Promise<void> => { await api.delete(`${base(ws)}/mailboxes/${id}`); },
};
