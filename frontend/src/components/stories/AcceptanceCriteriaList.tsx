"use client";

import React from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { AcceptanceCriterion } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AcceptanceCriteriaListProps {
  criteria: AcceptanceCriterion[];
  onToggle?: (criterionId: string, completed: boolean) => void;
  onAdd?: (description: string) => void;
  onRemove?: (criterionId: string) => void;
  readOnly?: boolean;
  className?: string;
}

export function AcceptanceCriteriaList({
  criteria,
  onToggle,
  onAdd,
  onRemove,
  readOnly = false,
  className,
}: AcceptanceCriteriaListProps) {
  const [newCriterion, setNewCriterion] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);

  const completedCount = criteria.filter((c) => c.completed).length;
  const totalCount = criteria.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleAdd = () => {
    if (newCriterion.trim() && onAdd) {
      onAdd(newCriterion.trim());
      setNewCriterion("");
      setIsAdding(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Acceptance Criteria</h4>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{totalCount} completed
        </span>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 bg-accent rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300",
              progress === 100 ? "bg-green-500" : "bg-blue-500"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Criteria list */}
      <div className="space-y-2">
        {criteria.map((criterion) => (
          <div
            key={criterion.id}
            className={cn(
              "group flex items-start gap-3 p-2 rounded-lg transition-colors",
              !readOnly && "hover:bg-muted/50",
              criterion.completed && "opacity-70"
            )}
          >
            <button
              onClick={() => !readOnly && onToggle?.(criterion.id, !criterion.completed)}
              disabled={readOnly}
              className={cn(
                "mt-0.5 flex-shrink-0 transition-colors",
                readOnly ? "cursor-default" : "cursor-pointer",
                criterion.completed ? "text-green-500" : "text-muted-foreground hover:text-muted-foreground"
              )}
            >
              {criterion.completed ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>
            <span
              className={cn(
                "flex-1 text-sm",
                criterion.completed ? "text-muted-foreground line-through" : "text-foreground"
              )}
            >
              {criterion.description}
            </span>
            {!readOnly && onRemove && (
              <button
                onClick={() => onRemove(criterion.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 transition-all"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {criteria.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No acceptance criteria defined yet.
          </p>
        )}
      </div>

      {/* Add new criterion */}
      {!readOnly && onAdd && (
        <div className="pt-2">
          {isAdding ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") {
                    setIsAdding(false);
                    setNewCriterion("");
                  }
                }}
                placeholder="Enter acceptance criterion..."
                className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                autoFocus
              />
              <button
                onClick={handleAdd}
                disabled={!newCriterion.trim()}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewCriterion("");
                }}
                className="px-3 py-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add acceptance criterion
            </button>
          )}
        </div>
      )}
    </div>
  );
}
