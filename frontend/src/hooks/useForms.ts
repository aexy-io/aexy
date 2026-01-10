"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formsApi } from "@/lib/formsApi";
import type {
  Form,
  FormListItem,
  FormField,
  FormSubmission,
  FormSubmissionListItem,
  TicketConfig,
  CRMMapping,
  DealConfig,
  AutomationLink,
  FormTemplate,
  FormAuthMode,
  FormTemplateType,
  FormFieldType,
  FormTheme,
  ExternalDestination,
  ConditionalRule,
  ValidationRules,
  FieldOption,
} from "@/lib/formsApi";

// ==================== Form List Hook ====================

export function useForms(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: forms,
    isLoading,
    error,
    refetch,
  } = useQuery<FormListItem[]>({
    queryKey: ["forms", workspaceId],
    queryFn: () => formsApi.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      template_type?: FormTemplateType;
      auth_mode?: FormAuthMode;
      require_email?: boolean;
    }) => formsApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms", workspaceId] });
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: ({ templateType, name }: { templateType: FormTemplateType; name?: string }) =>
      formsApi.createFromTemplate(workspaceId!, templateType, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (formId: string) => formsApi.delete(workspaceId!, formId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms", workspaceId] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ formId, newName }: { formId: string; newName: string }) =>
      formsApi.duplicate(workspaceId!, formId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms", workspaceId] });
    },
  });

  return {
    forms: forms || [],
    isLoading,
    error,
    refetch,
    createForm: createMutation.mutateAsync,
    createFromTemplate: createFromTemplateMutation.mutateAsync,
    deleteForm: deleteMutation.mutateAsync,
    duplicateForm: duplicateMutation.mutateAsync,
    isCreating: createMutation.isPending || createFromTemplateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDuplicating: duplicateMutation.isPending,
  };
}

// ==================== Form Templates Hook ====================

export function useFormTemplates(workspaceId: string | null) {
  const {
    data: templates,
    isLoading,
    error,
  } = useQuery<Record<string, FormTemplate>>({
    queryKey: ["formTemplates", workspaceId],
    queryFn: () => formsApi.getTemplates(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    templates: templates || {},
    isLoading,
    error,
  };
}

// ==================== Single Form Hook ====================

export function useForm(workspaceId: string | null, formId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: form,
    isLoading,
    error,
    refetch,
  } = useQuery<Form>({
    queryKey: ["form", workspaceId, formId],
    queryFn: () => formsApi.get(workspaceId!, formId!),
    enabled: !!workspaceId && !!formId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<{
      name: string;
      description: string;
      is_active: boolean;
      auth_mode: FormAuthMode;
      require_email: boolean;
      theme: FormTheme;
      success_message: string;
      redirect_url: string;
      destinations: ExternalDestination[];
      conditional_rules: ConditionalRule[];
      trigger_automations: boolean;
    }>) => formsApi.update(workspaceId!, formId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
      queryClient.invalidateQueries({ queryKey: ["forms", workspaceId] });
    },
  });

  // Field mutations
  const addFieldMutation = useMutation({
    mutationFn: (data: {
      name: string;
      field_key: string;
      field_type?: FormFieldType;
      placeholder?: string;
      default_value?: string;
      help_text?: string;
      is_required?: boolean;
      validation_rules?: ValidationRules;
      options?: FieldOption[];
      width?: "full" | "half" | "third" | "two-thirds";
      crm_attribute_id?: string;
    }) => formsApi.addField(workspaceId!, formId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: Partial<FormField> }) =>
      formsApi.updateField(workspaceId!, formId!, fieldId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) => formsApi.deleteField(workspaceId!, formId!, fieldId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  const reorderFieldsMutation = useMutation({
    mutationFn: (fieldIds: string[]) => formsApi.reorderFields(workspaceId!, formId!, fieldIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  return {
    form,
    isLoading,
    error,
    refetch,
    updateForm: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    // Field operations
    addField: addFieldMutation.mutateAsync,
    updateField: updateFieldMutation.mutateAsync,
    deleteField: deleteFieldMutation.mutateAsync,
    reorderFields: reorderFieldsMutation.mutateAsync,
    isFieldOperating: addFieldMutation.isPending || updateFieldMutation.isPending || deleteFieldMutation.isPending,
  };
}

// ==================== Ticket Config Hook ====================

export function useFormTicketConfig(workspaceId: string | null, formId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery<TicketConfig>({
    queryKey: ["formTicketConfig", workspaceId, formId],
    queryFn: () => formsApi.getTicketConfig(workspaceId!, formId!),
    enabled: !!workspaceId && !!formId,
  });

  const configureMutation = useMutation({
    mutationFn: (data: {
      auto_create_ticket: boolean;
      default_team_id?: string;
      ticket_assignment_mode?: "none" | "oncall" | "round_robin" | "specific_user";
      ticket_assignee_id?: string;
      default_priority?: string;
      default_severity?: string;
      ticket_field_mappings?: Record<string, string>;
      ticket_config?: Record<string, unknown>;
    }) => formsApi.configureTicket(workspaceId!, formId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formTicketConfig", workspaceId, formId] });
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => formsApi.disableTicket(workspaceId!, formId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formTicketConfig", workspaceId, formId] });
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  return {
    config,
    isLoading,
    error,
    refetch,
    configure: configureMutation.mutateAsync,
    disable: disableMutation.mutateAsync,
    isConfiguring: configureMutation.isPending,
    isDisabling: disableMutation.isPending,
  };
}

// ==================== CRM Mapping Hook ====================

export function useFormCRMMapping(workspaceId: string | null, formId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: mapping,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMMapping>({
    queryKey: ["formCRMMapping", workspaceId, formId],
    queryFn: () => formsApi.getCRMMapping(workspaceId!, formId!),
    enabled: !!workspaceId && !!formId,
  });

  const configureMutation = useMutation({
    mutationFn: (data: {
      auto_create_record: boolean;
      crm_object_id: string;
      crm_field_mappings: Record<string, string>;
      record_owner_id?: string;
    }) => formsApi.configureCRMMapping(workspaceId!, formId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formCRMMapping", workspaceId, formId] });
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => formsApi.removeCRMMapping(workspaceId!, formId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formCRMMapping", workspaceId, formId] });
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  return {
    mapping,
    isLoading,
    error,
    refetch,
    configure: configureMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    isConfiguring: configureMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

// ==================== Deal Config Hook ====================

export function useFormDealConfig(workspaceId: string | null, formId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery<DealConfig>({
    queryKey: ["formDealConfig", workspaceId, formId],
    queryFn: () => formsApi.getDealConfig(workspaceId!, formId!),
    enabled: !!workspaceId && !!formId,
  });

  const configureMutation = useMutation({
    mutationFn: (data: {
      auto_create_deal: boolean;
      deal_pipeline_id: string;
      deal_stage_id: string;
      deal_field_mappings?: Record<string, string>;
      link_deal_to_record?: boolean;
    }) => formsApi.configureDeal(workspaceId!, formId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formDealConfig", workspaceId, formId] });
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => formsApi.disableDeal(workspaceId!, formId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formDealConfig", workspaceId, formId] });
      queryClient.invalidateQueries({ queryKey: ["form", workspaceId, formId] });
    },
  });

  return {
    config,
    isLoading,
    error,
    refetch,
    configure: configureMutation.mutateAsync,
    disable: disableMutation.mutateAsync,
    isConfiguring: configureMutation.isPending,
    isDisabling: disableMutation.isPending,
  };
}

// ==================== Automations Hook ====================

export function useFormAutomations(workspaceId: string | null, formId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: automations,
    isLoading,
    error,
    refetch,
  } = useQuery<AutomationLink[]>({
    queryKey: ["formAutomations", workspaceId, formId],
    queryFn: () => formsApi.listAutomations(workspaceId!, formId!),
    enabled: !!workspaceId && !!formId,
  });

  const linkMutation = useMutation({
    mutationFn: (data: { automation_id: string; conditions?: Record<string, unknown>[] }) =>
      formsApi.linkAutomation(workspaceId!, formId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formAutomations", workspaceId, formId] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (automationId: string) =>
      formsApi.unlinkAutomation(workspaceId!, formId!, automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formAutomations", workspaceId, formId] });
    },
  });

  return {
    automations: automations || [],
    isLoading,
    error,
    refetch,
    linkAutomation: linkMutation.mutateAsync,
    unlinkAutomation: unlinkMutation.mutateAsync,
    isLinking: linkMutation.isPending,
    isUnlinking: unlinkMutation.isPending,
  };
}

// ==================== Submissions Hook ====================

export function useFormSubmissions(workspaceId: string | null, formId: string | null) {
  const {
    data: submissions,
    isLoading,
    error,
    refetch,
  } = useQuery<FormSubmissionListItem[]>({
    queryKey: ["formSubmissions", workspaceId, formId],
    queryFn: () => formsApi.listSubmissions(workspaceId!, formId!),
    enabled: !!workspaceId && !!formId,
  });

  return {
    submissions: submissions || [],
    isLoading,
    error,
    refetch,
  };
}

export function useFormSubmission(
  workspaceId: string | null,
  formId: string | null,
  submissionId: string | null
) {
  const {
    data: submission,
    isLoading,
    error,
    refetch,
  } = useQuery<FormSubmission>({
    queryKey: ["formSubmission", workspaceId, formId, submissionId],
    queryFn: () => formsApi.getSubmission(workspaceId!, formId!, submissionId!),
    enabled: !!workspaceId && !!formId && !!submissionId,
  });

  return {
    submission,
    isLoading,
    error,
    refetch,
  };
}

// ==================== Public Form Hook ====================

export function usePublicForm(publicToken: string | null) {
  const {
    data: form,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["publicForm", publicToken],
    queryFn: () => formsApi.getPublicForm(publicToken!),
    enabled: !!publicToken,
  });

  const submitMutation = useMutation({
    mutationFn: (data: {
      email?: string;
      name?: string;
      data: Record<string, unknown>;
      utm_params?: Record<string, string>;
    }) => formsApi.submitPublicForm(publicToken!, data),
  });

  return {
    form,
    isLoading,
    error,
    submitForm: submitMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
    submitError: submitMutation.error,
  };
}
