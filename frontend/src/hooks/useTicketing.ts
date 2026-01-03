"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ticketFormsApi,
  ticketsApi,
  TicketForm,
  TicketFormListItem,
  TicketFormField,
  Ticket,
  TicketListItem,
  TicketComment,
  TicketStats,
  FormTemplate,
  TicketFormAuthMode,
  TicketFormTemplateType,
  TicketStatus,
  TicketPriority,
  FormTheme,
  FormDestinationConfig,
  ConditionalRule,
  TicketFieldType,
  ValidationRules,
  FieldOption,
  ExternalMappings,
} from "@/lib/api";

// ==================== Form Hooks ====================

export function useTicketForms(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: forms,
    isLoading,
    error,
    refetch,
  } = useQuery<TicketFormListItem[]>({
    queryKey: ["ticketForms", workspaceId],
    queryFn: () => ticketFormsApi.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      template_type?: TicketFormTemplateType;
      auth_mode?: TicketFormAuthMode;
      require_email?: boolean;
    }) => ticketFormsApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForms", workspaceId] });
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: ({ templateType, name }: { templateType: TicketFormTemplateType; name?: string }) =>
      ticketFormsApi.createFromTemplate(workspaceId!, templateType, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForms", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (formId: string) => ticketFormsApi.delete(workspaceId!, formId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForms", workspaceId] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ formId, newName }: { formId: string; newName: string }) =>
      ticketFormsApi.duplicate(workspaceId!, formId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForms", workspaceId] });
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

export function useTicketFormTemplates(workspaceId: string | null) {
  const {
    data: templates,
    isLoading,
    error,
  } = useQuery<Record<string, FormTemplate>>({
    queryKey: ["ticketFormTemplates", workspaceId],
    queryFn: () => ticketFormsApi.getTemplates(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    templates: templates || {},
    isLoading,
    error,
  };
}

export function useTicketForm(workspaceId: string | null, formId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: form,
    isLoading,
    error,
    refetch,
  } = useQuery<TicketForm>({
    queryKey: ["ticketForm", workspaceId, formId],
    queryFn: () => ticketFormsApi.get(workspaceId!, formId!),
    enabled: !!workspaceId && !!formId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<{
      name: string;
      description: string;
      is_active: boolean;
      auth_mode: TicketFormAuthMode;
      require_email: boolean;
      theme: FormTheme;
      success_message: string;
      redirect_url: string;
      destinations: FormDestinationConfig[];
      auto_create_task: boolean;
      default_team_id: string;
      conditional_rules: ConditionalRule[];
    }>) => ticketFormsApi.update(workspaceId!, formId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForm", workspaceId, formId] });
      queryClient.invalidateQueries({ queryKey: ["ticketForms", workspaceId] });
    },
  });

  const addFieldMutation = useMutation({
    mutationFn: (data: {
      name: string;
      field_key: string;
      field_type?: TicketFieldType;
      placeholder?: string;
      default_value?: string;
      help_text?: string;
      is_required?: boolean;
      validation_rules?: ValidationRules;
      options?: FieldOption[];
      position?: number;
      is_visible?: boolean;
      external_mappings?: ExternalMappings;
    }) => ticketFormsApi.addField(workspaceId!, formId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForm", workspaceId, formId] });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ fieldId, data }: {
      fieldId: string;
      data: Partial<{
        name: string;
        placeholder: string;
        default_value: string;
        help_text: string;
        is_required: boolean;
        validation_rules: ValidationRules;
        options: FieldOption[];
        position: number;
        is_visible: boolean;
        external_mappings: ExternalMappings;
      }>;
    }) => ticketFormsApi.updateField(workspaceId!, formId!, fieldId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForm", workspaceId, formId] });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) => ticketFormsApi.deleteField(workspaceId!, formId!, fieldId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForm", workspaceId, formId] });
    },
  });

  const reorderFieldsMutation = useMutation({
    mutationFn: (fieldIds: string[]) => ticketFormsApi.reorderFields(workspaceId!, formId!, fieldIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketForm", workspaceId, formId] });
    },
  });

  return {
    form,
    isLoading,
    error,
    refetch,
    updateForm: updateMutation.mutateAsync,
    addField: addFieldMutation.mutateAsync,
    updateField: updateFieldMutation.mutateAsync,
    deleteField: deleteFieldMutation.mutateAsync,
    reorderFields: reorderFieldsMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isAddingField: addFieldMutation.isPending,
    isUpdatingField: updateFieldMutation.isPending,
    isDeletingField: deleteFieldMutation.isPending,
    isReordering: reorderFieldsMutation.isPending,
  };
}

// ==================== Ticket Hooks ====================

export function useTickets(
  workspaceId: string | null,
  params?: {
    form_id?: string;
    status?: TicketStatus[];
    priority?: TicketPriority[];
    assignee_id?: string;
    team_id?: string;
    sla_breached?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ tickets: TicketListItem[]; total: number; limit: number; offset: number }>({
    queryKey: ["tickets", workspaceId, params],
    queryFn: () => ticketsApi.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const deleteMutation = useMutation({
    mutationFn: (ticketId: string) => ticketsApi.delete(workspaceId!, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets", workspaceId] });
    },
  });

  return {
    tickets: data?.tickets || [],
    total: data?.total || 0,
    limit: data?.limit || 50,
    offset: data?.offset || 0,
    isLoading,
    error,
    refetch,
    deleteTicket: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

export function useTicketStats(workspaceId: string | null) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery<TicketStats>({
    queryKey: ["ticketStats", workspaceId],
    queryFn: () => ticketsApi.getStats(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

export function useTicket(workspaceId: string | null, ticketId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: ticket,
    isLoading,
    error,
    refetch,
  } = useQuery<Ticket>({
    queryKey: ["ticket", workspaceId, ticketId],
    queryFn: () => ticketsApi.get(workspaceId!, ticketId!),
    enabled: !!workspaceId && !!ticketId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<{
      status: TicketStatus;
      priority: TicketPriority;
      assignee_id: string;
      team_id: string;
    }>) => ticketsApi.update(workspaceId!, ticketId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", workspaceId, ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets", workspaceId] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (data: { assignee_id?: string; team_id?: string }) =>
      ticketsApi.assign(workspaceId!, ticketId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", workspaceId, ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets", workspaceId] });
    },
  });

  return {
    ticket,
    isLoading,
    error,
    refetch,
    updateTicket: updateMutation.mutateAsync,
    assignTicket: assignMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isAssigning: assignMutation.isPending,
  };
}

export function useTicketResponses(workspaceId: string | null, ticketId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: responses,
    isLoading,
    error,
    refetch,
  } = useQuery<TicketComment[]>({
    queryKey: ["ticketResponses", workspaceId, ticketId],
    queryFn: () => ticketsApi.listResponses(workspaceId!, ticketId!, true),
    enabled: !!workspaceId && !!ticketId,
  });

  const addResponseMutation = useMutation({
    mutationFn: (data: {
      content: string;
      is_internal?: boolean;
      new_status?: TicketStatus;
    }) => ticketsApi.addResponse(workspaceId!, ticketId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticketResponses", workspaceId, ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket", workspaceId, ticketId] });
    },
  });

  return {
    responses: responses || [],
    isLoading,
    error,
    refetch,
    addResponse: addResponseMutation.mutateAsync,
    isAddingResponse: addResponseMutation.isPending,
  };
}
