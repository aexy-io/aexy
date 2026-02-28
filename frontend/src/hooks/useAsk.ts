"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { askApi, AskConversation, AskConversationWithMessages, AskParticipant, AskShareLink, AskQueueStatus } from "@/lib/api";
import { useAskStore } from "@/stores/askStore";

// --- CRUD Hooks ---

export function useAskConversations(workspaceId: string | null | undefined, search?: string) {
  return useQuery<AskConversation[]>({
    queryKey: ["askConversations", workspaceId, search],
    queryFn: () => askApi.listConversations(workspaceId!, search),
    enabled: !!workspaceId,
  });
}

export function useAskConversation(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  return useQuery<AskConversationWithMessages>({
    queryKey: ["askConversation", workspaceId, conversationId],
    queryFn: () => askApi.getConversation(workspaceId!, conversationId!),
    enabled: !!workspaceId && !!conversationId,
  });
}

export function useCreateAskConversation(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => askApi.createConversation(workspaceId!, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["askConversations", workspaceId] });
    },
  });
}

export function useDeleteAskConversation(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      askApi.deleteConversation(workspaceId!, conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["askConversations", workspaceId] });
    },
  });
}

// --- Participant Hooks ---

export function useAskParticipants(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  return useQuery<AskParticipant[]>({
    queryKey: ["askParticipants", workspaceId, conversationId],
    queryFn: () => askApi.listParticipants(workspaceId!, conversationId!),
    enabled: !!workspaceId && !!conversationId,
  });
}

export function useAddAskParticipant(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { developerId: string; permission?: string }) =>
      askApi.addParticipant(workspaceId!, conversationId!, data.developerId, data.permission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["askParticipants", workspaceId, conversationId] });
      queryClient.invalidateQueries({ queryKey: ["askConversation", workspaceId, conversationId] });
    },
  });
}

export function useUpdateAskParticipant(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { developerId: string; permission: string }) =>
      askApi.updateParticipant(workspaceId!, conversationId!, data.developerId, data.permission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["askParticipants", workspaceId, conversationId] });
    },
  });
}

export function useRemoveAskParticipant(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (developerId: string) =>
      askApi.removeParticipant(workspaceId!, conversationId!, developerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["askParticipants", workspaceId, conversationId] });
      queryClient.invalidateQueries({ queryKey: ["askConversation", workspaceId, conversationId] });
    },
  });
}

// --- Share Link Hooks ---

export function useAskShareLinks(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  return useQuery<AskShareLink[]>({
    queryKey: ["askShareLinks", workspaceId, conversationId],
    queryFn: () => askApi.listShareLinks(workspaceId!, conversationId!),
    enabled: !!workspaceId && !!conversationId,
  });
}

export function useCreateAskShareLink(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { permission?: string; password?: string; expires_at?: string; max_uses?: number }) =>
      askApi.createShareLink(workspaceId!, conversationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["askShareLinks", workspaceId, conversationId] });
    },
  });
}

export function useRevokeAskShareLink(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      askApi.revokeShareLink(workspaceId!, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["askShareLinks"] });
    },
  });
}

export function useJoinAskShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { token: string; password?: string }) =>
      askApi.joinShareLink(data.token, data.password),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["askConversations", conv.workspace_id] });
    },
  });
}

// --- Queue Status Hook ---

export function useAskQueueStatus(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  return useQuery<AskQueueStatus>({
    queryKey: ["askQueueStatus", workspaceId, conversationId],
    queryFn: () => askApi.getQueueStatus(workspaceId!, conversationId!),
    enabled: !!workspaceId && !!conversationId,
    refetchInterval: 5000,
  });
}

// --- Streaming Hook ---

export function useStreamMessage(workspaceId: string | null | undefined, conversationId: string | null | undefined) {
  const queryClient = useQueryClient();
  const store = useAskStore();
  const abortRef = useRef<AbortController | null>(null);

  const streamMessage = useCallback(
    async (content: string) => {
      if (!workspaceId || !conversationId) return;

      // Reset streaming state
      store.resetStreaming();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = localStorage.getItem("token");
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        const url = `${baseUrl}/workspaces/${workspaceId}/ask/conversations/${conversationId}/messages`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const event = JSON.parse(dataStr);

              switch (event.type) {
                case "text_delta":
                  store.appendText(event.text);
                  break;

                case "tool_use_start":
                  store.addToolCall({
                    id: event.id,
                    name: event.name,
                    input: event.input || {},
                  });
                  break;

                case "tool_result":
                  store.setToolResult(
                    event.id,
                    event.result,
                    event.status || "success"
                  );
                  break;

                case "queued":
                  // Message was queued because AI is busy
                  store.setQueued(true, event.queue_position);
                  break;

                case "done":
                  // Refresh conversation data from server
                  queryClient.invalidateQueries({
                    queryKey: ["askConversation", workspaceId, conversationId],
                  });
                  queryClient.invalidateQueries({
                    queryKey: ["askConversations", workspaceId],
                  });
                  store.resetStreaming();
                  break;

                case "error":
                  console.error("Stream error:", event.message);
                  store.resetStreaming();
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Stream failed:", err);
        }
        store.resetStreaming();
      }
    },
    [workspaceId, conversationId, queryClient, store]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    store.resetStreaming();
  }, [store]);

  return {
    streamMessage,
    cancelStream,
    isStreaming: store.isStreaming,
    isQueued: store.isQueued,
    queuePosition: store.queuePosition,
  };
}
