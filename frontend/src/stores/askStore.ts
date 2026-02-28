import { create } from "zustand";

export interface AskToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "success" | "error";
}

interface AskState {
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: AskToolCall[];
  activeConversationId: string | null;

  appendText: (text: string) => void;
  addToolCall: (tc: Pick<AskToolCall, "id" | "name" | "input">) => void;
  setToolResult: (id: string, result: unknown, status: "success" | "error") => void;
  resetStreaming: () => void;
  setActiveConversation: (id: string | null) => void;
}

export const useAskStore = create<AskState>()((set) => ({
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  activeConversationId: null,

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
    }),

  setActiveConversation: (id) => set({ activeConversationId: id }),
}));
