"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, User, Send, Loader2, Plus } from "lucide-react";
import { useChatWebSocketContext } from "@/contexts/ChatWebSocketContext";
import { useAskConversations, useCreateAskConversation, useAskConversation, useStreamMessage } from "@/hooks/useAsk";
import { useAskStore } from "@/stores/askStore";
import { AskMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

function WidgetToolCall({ name, status }: { name: string; status: string }) {
  const formatName = (n: string) =>
    n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-accent/30 rounded text-[11px] my-1">
      <span className="text-purple-400 font-medium">{formatName(name)}</span>
      {status === "success" && <span className="text-green-400">done</span>}
      {status === "error" && <span className="text-red-400">failed</span>}
      {status === "pending" && <Loader2 className="h-2.5 w-2.5 text-purple-400 animate-spin" />}
    </div>
  );
}

function CompactMessage({ message }: { message: AskMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-1.5 mb-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-primary/10" : "bg-purple-500/10"
        )}
      >
        {isUser ? (
          <User className="h-3 w-3 text-primary" />
        ) : (
          <Bot className="h-3 w-3 text-purple-400" />
        )}
      </div>
      <div className={cn("flex-1 min-w-0", isUser && "text-right")}>
        {!isUser && message.tool_calls?.map((tc) => (
          <WidgetToolCall key={tc.id} name={tc.tool_name} status={tc.status} />
        ))}
        {message.content && (
          <div
            className={cn(
              "inline-block rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap max-w-[90%]",
              isUser ? "bg-purple-500 text-white" : "bg-accent text-foreground"
            )}
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}

export function WidgetAskAIView() {
  const { workspaceId } = useChatWebSocketContext();
  const { data: conversations } = useAskConversations(workspaceId);
  const createConversation = useCreateAskConversation(workspaceId);
  const { activeConversationId, setActiveConversation } = useAskStore();

  // Auto-select or create conversation
  useEffect(() => {
    if (!activeConversationId && conversations && conversations.length > 0) {
      setActiveConversation(conversations[0].id);
    }
  }, [conversations, activeConversationId, setActiveConversation]);

  const { data: conversation } = useAskConversation(workspaceId, activeConversationId);
  const { streamMessage, isStreaming } = useStreamMessage(workspaceId, activeConversationId);
  const { streamingText, streamingToolCalls } = useAskStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages, streamingText, scrollToBottom]);

  const handleNewChat = async () => {
    const conv = await createConversation.mutateAsync(undefined);
    setActiveConversation(conv.id);
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isStreaming) return;

    // Create conversation on first message if none exists
    if (!activeConversationId) {
      const conv = await createConversation.mutateAsync(undefined);
      setActiveConversation(conv.id);
      setInput("");
      // Need to wait for state update — stream after conversation is ready
      setTimeout(async () => {
        await streamMessage(content);
      }, 100);
      return;
    }

    setInput("");
    await streamMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messages = conversation?.messages || [];

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium truncate max-w-[200px]">
            {conversation?.title || "AI Chat"}
          </span>
        </div>
        <button
          onClick={handleNewChat}
          disabled={createConversation.isPending}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
          title="New chat"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <Bot className="h-8 w-8 text-purple-400/30" />
            <p className="text-xs text-muted-foreground">
              Ask me about your sprints, tasks, or tickets
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <CompactMessage key={msg.id} message={msg} />
        ))}

        {isStreaming && (
          <div className="flex gap-1.5 mb-2">
            <div className="flex-shrink-0 h-5 w-5 rounded-full bg-purple-500/10 flex items-center justify-center mt-0.5">
              <Bot className="h-3 w-3 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              {streamingToolCalls.map((tc) => (
                <WidgetToolCall key={tc.id} name={tc.name} status={tc.status} />
              ))}
              {streamingText ? (
                <div className="inline-block rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap bg-accent text-foreground">
                  {streamingText}
                </div>
              ) : streamingToolCalls.length === 0 ? (
                <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Thinking...
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            disabled={isStreaming}
            className="flex-1 text-xs rounded-md border border-border bg-background px-2.5 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className={cn(
              "flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center transition-colors",
              input.trim() && !isStreaming
                ? "bg-purple-500 text-white hover:bg-purple-600"
                : "bg-muted text-muted-foreground"
            )}
          >
            {isStreaming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
