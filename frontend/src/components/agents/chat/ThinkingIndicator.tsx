"use client";

import { Bot } from "lucide-react";

export function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3 max-w-3xl">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
        <Bot className="h-4 w-4 text-purple-400" />
      </div>
      <div className="flex-1 bg-accent/50 rounded-2xl rounded-tl-md px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
