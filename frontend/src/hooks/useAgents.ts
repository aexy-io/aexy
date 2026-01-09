"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  agentsApi,
  writingStyleApi,
  CRMAgent,
  CRMAgentExecution,
  AgentToolInfo,
  WritingStyle,
  GeneratedEmail,
} from "@/lib/api";

// ==================== Agent Hooks ====================

export function useAgents(
  workspaceId: string | null,
  options?: {
    agentType?: string;
    isActive?: boolean;
    includeSystem?: boolean;
  }
) {
  const queryClient = useQueryClient();

  const {
    data: agents,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMAgent[]>({
    queryKey: ["agents", workspaceId, options],
    queryFn: () =>
      agentsApi.list(workspaceId!, {
        agent_type: options?.agentType,
        is_active: options?.isActive,
        include_system: options?.includeSystem,
      }),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      agent_type?: string;
      goal?: string;
      system_prompt?: string;
      tools?: string[];
      max_iterations?: number;
      timeout_seconds?: number;
      model?: string;
    }) => agentsApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      agentId,
      data,
    }: {
      agentId: string;
      data: Partial<{
        name: string;
        description: string;
        goal: string;
        system_prompt: string;
        tools: string[];
        max_iterations: number;
        timeout_seconds: number;
        model: string;
        is_active: boolean;
      }>;
    }) => agentsApi.update(workspaceId!, agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.delete(workspaceId!, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.toggle(workspaceId!, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: ({
      agentId,
      data,
    }: {
      agentId: string;
      data: { record_id?: string; context?: Record<string, unknown> };
    }) => agentsApi.execute(workspaceId!, agentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["agentExecutions", workspaceId, variables.agentId],
      });
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
  });

  return {
    agents: agents || [],
    isLoading,
    error,
    refetch,
    createAgent: createMutation.mutateAsync,
    updateAgent: updateMutation.mutateAsync,
    deleteAgent: deleteMutation.mutateAsync,
    toggleAgent: toggleMutation.mutateAsync,
    executeAgent: executeMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isExecuting: executeMutation.isPending,
  };
}

export function useAgent(workspaceId: string | null, agentId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: agent,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMAgent>({
    queryKey: ["agent", workspaceId, agentId],
    queryFn: () => agentsApi.get(workspaceId!, agentId!),
    enabled: !!workspaceId && !!agentId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<{
      name: string;
      description: string;
      goal: string;
      system_prompt: string;
      tools: string[];
      max_iterations: number;
      timeout_seconds: number;
      model: string;
      is_active: boolean;
    }>) => agentsApi.update(workspaceId!, agentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, agentId] });
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: (data: { record_id?: string; context?: Record<string, unknown> }) =>
      agentsApi.execute(workspaceId!, agentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agentExecutions", workspaceId, agentId],
      });
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, agentId] });
    },
  });

  return {
    agent,
    isLoading,
    error,
    refetch,
    updateAgent: updateMutation.mutateAsync,
    executeAgent: executeMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isExecuting: executeMutation.isPending,
  };
}

export function useAgentTools(workspaceId: string | null) {
  const {
    data: tools,
    isLoading,
    error,
  } = useQuery<AgentToolInfo[]>({
    queryKey: ["agentTools", workspaceId],
    queryFn: () => agentsApi.getTools(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    tools: tools || [],
    isLoading,
    error,
  };
}

export function useAgentExecutions(
  workspaceId: string | null,
  agentId: string | null,
  status?: string
) {
  const {
    data: executions,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMAgentExecution[]>({
    queryKey: ["agentExecutions", workspaceId, agentId, status],
    queryFn: () =>
      agentsApi.listExecutions(workspaceId!, agentId!, { status }),
    enabled: !!workspaceId && !!agentId,
  });

  return {
    executions: executions || [],
    isLoading,
    error,
    refetch,
  };
}

export function useAgentExecution(
  workspaceId: string | null,
  agentId: string | null,
  executionId: string | null
) {
  const {
    data: execution,
    isLoading,
    error,
    refetch,
  } = useQuery<CRMAgentExecution>({
    queryKey: ["agentExecution", workspaceId, agentId, executionId],
    queryFn: () =>
      agentsApi.getExecution(workspaceId!, agentId!, executionId!),
    enabled: !!workspaceId && !!agentId && !!executionId,
    refetchInterval: (query) => {
      // Poll for updates if execution is still running
      const data = query.state.data;
      if (data && (data.status === "pending" || data.status === "running")) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });

  return {
    execution,
    isLoading,
    error,
    refetch,
  };
}

// ==================== Writing Style Hooks ====================

export function useWritingStyle(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: style,
    isLoading,
    error,
    refetch,
  } = useQuery<WritingStyle | null>({
    queryKey: ["writingStyle", workspaceId],
    queryFn: () => writingStyleApi.get(workspaceId!),
    enabled: !!workspaceId,
  });

  const analyzeMutation = useMutation({
    mutationFn: (maxSamples?: number) =>
      writingStyleApi.analyze(workspaceId!, maxSamples),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["writingStyle", workspaceId] });
    },
  });

  const generateEmailMutation = useMutation({
    mutationFn: (data: {
      recipient_name: string;
      purpose: string;
      key_points?: string[];
      tone_override?: string;
    }) => writingStyleApi.generateEmail(workspaceId!, data),
  });

  return {
    style,
    isLoading,
    error,
    refetch,
    analyzeStyle: analyzeMutation.mutateAsync,
    generateEmail: generateEmailMutation.mutateAsync,
    isAnalyzing: analyzeMutation.isPending,
    isGenerating: generateEmailMutation.isPending,
  };
}
