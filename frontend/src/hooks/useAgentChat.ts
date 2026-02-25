"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  agentsApi,
  AgentConversation,
  AgentConversationWithMessages,
  AgentMessage,
} from "@/lib/api";

// ==================== Conversation Hooks ====================

export function useAgentConversations(
  workspaceId: string | null,
  agentId: string | null,
  options?: { status?: string }
) {
  const queryClient = useQueryClient();

  const {
    data: conversations,
    isLoading,
    error,
    refetch,
  } = useQuery<AgentConversation[]>({
    queryKey: ["agentConversations", workspaceId, agentId, options?.status],
    queryFn: () =>
      agentsApi.listConversations(workspaceId!, agentId!, {
        status: options?.status,
      }),
    enabled: !!workspaceId && !!agentId,
  });

  const deleteMutation = useMutation({
    mutationFn: (conversationId: string) =>
      agentsApi.deleteConversation(workspaceId!, agentId!, conversationId),
    onSuccess: () => {
      toast.success("Conversation deleted");
      queryClient.invalidateQueries({
        queryKey: ["agentConversations", workspaceId, agentId],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete conversation");
    },
  });

  return {
    conversations: conversations || [],
    isLoading,
    error,
    refetch,
    deleteConversation: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

export function useAgentConversation(
  workspaceId: string | null,
  agentId: string | null,
  conversationId: string | null
) {
  const queryClient = useQueryClient();

  const {
    data: conversation,
    isLoading,
    error,
    refetch,
  } = useQuery<AgentConversationWithMessages>({
    queryKey: ["agentConversation", workspaceId, agentId, conversationId],
    queryFn: () =>
      agentsApi.getConversation(workspaceId!, agentId!, conversationId!),
    enabled: !!workspaceId && !!agentId && !!conversationId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { title?: string; status?: "active" | "completed" | "archived" }) =>
      agentsApi.updateConversation(workspaceId!, agentId!, conversationId!, data),
    onSuccess: () => {
      toast.success("Conversation updated");
      queryClient.invalidateQueries({
        queryKey: ["agentConversation", workspaceId, agentId, conversationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["agentConversations", workspaceId, agentId],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update conversation");
    },
  });

  return {
    conversation,
    messages: conversation?.messages || [],
    isLoading,
    error,
    refetch,
    updateConversation: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

export function useCreateConversation(
  workspaceId: string | null,
  agentId: string | null
) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: { message: string; record_id?: string; title?: string }) =>
      agentsApi.createConversation(workspaceId!, agentId!, data),
    onSuccess: () => {
      toast.success("Conversation created");
      queryClient.invalidateQueries({
        queryKey: ["agentConversations", workspaceId, agentId],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create conversation");
    },
  });

  return {
    createConversation: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

export function useSendMessage(
  workspaceId: string | null,
  agentId: string | null,
  conversationId: string | null
) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (content: string) =>
      agentsApi.sendMessage(workspaceId!, agentId!, conversationId!, { content }),
    onSuccess: (data) => {
      // Update conversation cache with new messages
      queryClient.setQueryData(
        ["agentConversation", workspaceId, agentId, conversationId],
        data
      );
      queryClient.invalidateQueries({
        queryKey: ["agentConversations", workspaceId, agentId],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    },
  });

  return {
    sendMessage: mutation.mutateAsync,
    isSending: mutation.isPending,
    error: mutation.error,
  };
}

// Helper hook for optimistic updates
export function useOptimisticMessage(
  workspaceId: string | null,
  agentId: string | null,
  conversationId: string | null
) {
  const queryClient = useQueryClient();

  const addOptimisticMessage = (content: string) => {
    const queryKey = ["agentConversation", workspaceId, agentId, conversationId];
    const current = queryClient.getQueryData<AgentConversationWithMessages>(queryKey);

    if (current) {
      const optimisticMessage: AgentMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId!,
        execution_id: null,
        role: "user",
        content,
        message_index: current.messages.length,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData(queryKey, {
        ...current,
        messages: [...current.messages, optimisticMessage],
        message_count: current.message_count + 1,
      });
    }
  };

  const addThinkingIndicator = () => {
    const queryKey = ["agentConversation", workspaceId, agentId, conversationId];
    const current = queryClient.getQueryData<AgentConversationWithMessages>(queryKey);

    if (current) {
      const thinkingMessage: AgentMessage = {
        id: "thinking-indicator",
        conversation_id: conversationId!,
        execution_id: null,
        role: "assistant",
        content: "",
        message_index: current.messages.length,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData(queryKey, {
        ...current,
        messages: [...current.messages, thinkingMessage],
      });
    }
  };

  const removeThinkingIndicator = () => {
    const queryKey = ["agentConversation", workspaceId, agentId, conversationId];
    const current = queryClient.getQueryData<AgentConversationWithMessages>(queryKey);

    if (current) {
      queryClient.setQueryData(queryKey, {
        ...current,
        messages: current.messages.filter((m) => m.id !== "thinking-indicator"),
      });
    }
  };

  return {
    addOptimisticMessage,
    addThinkingIndicator,
    removeThinkingIndicator,
  };
}
