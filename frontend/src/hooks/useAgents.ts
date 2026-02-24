"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  agentsApi,
  writingStyleApi,
  CRMAgent,
  CRMAgentExecution,
  AgentToolInfo,
  AgentMetrics,
  AgentCreateData,
  AgentUpdateData,
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
    mutationFn: (data: AgentCreateData) => agentsApi.create(workspaceId!, data),
    onSuccess: () => {
      toast.success("Agent created");
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create agent");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      agentId,
      data,
    }: {
      agentId: string;
      data: AgentUpdateData;
    }) => agentsApi.update(workspaceId!, agentId, data),
    onSuccess: (_, variables) => {
      toast.success("Agent updated");
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, variables.agentId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update agent");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.delete(workspaceId!, agentId),
    onSuccess: () => {
      toast.success("Agent deleted");
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete agent");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.toggle(workspaceId!, agentId),
    onSuccess: (updatedAgent, agentId) => {
      const isActive = updatedAgent?.is_active;
      toast.success(isActive ? "Agent enabled" : "Agent disabled");
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, agentId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to toggle agent");
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
      toast.success("Agent execution started");
      queryClient.invalidateQueries({
        queryKey: ["agentExecutions", workspaceId, variables.agentId],
      });
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["agentMetrics", workspaceId, variables.agentId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to execute agent");
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
    mutationFn: (data: AgentUpdateData) => agentsApi.update(workspaceId!, agentId!, data),
    onSuccess: () => {
      toast.success("Agent updated");
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, agentId] });
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update agent");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: () => agentsApi.toggle(workspaceId!, agentId!),
    onSuccess: (updatedAgent) => {
      const isActive = updatedAgent?.is_active;
      toast.success(isActive ? "Agent enabled" : "Agent disabled");
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, agentId] });
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to toggle agent");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => agentsApi.delete(workspaceId!, agentId!),
    onSuccess: () => {
      toast.success("Agent deleted");
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete agent");
    },
  });

  const executeMutation = useMutation({
    mutationFn: (data: { record_id?: string; context?: Record<string, unknown> }) =>
      agentsApi.execute(workspaceId!, agentId!, data),
    onSuccess: () => {
      toast.success("Agent execution started");
      queryClient.invalidateQueries({
        queryKey: ["agentExecutions", workspaceId, agentId],
      });
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, agentId] });
      queryClient.invalidateQueries({ queryKey: ["agentMetrics", workspaceId, agentId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to execute agent");
    },
  });

  const testMutation = useMutation({
    mutationFn: (data: { context?: Record<string, unknown> }) =>
      agentsApi.testAgent(workspaceId!, agentId!, data),
    onSuccess: () => {
      toast.success("Agent test completed");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to test agent");
    },
  });

  return {
    agent,
    isLoading,
    error,
    refetch,
    updateAgent: updateMutation.mutateAsync,
    toggleAgent: toggleMutation.mutateAsync,
    deleteAgent: deleteMutation.mutateAsync,
    executeAgent: executeMutation.mutateAsync,
    testAgent: testMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isToggling: toggleMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isExecuting: executeMutation.isPending,
    isTesting: testMutation.isPending,
  };
}

export function useAgentMetrics(workspaceId: string | null, agentId: string | null) {
  const {
    data: metrics,
    isLoading,
    error,
    refetch,
  } = useQuery<AgentMetrics>({
    queryKey: ["agentMetrics", workspaceId, agentId],
    queryFn: () => agentsApi.getMetrics(workspaceId!, agentId!),
    enabled: !!workspaceId && !!agentId,
    staleTime: 30000, // 30 seconds
  });

  return {
    metrics,
    isLoading,
    error,
    refetch,
  };
}

export function useCheckMentionHandle(workspaceId: string | null) {
  const checkMutation = useMutation({
    mutationFn: ({ handle, excludeAgentId }: { handle: string; excludeAgentId?: string }) =>
      agentsApi.checkMentionHandle(workspaceId!, handle, excludeAgentId),
  });

  return {
    checkHandle: checkMutation.mutateAsync,
    isChecking: checkMutation.isPending,
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
      toast.success("Writing style analyzed");
      queryClient.invalidateQueries({ queryKey: ["writingStyle", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to analyze writing style");
    },
  });

  const generateEmailMutation = useMutation({
    mutationFn: (data: {
      recipient_name: string;
      purpose: string;
      key_points?: string[];
      tone_override?: string;
    }) => writingStyleApi.generateEmail(workspaceId!, data),
    onSuccess: () => {
      toast.success("Email generated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to generate email");
    },
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
