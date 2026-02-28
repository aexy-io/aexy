"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AskToolCallProps {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "success" | "error";
}

export function AskToolCall({ name, input, result, status }: AskToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatName = (n: string) =>
    n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const formatJson = (obj: unknown) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const truncate = (text: string, max = 500) =>
    text.length <= max ? text : text.slice(0, max) + "...";

  return (
    <div className="border border-border rounded-lg overflow-hidden my-1.5">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-accent/30 hover:bg-accent/50 transition text-left"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium">{formatName(name)}</span>
          {status === "success" && <CheckCircle className="h-3 w-3 text-green-400" />}
          {status === "error" && <XCircle className="h-3 w-3 text-red-400" />}
          {status === "pending" && <Loader2 className="h-3 w-3 text-purple-400 animate-spin" />}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 py-2 space-y-2 bg-muted/30">
          {Object.keys(input).length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Input
              </div>
              <pre className="text-[11px] text-foreground bg-background/50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap">
                {formatJson(input)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Result
              </div>
              <pre className="text-[11px] text-foreground bg-background/50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap">
                {truncate(typeof result === "string" ? result : formatJson(result))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
