"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi, ChatChannel, ChatTopic, ChatMessage, ChatFileUpload } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { useAskStore } from "@/stores/askStore";

// ── React Query hooks ────────────────────────────────────────────────

export function useChannels(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["chat", "channels", workspaceId],
    queryFn: () => chatApi.listChannels(workspaceId!),
    enabled: !!workspaceId,
    select: (data) => data.channels,
  });
}

export function useTopics(workspaceId: string | undefined, channelId: string | undefined) {
  return useQuery({
    queryKey: ["chat", "topics", workspaceId, channelId],
    queryFn: () => chatApi.listTopics(workspaceId!, channelId!),
    enabled: !!workspaceId && !!channelId,
    select: (data) => data.topics,
  });
}

export function useMessages(workspaceId: string | undefined, topicId: string | undefined) {
  return useQuery({
    queryKey: ["chat", "messages", workspaceId, topicId],
    queryFn: () => chatApi.listMessages(workspaceId!, topicId!),
    enabled: !!workspaceId && !!topicId,
    select: (data) => data.messages,
  });
}

export function useInbox(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["chat", "inbox", workspaceId],
    queryFn: () => chatApi.getInbox(workspaceId!),
    enabled: !!workspaceId,
    select: (data) => data.topics,
    refetchInterval: 30000,
  });
}

export function useCreateChannel(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; visibility?: string }) =>
      chatApi.createChannel(workspaceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", "channels", workspaceId] });
    },
  });
}

export function useCreateTopic(workspaceId: string, channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; first_message: string }) =>
      chatApi.createTopic(workspaceId, channelId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", "topics", workspaceId, channelId] });
    },
  });
}

export function useSendMessage(workspaceId: string, topicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string; reply_to_id?: string }) =>
      chatApi.sendMessage(workspaceId, topicId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", workspaceId, topicId] });
    },
  });
}

export function useUploadFile(workspaceId: string) {
  return useMutation({
    mutationFn: (file: File) => chatApi.uploadFile(workspaceId, file),
  });
}

export function useCreateMeetLink(workspaceId: string) {
  return useMutation({
    mutationFn: () => chatApi.createMeetLink(workspaceId),
  });
}

export function useSetupChat(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => chatApi.setupChat(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", "channels", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["chat", "inbox", workspaceId] });
    },
  });
}

export function useJoinChannel(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => chatApi.joinChannel(workspaceId, channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", "channels", workspaceId] });
    },
  });
}

// ── WebSocket hook ───────────────────────────────────────────────────

export function useChatWebSocket(workspaceId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttemptRef = useRef(0);
  const queryClient = useQueryClient();
  const maxReconnectAttempts = 10;

  const connect = useCallback(() => {
    if (!workspaceId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//localhost:8000`;
    const authToken = localStorage.getItem("token") || "";
    const wsUrl = `${host}/api/v1/workspaces/${workspaceId}/chat/ws?token=${encodeURIComponent(authToken)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      const type = data.type;
      const payload = data.data || data;
      // Use getState() to avoid subscribing to store changes
      const store = useChatStore.getState();
      const askStore = useAskStore.getState();

      switch (type) {
        case "new_message":
          queryClient.invalidateQueries({ queryKey: ["chat", "messages", workspaceId, payload.topic_id] });
          queryClient.invalidateQueries({ queryKey: ["chat", "topics", workspaceId, payload.channel_id] });
          queryClient.invalidateQueries({ queryKey: ["chat", "inbox", workspaceId] });
          // Increment unread if not in this topic
          if (store.activeTopicId !== payload.topic_id) {
            store.incrementUnread(payload.channel_id);
          }
          break;

        case "message_updated":
        case "message_deleted":
          queryClient.invalidateQueries({ queryKey: ["chat", "messages", workspaceId, payload.topic_id] });
          break;

        case "new_topic":
        case "topic_updated":
          queryClient.invalidateQueries({ queryKey: ["chat", "topics", workspaceId, payload.channel_id] });
          break;

        case "channel_created":
        case "channel_updated":
          queryClient.invalidateQueries({ queryKey: ["chat", "channels", workspaceId] });
          break;

        case "typing":
          store.addTypingUser({
            developer_id: payload.developer_id,
            developer_name: payload.developer_name,
            topic_id: payload.topic_id,
            channel_id: payload.channel_id,
            timestamp: Date.now(),
          });
          break;

        case "stop_typing":
          store.removeTypingUser(payload.developer_id, payload.topic_id);
          break;

        case "presence_update":
          store.updatePresence(payload.developer_id, payload.status, payload.name);
          break;

        // AI conversation events
        case "ai_new_message":
          queryClient.invalidateQueries({ queryKey: ["askConversation", workspaceId, payload.conversation_id] });
          queryClient.invalidateQueries({ queryKey: ["askConversations", workspaceId] });
          break;

        case "ai_typing":
          askStore.addAiTypingUser({
            developer_id: payload.developer_id,
            developer_name: payload.developer_name,
            conversation_id: payload.conversation_id,
            timestamp: Date.now(),
          });
          break;

        case "ai_stop_typing":
          askStore.removeAiTypingUser(payload.developer_id, payload.conversation_id);
          break;

        case "ai_streaming_done":
          queryClient.invalidateQueries({ queryKey: ["askConversation", workspaceId, payload.conversation_id] });
          queryClient.invalidateQueries({ queryKey: ["askConversations", workspaceId] });
          break;

        case "ai_queue_update":
          askStore.setQueueState(payload.queue_length ?? 0, null);
          break;

        case "ai_participant_joined":
        case "ai_participant_left":
          queryClient.invalidateQueries({ queryKey: ["askConversation", workspaceId, payload.conversation_id] });
          queryClient.invalidateQueries({ queryKey: ["askParticipants", workspaceId, payload.conversation_id] });
          break;

        case "pong":
          break;
      }
    };

    ws.onclose = (event) => {
      // Don't reconnect if this WS has been superseded by a new connection
      if (wsRef.current !== ws) return;

      setIsConnected(false);
      wsRef.current = null;

      if (event.code === 4001 || reconnectAttemptRef.current >= maxReconnectAttempts) {
        return;
      }

      reconnectAttemptRef.current += 1;
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [workspaceId, queryClient]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // Mark this WS as superseded before closing so onclose won't reconnect
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.close();
      }
    };
  }, [connect]);

  // Keep-alive ping
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Clear stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      useChatStore.getState().clearStaleTyping();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const sendTyping = useCallback(
    (topicId: string, channelId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "typing", topic_id: topicId, channel_id: channelId }));
      }
    },
    []
  );

  const sendStopTyping = useCallback(
    (topicId: string, channelId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "stop_typing", topic_id: topicId, channel_id: channelId }));
      }
    },
    []
  );

  const markRead = useCallback(
    (topicId: string, messageId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "mark_read", topic_id: topicId, message_id: messageId }));
      }
    },
    []
  );

  const subscribeChannels = useCallback(
    (channelIds: string[]) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "subscribe_channels", channel_ids: channelIds }));
      }
    },
    []
  );

  const subscribeAiConversations = useCallback(
    (conversationIds: string[]) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "subscribe_ai_conversations", conversation_ids: conversationIds }));
      }
    },
    []
  );

  const sendAiTyping = useCallback(
    (conversationId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ai_typing", conversation_id: conversationId }));
      }
    },
    []
  );

  const sendAiStopTyping = useCallback(
    (conversationId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ai_stop_typing", conversation_id: conversationId }));
      }
    },
    []
  );

  return { isConnected, sendTyping, sendStopTyping, markRead, subscribeChannels, subscribeAiConversations, sendAiTyping, sendAiStopTyping };
}
