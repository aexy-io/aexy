"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  automationAgentsApi,
  AutomationAgentTrigger,
  AutomationAgentTriggerListItem,
  AutomationAgentTriggerCreate,
  AutomationAgentTriggerUpdate,
  AutomationAgentExecution,
  AutomationAgentExecutionListItem,
} from "@/lib/api";
import { EMPTY_ARRAY } from "@/lib/emptyArray";

// =============================================================================
// Agent Trigger Hooks
// =============================================================================

/**
 * Hook for managing agent triggers on an automation
 */
export function useAutomationAgentTriggers(
  workspaceId: string | null,
  automationId: string | null,
  options?: {
    triggerPoint?: string;
    activeOnly?: boolean;
  }
) {
  const queryClient = useQueryClient();

  const {
    data: triggers,
    isLoading,
    error,
    refetch,
  } = useQuery<AutomationAgentTriggerListItem[]>({
    queryKey: ["automationAgentTriggers", workspaceId, automationId, options],
    queryFn: () =>
      automationAgentsApi.listTriggers(workspaceId!, automationId!, {
        trigger_point: options?.triggerPoint,
        active_only: options?.activeOnly,
      }),
    enabled: !!workspaceId && !!automationId,
  });

  const createMutation = useMutation({
    mutationFn: (data: AutomationAgentTriggerCreate) =>
      automationAgentsApi.createTrigger(workspaceId!, automationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["automationAgentTriggers", workspaceId, automationId],
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      triggerId,
      data,
    }: {
      triggerId: string;
      data: AutomationAgentTriggerUpdate;
    }) => automationAgentsApi.updateTrigger(workspaceId!, automationId!, triggerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["automationAgentTriggers", workspaceId, automationId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (triggerId: string) =>
      automationAgentsApi.deleteTrigger(workspaceId!, automationId!, triggerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["automationAgentTriggers", workspaceId, automationId],
      });
    },
  });

  return {
    triggers: triggers ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createTrigger: createMutation.mutateAsync,
    updateTrigger: updateMutation.mutateAsync,
    deleteTrigger: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Hook for getting a single agent trigger
 */
export function useAutomationAgentTrigger(
  workspaceId: string | null,
  automationId: string | null,
  triggerId: string | null
) {
  const { data, isLoading, error, refetch } = useQuery<AutomationAgentTrigger>({
    queryKey: ["automationAgentTrigger", workspaceId, automationId, triggerId],
    queryFn: () =>
      automationAgentsApi.getTrigger(workspaceId!, automationId!, triggerId!),
    enabled: !!workspaceId && !!automationId && !!triggerId,
  });

  return {
    trigger: data,
    isLoading,
    error,
    refetch,
  };
}

// =============================================================================
// Agent Execution Hooks
// =============================================================================

/**
 * Hook for listing agent executions for an automation
 */
export function useAutomationAgentExecutions(
  workspaceId: string | null,
  automationId: string | null,
  options?: {
    skip?: number;
    limit?: number;
  }
) {
  const {
    data: executions,
    isLoading,
    error,
    refetch,
  } = useQuery<AutomationAgentExecutionListItem[]>({
    queryKey: ["automationAgentExecutions", workspaceId, automationId, options],
    queryFn: () =>
      automationAgentsApi.listAutomationExecutions(workspaceId!, automationId!, {
        skip: options?.skip,
        limit: options?.limit,
      }),
    enabled: !!workspaceId && !!automationId,
  });

  return {
    executions: executions ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for getting a single agent execution
 */
export function useAutomationAgentExecution(
  workspaceId: string | null,
  automationId: string | null,
  executionId: string | null
) {
  const { data, isLoading, error, refetch } = useQuery<AutomationAgentExecution>({
    queryKey: ["automationAgentExecution", workspaceId, automationId, executionId],
    queryFn: () =>
      automationAgentsApi.getExecution(workspaceId!, automationId!, executionId!),
    enabled: !!workspaceId && !!automationId && !!executionId,
  });

  return {
    execution: data,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for listing automation-triggered executions for an agent
 */
export function useAgentAutomationExecutions(
  workspaceId: string | null,
  agentId: string | null,
  options?: {
    skip?: number;
    limit?: number;
  }
) {
  const {
    data: executions,
    isLoading,
    error,
    refetch,
  } = useQuery<AutomationAgentExecutionListItem[]>({
    queryKey: ["agentAutomationExecutions", workspaceId, agentId, options],
    queryFn: () =>
      automationAgentsApi.listAgentAutomationExecutions(workspaceId!, agentId!, {
        skip: options?.skip,
        limit: options?.limit,
      }),
    enabled: !!workspaceId && !!agentId,
  });

  return {
    executions: executions ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
  };
}
