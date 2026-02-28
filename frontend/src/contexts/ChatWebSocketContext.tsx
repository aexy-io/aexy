"use client";

import { createContext, useContext, ReactNode } from "react";
import { useChatWebSocket } from "@/hooks/useChat";
import { useWorkspace } from "@/hooks/useWorkspace";

interface ChatWebSocketContextValue {
  isConnected: boolean;
  sendTyping: (topicId: string, channelId: string) => void;
  sendStopTyping: (topicId: string, channelId: string) => void;
  markRead: (topicId: string, messageId: string) => void;
  subscribeChannels: (channelIds: string[]) => void;
  workspaceId: string | undefined;
}

const ChatWebSocketContext = createContext<ChatWebSocketContextValue | null>(null);

export function ChatWebSocketProvider({ children }: { children: ReactNode }) {
  const { currentWorkspaceId } = useWorkspace();
  const ws = useChatWebSocket(currentWorkspaceId ?? undefined);

  return (
    <ChatWebSocketContext.Provider
      value={{
        ...ws,
        workspaceId: currentWorkspaceId ?? undefined,
      }}
    >
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
