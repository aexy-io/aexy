"use client";

import React from "react";
import {
  ArrowRight,
  ArrowLeft,
  Link,
  Copy,
  Trash2,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { StoryDependency, TaskDependency, DependencyType, DependencyStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const DEPENDENCY_TYPE_CONFIG: Record<DependencyType, { label: string; icon: React.ReactNode; color: string }> = {
  blocks: { label: "Blocks", icon: <ArrowRight className="h-4 w-4" />, color: "text-red-600 dark:text-red-400" },
  is_blocked_by: { label: "Blocked by", icon: <ArrowLeft className="h-4 w-4" />, color: "text-amber-600 dark:text-amber-400" },
  relates_to: { label: "Relates to", icon: <Link className="h-4 w-4" />, color: "text-blue-600 dark:text-blue-400" },
  duplicates: { label: "Duplicates", icon: <Copy className="h-4 w-4" />, color: "text-purple-600 dark:text-purple-400" },
  is_child_of: { label: "Child of", icon: <ArrowLeft className="h-4 w-4" />, color: "text-muted-foreground" },
  is_parent_of: { label: "Parent of", icon: <ArrowRight className="h-4 w-4" />, color: "text-muted-foreground" },
};

interface DependencyListProps {
  dependencies: (StoryDependency | TaskDependency)[];
  entityType: "story" | "task";
  currentEntityId: string;
  onResolve?: (dependencyId: string) => void;
  onDelete?: (dependencyId: string) => void;
  onAdd?: () => void;
  onNavigate?: (entityId: string, entityType: "story" | "task") => void;
  readOnly?: boolean;
  className?: string;
}

export function DependencyList({
  dependencies,
  entityType,
  currentEntityId,
  onResolve,
  onDelete,
  onAdd,
  onNavigate,
  readOnly = false,
  className,
}: DependencyListProps) {
  const activeDeps = dependencies.filter((d) => d.status === "active");
  const resolvedDeps = dependencies.filter((d) => d.status === "resolved");

  const getLinkedEntityId = (dep: StoryDependency | TaskDependency): string => {
    if (entityType === "story") {
      const storyDep = dep as StoryDependency;
      return storyDep.dependent_story_id === currentEntityId
        ? storyDep.blocking_story_id
        : storyDep.dependent_story_id;
    } else {
      const taskDep = dep as TaskDependency;
      return taskDep.dependent_task_id === currentEntityId
        ? taskDep.blocking_task_id
        : taskDep.dependent_task_id;
    }
  };

  const getDirection = (dep: StoryDependency | TaskDependency): "outgoing" | "incoming" => {
    if (entityType === "story") {
      const storyDep = dep as StoryDependency;
      return storyDep.dependent_story_id === currentEntityId ? "outgoing" : "incoming";
    } else {
      const taskDep = dep as TaskDependency;
      return taskDep.dependent_task_id === currentEntityId ? "outgoing" : "incoming";
    }
  };

  const renderDependency = (dep: StoryDependency | TaskDependency, isResolved: boolean) => {
    const typeConfig = DEPENDENCY_TYPE_CONFIG[dep.dependency_type];
    const linkedId = getLinkedEntityId(dep);
    const direction = getDirection(dep);

    return (
      <div
        key={dep.id}
        className={cn(
          "group flex items-center justify-between p-3 rounded-lg transition-colors",
          isResolved ? "bg-muted/30" : "bg-muted/50 hover:bg-muted/70",
          isResolved && "opacity-60"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("flex items-center gap-1", typeConfig.color)}>
            {typeConfig.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">{typeConfig.label}</span>
              <button
                onClick={() => onNavigate?.(linkedId, entityType)}
                className="text-sm text-blue-400 hover:text-blue-300 font-mono"
              >
                {linkedId.slice(0, 8)}...
              </button>
            </div>
            {dep.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{dep.description}</p>
            )}
          </div>
        </div>

        {!readOnly && !isResolved && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onResolve && (
              <button
                onClick={() => onResolve(dep.id)}
                className="p-1.5 text-muted-foreground hover:text-green-400 hover:bg-accent/50 rounded transition-colors"
                title="Mark as resolved"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(dep.id)}
                className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-accent/50 rounded transition-colors"
                title="Delete dependency"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {isResolved && (
          <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
            Resolved
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Dependencies</h4>
        {!readOnly && onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Dependency
          </button>
        )}
      </div>

      {/* Active dependencies */}
      {activeDeps.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Active ({activeDeps.length})</span>
          <div className="space-y-1">
            {activeDeps.map((dep) => renderDependency(dep, false))}
          </div>
        </div>
      )}

      {/* Resolved dependencies */}
      {resolvedDeps.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Resolved ({resolvedDeps.length})</span>
          <div className="space-y-1">
            {resolvedDeps.map((dep) => renderDependency(dep, true))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {dependencies.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No dependencies defined.
        </p>
      )}
    </div>
  );
}
