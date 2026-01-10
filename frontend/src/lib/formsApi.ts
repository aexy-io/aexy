/**
 * Forms API client for the standalone forms module.
 * Supports multi-destination (Ticketing, CRM, Deals) form submissions.
 */

import { api } from "./api";

// ==================== Types ====================

export type FormAuthMode = "anonymous" | "email_verification";
export type FormTemplateType = "bug_report" | "feature_request" | "support" | "contact" | "lead_capture" | "feedback" | "custom";
export type FormFieldType = "text" | "textarea" | "email" | "phone" | "number" | "url" | "select" | "multiselect" | "checkbox" | "radio" | "file" | "date" | "datetime" | "hidden";
export type FormSubmissionStatus = "pending" | "processing" | "completed" | "partially_failed" | "failed";
export type TicketAssignmentMode = "none" | "oncall" | "round_robin" | "specific_user";

export interface FieldOption {
  value: string;
  label: string;
  color?: string;
}

export interface ValidationRules {
  min_length?: number;
  max_length?: number;
  pattern?: string;
  min?: number;
  max?: number;
  allowed_file_types?: string[];
  max_file_size_mb?: number;
  custom_message?: string;
}

export interface ExternalMappings {
  github?: string;
  jira?: string;
  linear?: string;
}

export interface FormTheme {
  primary_color?: string;
  background_color?: string;
  logo_url?: string;
  custom_css?: string;
  header_text?: string;
  font_family?: string;
}

export interface ConditionalRule {
  source_field: string;
  condition: "equals" | "not_equals" | "contains" | "not_contains" | "is_empty" | "is_not_empty" | "greater_than" | "less_than";
  value?: string;
  target_field: string;
  action: "show" | "hide" | "require";
}

export interface ExternalDestination {
  type: "github" | "jira" | "linear";
  enabled: boolean;
  repository_id?: string;
  labels?: string[];
  project_key?: string;
  issue_type?: string;
  team_id?: string;
  field_mappings?: Record<string, string>;
}

export interface FormField {
  id: string;
  form_id: string;
  name: string;
  field_key: string;
  field_type: FormFieldType;
  placeholder?: string;
  default_value?: string;
  help_text?: string;
  is_required: boolean;
  validation_rules: ValidationRules;
  options?: FieldOption[];
  position: number;
  is_visible: boolean;
  width: "full" | "half" | "third" | "two-thirds";
  crm_attribute_id?: string;
  external_mappings: ExternalMappings;
  created_at: string;
  updated_at: string;
}

export interface Form {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
  template_type?: FormTemplateType;
  public_url_token: string;
  is_active: boolean;
  auth_mode: FormAuthMode;
  require_email: boolean;
  theme: FormTheme;
  success_message?: string;
  redirect_url?: string;
  auto_create_ticket: boolean;
  default_team_id?: string;
  ticket_assignment_mode: TicketAssignmentMode;
  auto_create_record: boolean;
  crm_object_id?: string;
  auto_create_deal: boolean;
  deal_pipeline_id?: string;
  trigger_automations: boolean;
  destinations: ExternalDestination[];
  conditional_rules: ConditionalRule[];
  submission_count: number;
  created_by_id?: string;
  created_at: string;
  updated_at: string;
  fields?: FormField[];
  crm_object_name?: string;
  default_team_name?: string;
}

export interface FormListItem {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
  template_type?: FormTemplateType;
  public_url_token: string;
  is_active: boolean;
  auth_mode: FormAuthMode;
  auto_create_ticket: boolean;
  auto_create_record: boolean;
  auto_create_deal: boolean;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export interface TicketConfig {
  auto_create_ticket: boolean;
  default_team_id?: string;
  default_team_name?: string;
  ticket_assignment_mode: TicketAssignmentMode;
  ticket_assignee_id?: string;
  ticket_assignee_name?: string;
  default_priority?: string;
  default_severity?: string;
  ticket_field_mappings: Record<string, string>;
  ticket_config: Record<string, unknown>;
}

export interface CRMMapping {
  auto_create_record: boolean;
  crm_object_id?: string;
  crm_object_name?: string;
  crm_field_mappings: Record<string, string>;
  record_owner_id?: string;
  record_owner_name?: string;
}

export interface DealConfig {
  auto_create_deal: boolean;
  deal_pipeline_id?: string;
  deal_pipeline_name?: string;
  deal_stage_id?: string;
  deal_stage_name?: string;
  deal_field_mappings: Record<string, string>;
  link_deal_to_record: boolean;
}

export interface AutomationLink {
  id: string;
  form_id: string;
  automation_id: string;
  automation_name?: string;
  is_active: boolean;
  conditions: Record<string, unknown>[];
  created_at: string;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  workspace_id: string;
  data: Record<string, unknown>;
  attachments: Record<string, unknown>[];
  email?: string;
  name?: string;
  is_verified: boolean;
  verified_at?: string;
  status: FormSubmissionStatus;
  processing_errors: Record<string, unknown>[];
  ticket_id?: string;
  crm_record_id?: string;
  deal_id?: string;
  external_issues: Record<string, unknown>[];
  automations_triggered: Record<string, unknown>[];
  ip_address?: string;
  user_agent?: string;
  referrer_url?: string;
  utm_params: Record<string, string>;
  submitted_at: string;
  processed_at?: string;
  ticket_number?: number;
  crm_record_display_name?: string;
  deal_display_name?: string;
  form_name?: string;
}

export interface FormSubmissionListItem {
  id: string;
  form_id: string;
  email?: string;
  name?: string;
  is_verified: boolean;
  status: FormSubmissionStatus;
  ticket_id?: string;
  crm_record_id?: string;
  deal_id?: string;
  submitted_at: string;
  ticket_number?: number;
  form_name?: string;
}

export interface FormTemplate {
  name: string;
  description: string;
  suggested_crm_object?: string;
  fields: Partial<FormField>[];
}

export interface PublicForm {
  id: string;
  name: string;
  description?: string;
  auth_mode: FormAuthMode;
  require_email: boolean;
  theme: FormTheme;
  fields: FormField[];
  conditional_rules: ConditionalRule[];
}

export interface PublicSubmissionResponse {
  submission_id: string;
  success_message?: string;
  redirect_url?: string;
  requires_email_verification: boolean;
  ticket_number?: number;
  crm_record_id?: string;
  deal_id?: string;
}

// ==================== API Client ====================

export const formsApi = {
  // ==================== Templates ====================
  getTemplates: async (workspaceId: string): Promise<Record<string, FormTemplate>> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms/templates`);
    return response.data;
  },

  createFromTemplate: async (
    workspaceId: string,
    templateType: FormTemplateType,
    name?: string
  ): Promise<Form> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/forms/from-template/${templateType}`,
      null,
      { params: { name } }
    );
    return response.data;
  },

  // ==================== Form CRUD ====================
  list: async (workspaceId: string, params?: {
    is_active?: boolean;
    template_type?: FormTemplateType;
    limit?: number;
    offset?: number;
  }): Promise<FormListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms`, { params });
    return response.data;
  },

  get: async (workspaceId: string, formId: string): Promise<Form> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms/${formId}`);
    return response.data;
  },

  create: async (workspaceId: string, data: Partial<Form>): Promise<Form> => {
    const response = await api.post(`/workspaces/${workspaceId}/forms`, data);
    return response.data;
  },

  update: async (workspaceId: string, formId: string, data: Partial<Form>): Promise<Form> => {
    const response = await api.patch(`/workspaces/${workspaceId}/forms/${formId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, formId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/forms/${formId}`);
  },

  duplicate: async (workspaceId: string, formId: string, name: string): Promise<Form> => {
    const response = await api.post(`/workspaces/${workspaceId}/forms/${formId}/duplicate`, { name });
    return response.data;
  },

  // ==================== Field Management ====================
  addField: async (workspaceId: string, formId: string, data: Partial<FormField>): Promise<FormField> => {
    const response = await api.post(`/workspaces/${workspaceId}/forms/${formId}/fields`, data);
    return response.data;
  },

  updateField: async (
    workspaceId: string,
    formId: string,
    fieldId: string,
    data: Partial<FormField>
  ): Promise<FormField> => {
    const response = await api.patch(`/workspaces/${workspaceId}/forms/${formId}/fields/${fieldId}`, data);
    return response.data;
  },

  deleteField: async (workspaceId: string, formId: string, fieldId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/forms/${formId}/fields/${fieldId}`);
  },

  reorderFields: async (workspaceId: string, formId: string, fieldIds: string[]): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/forms/${formId}/fields/reorder`, { field_ids: fieldIds });
  },

  // ==================== Ticket Configuration ====================
  getTicketConfig: async (workspaceId: string, formId: string): Promise<TicketConfig> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms/${formId}/ticket-config`);
    return response.data;
  },

  configureTicket: async (workspaceId: string, formId: string, config: Partial<TicketConfig>): Promise<Form> => {
    const response = await api.post(`/workspaces/${workspaceId}/forms/${formId}/ticket-config`, config);
    return response.data;
  },

  disableTicket: async (workspaceId: string, formId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/forms/${formId}/ticket-config`);
  },

  // ==================== CRM Mapping ====================
  getCRMMapping: async (workspaceId: string, formId: string): Promise<CRMMapping> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms/${formId}/crm-mapping`);
    return response.data;
  },

  configureCRMMapping: async (workspaceId: string, formId: string, config: Partial<CRMMapping>): Promise<Form> => {
    const response = await api.post(`/workspaces/${workspaceId}/forms/${formId}/crm-mapping`, config);
    return response.data;
  },

  removeCRMMapping: async (workspaceId: string, formId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/forms/${formId}/crm-mapping`);
  },

  // ==================== Deal Configuration ====================
  getDealConfig: async (workspaceId: string, formId: string): Promise<DealConfig> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms/${formId}/deal-config`);
    return response.data;
  },

  configureDeal: async (workspaceId: string, formId: string, config: Partial<DealConfig>): Promise<Form> => {
    const response = await api.post(`/workspaces/${workspaceId}/forms/${formId}/deal-config`, config);
    return response.data;
  },

  disableDeal: async (workspaceId: string, formId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/forms/${formId}/deal-config`);
  },

  // ==================== Automation Links ====================
  listAutomations: async (workspaceId: string, formId: string): Promise<AutomationLink[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms/${formId}/automations`);
    return response.data;
  },

  linkAutomation: async (
    workspaceId: string,
    formId: string,
    data: { automation_id: string; conditions?: Record<string, unknown>[] }
  ): Promise<AutomationLink> => {
    const response = await api.post(`/workspaces/${workspaceId}/forms/${formId}/automations`, data);
    return response.data;
  },

  unlinkAutomation: async (workspaceId: string, formId: string, automationId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/forms/${formId}/automations/${automationId}`);
  },

  // ==================== Submissions ====================
  listSubmissions: async (
    workspaceId: string,
    formId: string,
    params?: {
      status?: FormSubmissionStatus[];
      email?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<FormSubmissionListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms/${formId}/submissions`, { params });
    return response.data;
  },

  getSubmission: async (workspaceId: string, formId: string, submissionId: string): Promise<FormSubmission> => {
    const response = await api.get(`/workspaces/${workspaceId}/forms/${formId}/submissions/${submissionId}`);
    return response.data;
  },

  // ==================== Public Form ====================
  getPublicForm: async (publicToken: string): Promise<PublicForm> => {
    const response = await api.get(`/forms/${publicToken}`);
    return response.data;
  },

  submitPublicForm: async (
    publicToken: string,
    data: {
      email?: string;
      name?: string;
      data: Record<string, unknown>;
      utm_params?: Record<string, string>;
    }
  ): Promise<PublicSubmissionResponse> => {
    const response = await api.post(`/forms/${publicToken}/submit`, data);
    return response.data;
  },

  verifyEmail: async (publicToken: string, token: string): Promise<{ status: string; submission_id: string }> => {
    const response = await api.post(`/forms/${publicToken}/verify`, { token });
    return response.data;
  },
};

export default formsApi;
