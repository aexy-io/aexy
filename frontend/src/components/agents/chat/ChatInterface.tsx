"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentMessage, CRMAgent } from "@/lib/api";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ThinkingIndicator } from "./ThinkingIndicator";

interface ChatInterfaceProps {
  agent: CRMAgent;
  messages: AgentMessage[];
  onSend: (message: string) => Promise<void>;
  isSending: boolean;
  isLoading?: boolean;
}

export function ChatInterface({
  agent,
  messages,
  onSend,
  isSending,
  isLoading = false,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, shouldAutoScroll]);

  // Detect if user scrolled up
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldAutoScroll(isAtBottom);
    }
  };

  const handleSend = async (message: string) => {
    setShouldAutoScroll(true);
    await onSend(message);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col bg-background animate-pulse">
        <div className="flex-1 p-6 space-y-4">
          <div className="flex gap-3">
            <div className="h-8 w-8 bg-accent rounded-full" />
            <div className="h-16 w-2/3 bg-accent rounded-xl" />
          </div>
          <div className="flex gap-3 justify-end">
            <div className="h-12 w-1/2 bg-accent rounded-xl" />
            <div className="h-8 w-8 bg-accent rounded-full" />
          </div>
          <div className="flex gap-3">
            <div className="h-8 w-8 bg-accent rounded-full" />
            <div className="h-20 w-3/4 bg-accent rounded-xl" />
          </div>
        </div>
        <div className="border-t border-border p-4">
          <div className="h-10 w-full bg-accent rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Welcome message if no messages */}
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                <Bot className="h-8 w-8 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Chat with {agent.name}
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                {agent.description || "Start a conversation with this agent."}
              </p>
              {agent.tools.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {agent.tools.slice(0, 6).map((tool) => (
                    <span
                      key={tool}
                      className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs"
                    >
                      {tool.replace(/_/g, " ")}
                    </span>
                  ))}
                  {agent.tools.length > 6 && (
                    <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">
                      +{agent.tools.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Thinking indicator when sending */}
          {isSending && (
            <div className="flex justify-start">
              <ThinkingIndicator />
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <ChatInput
        onSend={handleSend}
        isSending={isSending}
        disabled={!agent.is_active}
        placeholder={
          agent.is_active
            ? `Message ${agent.name}...`
            : "Agent is inactive"
        }
      />
    </div>
  );
}
