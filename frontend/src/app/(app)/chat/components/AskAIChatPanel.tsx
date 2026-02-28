"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, User, Send, Loader2 } from "lucide-react";
import { useAskConversation, useStreamMessage } from "@/hooks/useAsk";
import { useAskStore } from "@/stores/askStore";
import { AskMessage } from "@/lib/api";
import { AskToolCall } from "./AskToolCall";
import { MessageFeedback } from "./MessageFeedback";
import { cn } from "@/lib/utils";

interface AskAIChatPanelProps {
  workspaceId: string;
  conversationId: string;
}

export function AskAIChatPanel({ workspaceId, conversationId }: AskAIChatPanelProps) {
  const { data: conversation, isLoading } = useAskConversation(workspaceId, conversationId);
  const { streamMessage, isStreaming } = useStreamMessage(workspaceId, conversationId);
  const { streamingText, streamingToolCalls } = useAskStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    if (!userScrolledRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages, streamingText, streamingToolCalls, scrollToBottom]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledRef.current = !atBottom;
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isStreaming) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await streamMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading conversation...
      </div>
    );
  }

  const messages = conversation?.messages || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Bot className="h-4 w-4 text-purple-400" />
        <h3 className="text-sm font-medium truncate">
          {conversation?.title || "AI Chat"}
        </h3>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
      >
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Bot className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Ask AI anything</p>
              <p className="text-xs text-muted-foreground mt-1">
                I can help with sprints, tasks, tickets, and more.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} workspaceId={workspaceId} />
        ))}

        {/* Streaming message */}
        {isStreaming && (
          <div className="flex gap-2">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-500/10 flex items-center justify-center mt-0.5">
              <Bot className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              {streamingToolCalls.map((tc) => (
                <AskToolCall
                  key={tc.id}
                  name={tc.name}
                  input={tc.input}
                  result={tc.result}
                  status={tc.status}
                />
              ))}
              {streamingText && (
                <div className="text-sm whitespace-pre-wrap">{streamingText}</div>
              )}
              {!streamingText && streamingToolCalls.length === 0 && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Ask anything..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className={cn(
              "flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
              input.trim() && !isStreaming
                ? "bg-purple-500 text-white hover:bg-purple-600"
                : "bg-muted text-muted-foreground"
            )}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, workspaceId }: { message: AskMessage; workspaceId: string }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-primary/10" : "bg-purple-500/10"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-purple-400" />
        )}
      </div>
      <div className={cn("flex-1 min-w-0", isUser && "text-right")}>
        {/* Tool calls */}
        {!isUser && message.tool_calls && message.tool_calls.length > 0 && (
          <div className={cn(isUser ? "ml-auto" : "")}>
            {message.tool_calls.map((tc) => (
              <AskToolCall
                key={tc.id}
                name={tc.tool_name}
                input={tc.tool_input}
                result={tc.tool_result}
                status={tc.status as "pending" | "success" | "error"}
              />
            ))}
          </div>
        )}
        {message.content && (
          <div
            className={cn(
              "inline-block rounded-lg px-3 py-2 text-sm whitespace-pre-wrap max-w-[85%]",
              isUser
                ? "bg-purple-500 text-white"
                : "bg-accent text-foreground"
            )}
          >
            {message.content}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        {/* Feedback buttons for assistant messages */}
        {!isUser && (
          <MessageFeedback
            workspaceId={workspaceId}
            entityType="ask_message"
            entityId={message.id}
          />
        )}
      </div>
    </div>
  );
}
