"use client";

import { ArrowRight } from "lucide-react";

interface HandoffBlockProps {
  handoffData: Record<string, unknown> | null;
}

export function HandoffBlock({ handoffData }: HandoffBlockProps) {
  if (!handoffData) {
    return <div className="py-2 text-xs text-muted-foreground italic">No handoff data</div>;
  }

  return (
    <div className="py-2 px-3 bg-muted/30 border rounded-md">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <ArrowRight className="w-3 h-3" />
        Handoff Summary
      </div>
      {handoffData.what_was_done && (
        <div className="text-xs mb-1">
          <span className="font-medium">Done:</span>{" "}
          {String(handoffData.what_was_done)}
        </div>
      )}
      {handoffData.findings && (
        <div className="text-xs mb-1">
          <span className="font-medium">Findings:</span>{" "}
          {String(handoffData.findings)}
        </div>
      )}
      {handoffData.remaining_work && (
        <div className="text-xs mb-1">
          <span className="font-medium">Remaining:</span>{" "}
          {String(handoffData.remaining_work)}
        </div>
      )}
      {handoffData.confidence && (
        <div className="text-xs">
          <span className="font-medium">Confidence:</span>{" "}
          <span
            className={
              handoffData.confidence === "high"
                ? "text-green-600"
                : handoffData.confidence === "low"
                ? "text-red-500"
                : "text-yellow-600"
            }
          >
            {String(handoffData.confidence)}
          </span>
        </div>
      )}
    </div>
  );
}
