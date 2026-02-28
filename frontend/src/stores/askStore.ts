import { create } from "zustand";

export interface AskToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "success" | "error";
}

export interface AiTypingUser {
  developer_id: string;
  developer_name: string;
  conversation_id: string;
  timestamp: number;
}

interface AskState {
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: AskToolCall[];
  activeConversationId: string | null;

  // Collaboration state
  aiTypingUsers: AiTypingUser[];
  queueLength: number;
  queuePosition: number | null;
  isQueued: boolean;

  appendText: (text: string) => void;
  addToolCall: (tc: Pick<AskToolCall, "id" | "name" | "input">) => void;
  setToolResult: (id: string, result: unknown, status: "success" | "error") => void;
  resetStreaming: () => void;
  setActiveConversation: (id: string | null) => void;

  // Collaboration actions
  addAiTypingUser: (user: AiTypingUser) => void;
  removeAiTypingUser: (developerId: string, conversationId: string) => void;
  clearStaleAiTyping: () => void;
  setQueueState: (length: number, position: number | null) => void;
  setQueued: (queued: boolean, position?: number | null) => void;
}

const TYPING_TIMEOUT = 5000; // 5 seconds

export const useAskStore = create<AskState>()((set) => ({
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  activeConversationId: null,
  aiTypingUsers: [],
  queueLength: 0,
  queuePosition: null,
  isQueued: false,

  appendText: (text) =>
    set((state) => ({
      isStreaming: true,
      streamingText: state.streamingText + text,
    })),

  addToolCall: (tc) =>
    set((state) => ({
      streamingToolCalls: [
        ...state.streamingToolCalls,
        { ...tc, status: "pending" as const },
      ],
    })),

  setToolResult: (id, result, status) =>
    set((state) => ({
      streamingToolCalls: state.streamingToolCalls.map((tc) =>
        tc.id === id ? { ...tc, result, status } : tc
      ),
    })),

  resetStreaming: () =>
    set({
      isStreaming: false,
      streamingText: "",
      streamingToolCalls: [],
      isQueued: false,
      queuePosition: null,
    }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addAiTypingUser: (user) =>
    set((state) => ({
      aiTypingUsers: [
        ...state.aiTypingUsers.filter(
          (u) => !(u.developer_id === user.developer_id && u.conversation_id === user.conversation_id)
        ),
        user,
      ],
    })),

  removeAiTypingUser: (developerId, conversationId) =>
    set((state) => ({
      aiTypingUsers: state.aiTypingUsers.filter(
        (u) => !(u.developer_id === developerId && u.conversation_id === conversationId)
      ),
    })),

  clearStaleAiTyping: () =>
    set((state) => ({
      aiTypingUsers: state.aiTypingUsers.filter(
        (u) => Date.now() - u.timestamp < TYPING_TIMEOUT
      ),
    })),

  setQueueState: (length, position) =>
    set({ queueLength: length, queuePosition: position }),

  setQueued: (queued, position = null) =>
    set({ isQueued: queued, queuePosition: position }),
}));
