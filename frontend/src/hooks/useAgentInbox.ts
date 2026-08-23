"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  agentsApi,
  AgentInboxMessage,
  EmailRoutingRule,
  EmailEnableResponse,
  InboxActionResponse,
} from "@/lib/api";
import { EMPTY_ARRAY } from "@/lib/emptyArray";

// ==================== Agent Inbox Hooks ====================

/**
 * Hook for managing agent inbox messages.
 */
export function useAgentInbox(
  workspaceId: string | null,
  agentId: string | null,
  options?: {
    status?: string;
    priority?: string;
    skip?: number;
    limit?: number;
  }
) {
  const queryClient = useQueryClient();

  const {
    data: messages,
    isLoading,
    error,
    refetch,
  } = useQuery<AgentInboxMessage[]>({
    queryKey: ["agentInbox", workspaceId, agentId, options],
    queryFn: () => agentsApi.listInboxMessages(workspaceId!, agentId!, options),
    enabled: !!workspaceId && !!agentId,
    // Background poll so new messages show up without requiring the
    // operator to mash the refresh button. Faster cadence when any
    // message is still being processed by the agent.
    refetchInterval: (query) => {
      const data = query.state.data;
      const inFlight = Array.isArray(data)
        ? data.some((m) => m.status === "processing" || m.status === "pending")
        : false;
      return inFlight ? 5000 : 30000;
    },
    refetchIntervalInBackground: false,
  });

  const replyMutation = useMutation({
    mutationFn: ({
      messageId,
      body,
      useSuggested,
      subject,
    }: {
      messageId: string;
      body: string;
      useSuggested?: boolean;
      subject?: string;
    }) =>
      agentsApi.replyToInboxMessage(workspaceId!, agentId!, messageId, {
        body,
        use_suggested: useSuggested,
        subject,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentInbox", workspaceId, agentId] });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: ({
      messageId,
      escalateTo,
      note,
    }: {
      messageId: string;
      escalateTo: string;
      note?: string;
    }) =>
      agentsApi.escalateInboxMessage(workspaceId!, agentId!, messageId, {
        escalate_to: escalateTo,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentInbox", workspaceId, agentId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (messageId: string) =>
      agentsApi.archiveInboxMessage(workspaceId!, agentId!, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentInbox", workspaceId, agentId] });
    },
  });

  // UX-INB-022: inverse mutation backing the archive toast's Undo
  // button. Restores `pending` status so the AI queue picks it back
  // up. Cache invalidation is the same as archive — the row shows up
  // again in the unfiltered list.
  const unarchiveMutation = useMutation({
    mutationFn: (messageId: string) =>
      agentsApi.unarchiveInboxMessage(workspaceId!, agentId!, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentInbox", workspaceId, agentId] });
    },
  });

  const processMutation = useMutation({
    mutationFn: (messageId: string) =>
      agentsApi.processInboxMessage(workspaceId!, agentId!, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentInbox", workspaceId, agentId] });
    },
  });

  return {
    messages: messages ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    replyToMessage: replyMutation.mutateAsync,
    escalateMessage: escalateMutation.mutateAsync,
    archiveMessage: archiveMutation.mutateAsync,
    unarchiveMessage: unarchiveMutation.mutateAsync,
    processMessage: processMutation.mutateAsync,
    isReplying: replyMutation.isPending,
    isEscalating: escalateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isUnarchiving: unarchiveMutation.isPending,
    isProcessing: processMutation.isPending,
  };
}

/**
 * Hook for fetching a single inbox message.
 */
export function useAgentInboxMessage(
  workspaceId: string | null,
  agentId: string | null,
  messageId: string | null
) {
  const {
    data: message,
    isLoading,
    error,
    refetch,
  } = useQuery<AgentInboxMessage>({
    queryKey: ["agentInboxMessage", workspaceId, agentId, messageId],
    queryFn: () => agentsApi.getInboxMessage(workspaceId!, agentId!, messageId!),
    enabled: !!workspaceId && !!agentId && !!messageId,
  });

  return {
    message,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Fetch every message in the same thread as `messageId`.
 * Returns the messages ordered by created_at ASC, suitable for the
 * inbox thread strip. Empty array means the message is an orphan
 * (no thread_id and no in_reply_to chain). UX-INB-027 / UX-DEF-007.
 */
export function useAgentInboxThread(
  workspaceId: string | null,
  agentId: string | null,
  messageId: string | null,
  enabled = true,
) {
  const {
    data: thread,
    isLoading,
    error,
  } = useQuery<AgentInboxMessage[]>({
    queryKey: ["agentInboxThread", workspaceId, agentId, messageId],
    queryFn: () => agentsApi.getInboxThread(workspaceId!, agentId!, messageId!),
    enabled: enabled && !!workspaceId && !!agentId && !!messageId,
  });

  return {
    thread: thread ?? [],
    isLoading,
    error,
  };
}

// ==================== Agent Email Hooks ====================

/**
 * Hook for fetching available email domains.
 */
export function useEmailDomains(workspaceId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["emailDomains", workspaceId],
    queryFn: () => agentsApi.listEmailDomains(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    domains: data?.domains ?? EMPTY_ARRAY,
    defaultDomain: data?.default_domain || "",
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for enabling/disabling email on an agent.
 */
export function useAgentEmail(workspaceId: string | null, agentId: string | null) {
  const queryClient = useQueryClient();

  const enableMutation = useMutation({
    mutationFn: ({
      preferredHandle,
      domain,
    }: {
      preferredHandle?: string;
      domain?: string;
    }) => agentsApi.enableEmail(workspaceId!, agentId!, preferredHandle, domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, agentId] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => agentsApi.disableEmail(workspaceId!, agentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["agent", workspaceId, agentId] });
    },
  });

  return {
    enableEmail: enableMutation.mutateAsync,
    disableEmail: disableMutation.mutateAsync,
    isEnabling: enableMutation.isPending,
    isDisabling: disableMutation.isPending,
  };
}

// ==================== Routing Rules Hooks ====================

/**
 * Hook for managing email routing rules.
 */
export function useRoutingRules(workspaceId: string | null, agentId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: rules,
    isLoading,
    error,
    refetch,
  } = useQuery<EmailRoutingRule[]>({
    queryKey: ["routingRules", workspaceId, agentId],
    queryFn: () => agentsApi.listRoutingRules(workspaceId!, agentId!),
    enabled: !!workspaceId && !!agentId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      rule_type: "domain" | "sender" | "subject_contains" | "keyword";
      rule_value: string;
      priority?: number;
    }) => agentsApi.createRoutingRule(workspaceId!, agentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routingRules", workspaceId, agentId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) =>
      agentsApi.deleteRoutingRule(workspaceId!, agentId!, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routingRules", workspaceId, agentId] });
    },
  });

  return {
    rules: rules ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createRule: createMutation.mutateAsync,
    deleteRule: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
