"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { askApi, AskConversation, AskConversationWithMessages } from "@/lib/api";
import { useAskStore } from "@/stores/askStore";

// --- CRUD Hooks ---

export function useAskConversations(workspaceId: string | null | undefined) {
  return useQuery<AskConversation[]>({
    queryKey: ["askConversations", workspaceId],
    queryFn: () => askApi.listConversations(workspaceId!),
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
  };
}
