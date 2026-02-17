"use client";

import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentMessage } from "@/lib/api";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ThinkingIndicator } from "./ThinkingIndicator";

interface MessageBubbleProps {
  message: AgentMessage;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";
  const isThinking = message.id === "thinking-indicator";

  // Thinking indicator
  if (isThinking) {
    return (
      <div className="flex justify-start">
        <ThinkingIndicator />
      </div>
    );
  }

  // Tool message (displayed inline with assistant messages usually)
  if (isTool) {
    return (
      <div className="flex justify-start pl-11">
        <ToolCallDisplay
          toolName={message.tool_name || "tool"}
          input={message.tool_output?.input as Record<string, unknown>}
          output={message.tool_output?.output}
          status="completed"
        />
      </div>
    );
  }

  // User message
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex items-start gap-3 max-w-3xl">
          <div className="flex flex-col items-end">
            <div className="bg-purple-600 text-white rounded-2xl rounded-tr-md px-4 py-3">
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              {formatTime(message.created_at)}
            </span>
          </div>
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <User className="h-4 w-4 text-purple-400" />
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  if (isAssistant) {
    return (
      <div className="flex justify-start">
        <div className="flex items-start gap-3 max-w-3xl">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-purple-400" />
          </div>
          <div className="flex flex-col">
            <div className="bg-accent/50 rounded-2xl rounded-tl-md px-4 py-3">
              {message.content ? (
                <p className="text-foreground whitespace-pre-wrap">{message.content}</p>
              ) : (
                <p className="text-muted-foreground italic">Processing...</p>
              )}

              {/* Display tool calls if present */}
              {message.tool_calls && message.tool_calls.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.tool_calls.map((call, idx) => (
                    <ToolCallDisplay
                      key={call.id || idx}
                      toolName={call.name}
                      input={call.args}
                      status="completed"
                    />
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              {formatTime(message.created_at)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // System message
  return (
    <div className="flex justify-center">
      <div className="bg-accent/30 rounded-lg px-4 py-2 text-sm text-muted-foreground max-w-2xl text-center">
        {message.content}
      </div>
    </div>
  );
}
