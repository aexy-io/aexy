"use client";

import React from "react";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { ReadinessChecklistItem } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ReadinessChecklistProps {
  items: ReadinessChecklistItem[];
  onToggle?: (itemId: string, completed: boolean) => void;
  readOnly?: boolean;
  className?: string;
}

export function ReadinessChecklist({
  items,
  onToggle,
  readOnly = false,
  className,
}: ReadinessChecklistProps) {
  const completedCount = items.filter((item) => item.completed).length;
  const requiredItems = items.filter((item) => item.required);
  const requiredCompleted = requiredItems.filter((item) => item.completed).length;
  const allRequiredComplete = requiredCompleted === requiredItems.length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with summary */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">Readiness Checklist</h4>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {completedCount}/{items.length} completed
          </span>
          {!allRequiredComplete && requiredItems.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertCircle className="h-3 w-3" />
              {requiredItems.length - requiredCompleted} required remaining
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-300",
            progress === 100 ? "bg-green-500" : allRequiredComplete ? "bg-blue-500" : "bg-amber-500"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Checklist items */}
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "group flex items-start gap-3 p-3 rounded-lg transition-colors",
              !readOnly && "hover:bg-slate-800/50 cursor-pointer",
              item.completed && "opacity-70"
            )}
            onClick={() => !readOnly && onToggle?.(item.id, !item.completed)}
          >
            <div className="mt-0.5 flex-shrink-0">
              {item.completed ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Circle
                  className={cn(
                    "h-5 w-5",
                    item.required ? "text-amber-500" : "text-slate-500"
                  )}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm",
                    item.completed ? "text-slate-500 line-through" : "text-slate-300"
                  )}
                >
                  {item.item}
                </span>
                {item.required && !item.completed && (
                  <span className="text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    Required
                  </span>
                )}
              </div>
              {item.completed && item.completed_at && (
                <span className="text-xs text-slate-500">
                  Completed {new Date(item.completed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">
            No checklist items defined.
          </p>
        )}
      </div>

      {/* Status summary */}
      {items.length > 0 && (
        <div
          className={cn(
            "p-3 rounded-lg text-sm",
            allRequiredComplete && progress === 100
              ? "bg-green-500/10 text-green-400"
              : allRequiredComplete
              ? "bg-blue-500/10 text-blue-400"
              : "bg-amber-500/10 text-amber-400"
          )}
        >
          {allRequiredComplete && progress === 100 ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              All items completed - Ready for release!
            </span>
          ) : allRequiredComplete ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              All required items completed
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Complete required items before release
            </span>
          )}
        </div>
      )}
    </div>
  );
}
