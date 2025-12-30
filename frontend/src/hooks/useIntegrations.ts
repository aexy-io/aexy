"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  integrationsApi,
  JiraIntegration,
  LinearIntegration,
  ConnectionTestResult,
  SyncResult,
  RemoteStatus,
  RemoteField,
  RemoteProject,
  RemoteTeam,
  StatusMapping,
  FieldMapping,
} from "@/lib/api";

// Jira Integration Hook
export function useJiraIntegration(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: integration,
    isLoading,
    error,
    refetch,
  } = useQuery<JiraIntegration | null>({
    queryKey: ["jiraIntegration", workspaceId],
    queryFn: () => integrationsApi.getJiraIntegration(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      site_url: string;
      user_email: string;
      api_token: string;
    }) => integrationsApi.createJiraIntegration(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jiraIntegration", workspaceId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (data?: {
      site_url: string;
      user_email: string;
      api_token: string;
    }) => integrationsApi.testJiraConnection(workspaceId!, data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      project_mappings?: Record<string, { project_key: string; jql_filter?: string }>;
      status_mappings?: StatusMapping[];
      field_mappings?: FieldMapping[];
      sync_enabled?: boolean;
      sync_direction?: "import" | "bidirectional";
    }) => integrationsApi.updateJiraIntegration(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jiraIntegration", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => integrationsApi.deleteJiraIntegration(workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jiraIntegration", workspaceId] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (teamId?: string) => integrationsApi.syncJira(workspaceId!, teamId),
  });

  return {
    integration,
    isLoading,
    error,
    refetch,
    isConnected: !!integration,
    createIntegration: createMutation.mutateAsync,
    testConnection: testMutation.mutateAsync,
    updateIntegration: updateMutation.mutateAsync,
    deleteIntegration: deleteMutation.mutateAsync,
    syncIssues: syncMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isTesting: testMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isSyncing: syncMutation.isPending,
    testResult: testMutation.data as ConnectionTestResult | undefined,
    syncResult: syncMutation.data as SyncResult | undefined,
  };
}

// Jira Remote Data Hooks
export function useJiraStatuses(workspaceId: string | null, enabled: boolean = true) {
  const {
    data: statuses,
    isLoading,
    error,
    refetch,
  } = useQuery<RemoteStatus[]>({
    queryKey: ["jiraStatuses", workspaceId],
    queryFn: () => integrationsApi.getJiraStatuses(workspaceId!),
    enabled: !!workspaceId && enabled,
  });

  return {
    statuses: statuses || [],
    isLoading,
    error,
    refetch,
  };
}

export function useJiraFields(workspaceId: string | null, enabled: boolean = true) {
  const {
    data: fields,
    isLoading,
    error,
    refetch,
  } = useQuery<RemoteField[]>({
    queryKey: ["jiraFields", workspaceId],
    queryFn: () => integrationsApi.getJiraFields(workspaceId!),
    enabled: !!workspaceId && enabled,
  });

  return {
    fields: fields || [],
    isLoading,
    error,
    refetch,
  };
}

export function useJiraProjects(workspaceId: string | null, enabled: boolean = true) {
  const {
    data: projects,
    isLoading,
    error,
    refetch,
  } = useQuery<RemoteProject[]>({
    queryKey: ["jiraProjects", workspaceId],
    queryFn: () => integrationsApi.getJiraProjects(workspaceId!),
    enabled: !!workspaceId && enabled,
  });

  return {
    projects: projects || [],
    isLoading,
    error,
    refetch,
  };
}

// Linear Integration Hook
export function useLinearIntegration(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: integration,
    isLoading,
    error,
    refetch,
  } = useQuery<LinearIntegration | null>({
    queryKey: ["linearIntegration", workspaceId],
    queryFn: () => integrationsApi.getLinearIntegration(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { api_key: string }) =>
      integrationsApi.createLinearIntegration(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linearIntegration", workspaceId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (data?: { api_key: string }) =>
      integrationsApi.testLinearConnection(workspaceId!, data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      team_mappings?: Record<string, { linear_team_id: string; labels_filter?: string[] }>;
      status_mappings?: StatusMapping[];
      field_mappings?: FieldMapping[];
      sync_enabled?: boolean;
    }) => integrationsApi.updateLinearIntegration(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linearIntegration", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => integrationsApi.deleteLinearIntegration(workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linearIntegration", workspaceId] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (teamId?: string) => integrationsApi.syncLinear(workspaceId!, teamId),
  });

  return {
    integration,
    isLoading,
    error,
    refetch,
    isConnected: !!integration,
    createIntegration: createMutation.mutateAsync,
    testConnection: testMutation.mutateAsync,
    updateIntegration: updateMutation.mutateAsync,
    deleteIntegration: deleteMutation.mutateAsync,
    syncIssues: syncMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isTesting: testMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isSyncing: syncMutation.isPending,
    testResult: testMutation.data as ConnectionTestResult | undefined,
    syncResult: syncMutation.data as SyncResult | undefined,
  };
}

// Linear Remote Data Hooks
export function useLinearStates(workspaceId: string | null, enabled: boolean = true) {
  const {
    data: states,
    isLoading,
    error,
    refetch,
  } = useQuery<RemoteStatus[]>({
    queryKey: ["linearStates", workspaceId],
    queryFn: () => integrationsApi.getLinearStates(workspaceId!),
    enabled: !!workspaceId && enabled,
  });

  return {
    states: states || [],
    isLoading,
    error,
    refetch,
  };
}

export function useLinearTeams(workspaceId: string | null, enabled: boolean = true) {
  const {
    data: teams,
    isLoading,
    error,
    refetch,
  } = useQuery<RemoteTeam[]>({
    queryKey: ["linearTeams", workspaceId],
    queryFn: () => integrationsApi.getLinearTeams(workspaceId!),
    enabled: !!workspaceId && enabled,
  });

  return {
    teams: teams || [],
    isLoading,
    error,
    refetch,
  };
}

export function useLinearFields(workspaceId: string | null, enabled: boolean = true) {
  const {
    data: fields,
    isLoading,
    error,
    refetch,
  } = useQuery<RemoteField[]>({
    queryKey: ["linearFields", workspaceId],
    queryFn: () => integrationsApi.getLinearFields(workspaceId!),
    enabled: !!workspaceId && enabled,
  });

  return {
    fields: fields || [],
    isLoading,
    error,
    refetch,
  };
}

// Combined Integrations Overview
export function useIntegrations(workspaceId: string | null) {
  const jira = useJiraIntegration(workspaceId);
  const linear = useLinearIntegration(workspaceId);

  return {
    jira: {
      integration: jira.integration,
      isConnected: jira.isConnected,
      isLoading: jira.isLoading,
    },
    linear: {
      integration: linear.integration,
      isConnected: linear.isConnected,
      isLoading: linear.isLoading,
    },
    isLoading: jira.isLoading || linear.isLoading,
    connectedCount: (jira.isConnected ? 1 : 0) + (linear.isConnected ? 1 : 0),
  };
}
