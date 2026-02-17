"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallDisplayProps {
  toolName: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status?: "running" | "completed" | "error";
  defaultExpanded?: boolean;
}

export function ToolCallDisplay({
  toolName,
  input,
  output,
  status = "completed",
  defaultExpanded = false,
}: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const formatToolName = (name: string) => {
    return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatJson = (obj: unknown) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const truncateOutput = (text: string, maxLength = 500) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden my-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-accent/50 hover:bg-accent transition text-left"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-foreground">
            {formatToolName(toolName)}
          </span>
          {status === "completed" && (
            <CheckCircle className="h-3 w-3 text-green-400" />
          )}
          {status === "error" && (
            <XCircle className="h-3 w-3 text-red-400" />
          )}
          {status === "running" && (
            <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3 bg-muted/50">
          {input && Object.keys(input).length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Input
              </div>
              <pre className="text-xs text-foreground bg-background/50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {formatJson(input)}
              </pre>
            </div>
          )}

          {output !== undefined && (
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Output
              </div>
              <pre className="text-xs text-foreground bg-background/50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {truncateOutput(
                  typeof output === "string" ? output : formatJson(output)
                )}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
