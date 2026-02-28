"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import { useChatWebSocket } from "@/hooks/useChat";
import { useWorkspace } from "@/hooks/useWorkspace";

interface ChatWebSocketContextValue {
  isConnected: boolean;
  sendTyping: (topicId: string, channelId: string) => void;
  sendStopTyping: (topicId: string, channelId: string) => void;
  markRead: (topicId: string, messageId: string) => void;
  subscribeChannels: (channelIds: string[]) => void;
  subscribeAiConversations: (conversationIds: string[]) => void;
  sendAiTyping: (conversationId: string) => void;
  sendAiStopTyping: (conversationId: string) => void;
  workspaceId: string | undefined;
}

const ChatWebSocketContext = createContext<ChatWebSocketContextValue | null>(null);

export function ChatWebSocketProvider({ children }: { children: ReactNode }) {
  const { currentWorkspaceId } = useWorkspace();
  const ws = useChatWebSocket(currentWorkspaceId ?? undefined);

  const value = useMemo<ChatWebSocketContextValue>(
    () => ({
      isConnected: ws.isConnected,
      sendTyping: ws.sendTyping,
      sendStopTyping: ws.sendStopTyping,
      markRead: ws.markRead,
      subscribeChannels: ws.subscribeChannels,
      subscribeAiConversations: ws.subscribeAiConversations,
      sendAiTyping: ws.sendAiTyping,
      sendAiStopTyping: ws.sendAiStopTyping,
      workspaceId: currentWorkspaceId ?? undefined,
    }),
    [ws.isConnected, ws.sendTyping, ws.sendStopTyping, ws.markRead, ws.subscribeChannels, ws.subscribeAiConversations, ws.sendAiTyping, ws.sendAiStopTyping, currentWorkspaceId]
  );

  return (
    <ChatWebSocketContext.Provider value={value}>
      {children}
    </ChatWebSocketContext.Provider>
  );
}

export function useChatWebSocketContext() {
  const ctx = useContext(ChatWebSocketContext);
  if (!ctx) {
    throw new Error("useChatWebSocketContext must be used within ChatWebSocketProvider");
  }
  return ctx;
}
