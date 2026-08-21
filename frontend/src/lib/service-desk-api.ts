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
  /** Which master-data table an external bucket speaks for. Declared, not
   *  inferred from the label, so renaming a bucket changes nothing. */
  links_to: "account" | "vendor" | null;
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

/** What the editor sends back when it changes an account's product pairings. */
export interface AccountProductInput {
  product_id: string;
  assigned_owner_id?: string | null;
}

/** One product an account is served for, optionally with its own owner. */
export interface AccountProductLink extends AccountProductInput {
  product_name: string | null;
  assigned_owner_name: string | null;
}

export interface Account {
  id: string;
  workspace_id: string;
  name: string;
  assigned_owner_id: string | null;
  /** Resolved for display. The master-data list is where somebody checks that
   *  the mapping they made is the mapping in force, and an id is not something
   *  a person can check. */
  assigned_owner_name: string | null;
  assigned_owner_email: string | null;
  is_active: boolean;
  domains: string[];
  /** Which products this account is served for. Empty for a desk that has not
   *  split anybody between owners, which is every desk until somebody does. */
  products: AccountProductLink[];
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

export interface CorrespondenceEntry {
  id: string;
  author_email: string | null;
  /** The internal person who sent it. Only set on outgoing mail. */
  author_name: string | null;
  content: string;
  created_at: string;
  /** "outgoing" was sent from the ticket by a KAM or manager; "incoming" is a
   *  stakeholder reply matched onto it by the mailbox sync. */
  direction: "incoming" | "outgoing";
}

/** An address the ticket may be emailed — the server rejects anything else. */
export interface TicketEmailRecipient {
  email: string;
  label: string;
  /** Stage the ticket moves to when this recipient is written to; null when
   *  writing to them says nothing about who now has to act. */
  stage: PendingWith | null;
}

/** A file that arrived on the ticket's original email. */
export interface TicketAttachment {
  /** Position in the ticket's attachment list — the handle the download URL
   *  takes. Two replies can attach files with the same name, so the name is a
   *  label and never an identifier. */
  index: number;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  /** False when the original message gave us no handle for the bytes. Both
   *  forwarding and downloading re-fetch from that message, so neither can be
   *  offered without it. */
  can_forward: boolean;
}

export interface DetectedIssue {
  summary: string;
  request_type: RequestType;
  /** The workspace's product noun, not "line of business". */
  product: string | null;
  confidence: number;
  split_reason: string | null;
}

export interface HumanSplitResponse {
  created_ticket_ids: string[];
  created_ticket_display_ids: string[];
}

export interface ServiceDeskTicketDetail extends ServiceDeskTicket {
  body: string | null;
  linked_task_id: string | null;
  detected_issues: DetectedIssue[];
  split_done_indexes: number[];
  segments: Segment[];
  correspondence: CorrespondenceEntry[];
  email_recipients: TicketEmailRecipient[];
  attachments: TicketAttachment[];
  tat: TicketTAT;
  /** Server-computed write authority for the requesting caller. */
  can_edit: boolean;
  /** Whether this ticket's mailbox is a connected Gmail account, i.e. whether
   *  outbound mail can leave the ticket at all. */
  can_send_email: boolean;
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

/**
 * What narrows a ticket list, its count, and its export.
 *
 * One type for all three because the server takes one model for all three: a
 * CSV that disagreed with the screen it was generated from would be the thing
 * this shape exists to prevent. Every field narrows — none of them widen what
 * the caller is allowed to see, which the server enforces separately.
 */
export interface TicketQuery {
  /** Free text over subject, requester and ticket number. Not the body — see
   *  `TicketFilters.q` on the server for why. */
  q?: string;
  /** Ordering. Lives with the filters so an export comes back in the order of
   *  the screen it was generated from. */
  sort?: "created" | "ticket" | "subject" | "account" | "type" | "pending" | "status";
  direction?: "asc" | "desc";
  /** Narrow to the caller's own queue, within their desk scope. */
  assigned_to_me?: boolean;
  limit?: number;
  offset?: number;
  /** ISO timestamps; both ends inclusive. */
  created_from?: string;
  created_to?: string;
  account_id?: string;
  product_id?: string;
  vendor_id?: string;
  request_type?: string;
  pending_with?: string;
  origin?: string;
  status?: string;
  assigned_to?: string;
  needs_triage?: boolean;
  /** Whether the ticket is in this workspace's terminal stage, whatever it is
   *  called here — a report should not have to know the slug. */
  is_open?: boolean;
}

export interface DigestPreview {
  enabled: boolean;
  hours: number[];
  timezone: string;
  recipients: string[];
  /** The caller's own copy, rendered — never somebody else's. Null when the
   *  caller is not on the recipient list. */
  subject: string | null;
  body: string | null;
}

export interface AIAccuracy {
  days: number;
  classified: number;
  agreed: number;
  /** Null when nothing has been classified. A desk with no measurements has no
   *  accuracy, and a perfect score for zero tickets is the most misleading
   *  thing this could show someone deciding whether to trust it. */
  agreement_rate: number | null;
  by_request_type: {
    request_type: string;
    label: string;
    classified: number;
    agreed: number;
    agreement_rate: number;
  }[];
}

export interface ServiceDeskSettings {
  /** Resolved, not raw. AI reading of desk mail follows the workspace's own AI
   *  switch (Settings -> AI); the desk holds a veto, not a second opt-in. This
   *  is what is in force; `workspace_ai_enabled` says where it came from. */
  ai_classification_enabled: boolean;
  workspace_ai_enabled: boolean;
  /** Reading attachment bytes to build classifier previews. Its own explicit
   *  yes — a workspace-wide "AI is fine" must not open customers' files by
   *  inheritance. */
  ai_attachment_previews_enabled: boolean;
  /** Whether the desk's acknowledgement and closure carry a link to a public,
   *  no-account view of the ticket. Off by default — turning it on serves
   *  ticket subjects, requester names and attachments to anyone holding a URL. */
  public_ticket_links_enabled: boolean;
  /** Senders whose mail must not become tickets. An entry with an "@" is one
   *  address; without, a whole domain. Empty by default — the list is written by
   *  hand, never inferred, because a counterparty's own no-reply address carries
   *  notices the desk does want. A whole address outranks Master Data; a bare
   *  domain does not. */
  ignored_senders: string[];
  /** Whether intake may open a second ticket when one email carries two clearly
   *  different, high-confidence requests. Off by default — everything else
   *  stays a single ticket flagged for triage. */
  auto_split_enabled: boolean;
  /** What intake does with a ticket whose account it cannot identify.
   *  "random" is the historical default. */
  unmatched_assignment: "random" | "unassigned" | "desk_head";
  /** Whether the current user holds can_manage_service_desk. The server enforces
   *  this regardless; the UI uses it to avoid offering actions that would 403. */
  can_manage: boolean;
  /** How wide the caller's ticket view is. "assigned" means an owner who only
   *  ever sees their own tickets; "none" means they belong to no department, so
   *  no ticket can ever match — an empty list is a misconfiguration, not a quiet
   *  day. The server filters the rows either way; this only makes the empty
   *  state honest about which case it is. */
  scope: "all" | "assigned" | "function" | "none";
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
  /** Whether the desk wants the open-ticket digest at all. */
  digest_enabled: boolean;
  digest_hours: number[];
  /** Desk-department members who asked not to receive it. */
  digest_excluded_recipients: string[];
  /** Addresses added by hand — they receive the desk-wide view. */
  digest_extra_recipients: string[];
  /** How often Gmail-backed desk mailboxes are polled, in minutes. A floor on
   *  the integration's own interval, never a raise. */
  intake_poll_minutes: number;
  /** Which industry template this desk started from, if any. */
  industry_template: string | null;
  /** Resolved labels for accounts/vendors/products — always fully populated. */
  terminology: Record<string, string>;
  /** Name used in outbound email copy; defaults to the workspace name. */
  desk_name: string | null;
  /** A short-lived, manager-controlled override for manual SLA testing only. */
  test_sla: TestSLAOverride | null;
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

export interface TestStageSLA {
  amber_minutes: number;
  red_minutes: number;
}

export interface TestSLAOverride {
  expires_at: string;
  /** Keyed by the workspace's own stakeholder slugs. Was fixed fields, so a
   *  desk using any other bucket names could not run a timed test. */
  stages: Record<string, TestStageSLA>;
}

/** Only the fields being changed; the API leaves the rest alone. */
export interface ServiceDeskSettingsPatch {
  /** True clears the desk's veto so it follows the workspace switch again;
   *  false is the veto. */
  ai_classification_enabled?: boolean;
  ai_attachment_previews_enabled?: boolean;
  public_ticket_links_enabled?: boolean;
  auto_split_enabled?: boolean;
  unmatched_assignment?: "random" | "unassigned" | "desk_head";
  working_hours_start?: string;
  working_hours_end?: string;
  ticket_prefix?: string;
  timezone?: string;
  breach_red_days?: number;
  breach_amber_days?: number;
  digest_enabled?: boolean;
  digest_hours?: number[];
  digest_excluded_recipients?: string[];
  digest_extra_recipients?: string[];
  intake_poll_minutes?: number;
  /** Merged into the stored map — send only the nouns being relabelled. */
  terminology?: Record<string, string>;
  desk_name?: string;
  test_sla?: TestSLAOverride;
  clear_test_sla?: boolean;
  /** Empty string clears it, putting the desk back on inferring a department. */
  desk_department_id?: string;
  /** The complete replacement list, not an addition. */
  ignored_senders?: string[];
}

/** One placeholder and what a send renders when its value is missing. */
export interface ServiceDeskTemplateVariable {
  name: string;
  default: string;
}

export interface ServiceDeskTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  /** Bare names from backends that predate the {name, default} shape. */
  variables: (ServiceDeskTemplateVariable | string)[];
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
  /** What the digest would say right now, and who would receive it. */
  previewDigest: async (ws: string): Promise<DigestPreview> =>
    (await api.get(`${base(ws)}/digest/preview`)).data,
  /** Send it now, to everyone who normally receives it. Managers only. */
  sendDigestNow: async (ws: string): Promise<{ sent: number }> =>
    (await api.post(`${base(ws)}/digest/send-now`)).data,
  /** Whether the classifier is worth trusting on this desk's mail. */
  getAiAccuracy: async (ws: string, days = 90): Promise<AIAccuracy> =>
    (await api.get(`${base(ws)}/ai-accuracy`, { params: { days } })).data,
  getDashboard: async (ws: string): Promise<ServiceDeskDashboard> =>
    (await api.get(`${base(ws)}/dashboard`)).data,
  listTickets: async (
    ws: string,
    params?: TicketQuery
  ): Promise<ServiceDeskTicket[]> =>
    (await api.get(`${base(ws)}/tickets`, { params })).data,
  /** How many tickets match — the list is one page of this. */
  countTickets: async (ws: string, params?: TicketQuery): Promise<{ total: number }> =>
    (await api.get(`${base(ws)}/tickets/count`, { params })).data,
  /**
   * The filtered list as a CSV file.
   *
   * Fetched through the same client as everything else rather than pointed at
   * with an `<a href>`: the API is behind a bearer token the browser will not
   * attach on a plain navigation, so a link would download an HTML 401 named
   * `.csv` — which opens in Excel as one row of nonsense.
   */
  exportTicketsCsv: async (ws: string, params?: TicketQuery): Promise<Blob> =>
    (await api.get(`${base(ws)}/tickets/export.csv`, { params, responseType: "blob" })).data,
  getTicket: async (ws: string, id: string): Promise<ServiceDeskTicketDetail> =>
    (await api.get(`${base(ws)}/tickets/${id}`)).data,
  /**
   * The bytes of one file that arrived on the ticket.
   *
   * Addressed by position, not name — see `TicketAttachment.index`. Fetched
   * through the client rather than linked with an `<a href>` because the token
   * travels as an `Authorization` header, and a browser navigation cannot set
   * one — the link would arrive unauthenticated.
   */
  downloadAttachment: async (ws: string, id: string, index: number): Promise<Blob> =>
    (await api.get(`${base(ws)}/tickets/${id}/attachments/${index}`, { responseType: "blob" })).data,
  splitDetectedIssues: async (
    ws: string, id: string, issue_indexes: number[],
  ): Promise<HumanSplitResponse> =>
    (await api.post(`${base(ws)}/tickets/${id}/split`, { issue_indexes })).data,
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
  emailStakeholder: async (
    ws: string, id: string,
    data: { to: string; cc?: string[]; subject: string; body: string; attachment_filenames?: string[]; move_ticket?: boolean },
  ): Promise<ServiceDeskTicketDetail> =>
    (await api.post(`${base(ws)}/tickets/${id}/email`, data)).data,
  convertToTask: async (
    ws: string, ticketId: string, data: { project_id: string; sprint_id?: string; title?: string; priority?: string },
  ): Promise<{ task_id: string; task_title: string; linked: boolean }> =>
    (await api.post(`${base(ws)}/tickets/${ticketId}/convert-to-task`, data)).data,

  // accounts
  listAccounts: async (ws: string): Promise<Account[]> => (await api.get(`${base(ws)}/accounts`)).data,
  createAccount: async (ws: string, data: { name: string; assigned_owner_id?: string | null; domains?: string[]; products?: AccountProductInput[] }): Promise<Account> =>
    (await api.post(`${base(ws)}/accounts`, data)).data,
  updateAccount: async (ws: string, id: string, data: Partial<{ name: string; assigned_owner_id: string | null; domains: string[]; products: AccountProductInput[]; is_active: boolean }>): Promise<Account> =>
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
