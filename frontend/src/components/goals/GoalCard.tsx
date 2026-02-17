"use client";

import React from "react";
import {
  MoreVertical,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Calendar,
  ChevronRight,
  Edit,
  Trash2,
} from "lucide-react";
import { OKRGoal, OKRGoalStatus, OKRGoalType } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<OKRGoalStatus, { label: string; color: string; bgColor: string }> = {
  not_started: { label: "Not Started", color: "text-muted-foreground", bgColor: "bg-muted-foreground" },
  draft: { label: "Draft", color: "text-muted-foreground", bgColor: "bg-muted-foreground" },
  active: { label: "Active", color: "text-blue-400", bgColor: "bg-blue-500" },
  on_track: { label: "On Track", color: "text-green-400", bgColor: "bg-green-500" },
  at_risk: { label: "At Risk", color: "text-amber-400", bgColor: "bg-amber-500" },
  behind: { label: "Behind", color: "text-red-400", bgColor: "bg-red-500" },
  achieved: { label: "Achieved", color: "text-green-400", bgColor: "bg-green-600" },
  missed: { label: "Missed", color: "text-red-400", bgColor: "bg-red-600" },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", bgColor: "bg-muted" },
};

const TYPE_CONFIG: Record<OKRGoalType, { label: string; icon: React.ReactNode }> = {
  objective: { label: "Objective", icon: <Target className="h-4 w-4" /> },
  key_result: { label: "Key Result", icon: <TrendingUp className="h-4 w-4" /> },
  initiative: { label: "Initiative", icon: <ChevronRight className="h-4 w-4" /> },
};

interface GoalCardProps {
  goal: OKRGoal;
  onClick?: (goal: OKRGoal) => void;
  onEdit?: (goal: OKRGoal) => void;
  onDelete?: (goalId: string) => void;
  showKeyResults?: boolean;
  keyResults?: OKRGoal[];
  className?: string;
}

export function GoalCard({
  goal,
  onClick,
  onEdit,
  onDelete,
  showKeyResults = false,
  keyResults = [],
  className,
}: GoalCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const statusConfig = STATUS_CONFIG[goal.status] || STATUS_CONFIG.not_started;
  const typeConfig = TYPE_CONFIG[goal.goal_type] || TYPE_CONFIG.objective;

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  const getTrendIcon = () => {
    if (goal.progress_percentage >= 70) return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (goal.progress_percentage <= 30) return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div
      className={cn(
        "group relative bg-muted/50 border border-border/50 rounded-lg p-4 hover:border-border/50 hover:bg-muted/70 transition-all cursor-pointer",
        className
      )}
      onClick={() => onClick?.(goal)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("p-1 rounded", statusConfig.bgColor + "/20")}>
            {typeConfig.icon}
          </span>
          <span className="text-xs font-mono text-muted-foreground">{goal.key}</span>
          <span className={cn("text-xs px-1.5 py-0.5 rounded", statusConfig.bgColor, "text-foreground")}>
            {statusConfig.label}
          </span>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-accent/50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-muted border border-border rounded-lg shadow-lg py-1 z-10">
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit(goal);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent/50 transition-colors"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete(goal.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-accent/50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-2 line-clamp-2">{goal.title}</h3>

      {/* Description */}
      {goal.description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{goal.description}</p>
      )}

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Progress</span>
          <div className="flex items-center gap-2">
            {getTrendIcon()}
            <span className="text-foreground font-medium">{goal.progress_percentage.toFixed(0)}%</span>
          </div>
        </div>
        <div className="h-2 bg-accent rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300",
              goal.progress_percentage >= 100
                ? "bg-green-500"
                : goal.progress_percentage >= 70
                ? "bg-blue-500"
                : goal.progress_percentage >= 30
                ? "bg-amber-500"
                : "bg-red-500"
            )}
            style={{ width: `${Math.min(goal.progress_percentage, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>
            {goal.current_value} / {goal.target_value} {goal.unit || ""}
          </span>
          {goal.confidence_level > 0 && (
            <span>Confidence: {goal.confidence_level}/10</span>
          )}
        </div>
      </div>

      {/* Key Results Preview */}
      {showKeyResults && keyResults.length > 0 && (
        <div className="border-t border-border/50 pt-3 mt-3">
          <div className="text-xs text-muted-foreground mb-2">Key Results ({keyResults.length})</div>
          <div className="space-y-1">
            {keyResults.slice(0, 3).map((kr) => (
              <div key={kr.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate flex-1">{kr.title}</span>
                <span className={cn("ml-2", (STATUS_CONFIG[kr.status] || STATUS_CONFIG.not_started).color)}>
                  {kr.progress_percentage.toFixed(0)}%
                </span>
              </div>
            ))}
            {keyResults.length > 3 && (
              <div className="text-xs text-muted-foreground">+{keyResults.length - 3} more</div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {goal.period_type && (
            <span className="capitalize">{goal.period_type}</span>
          )}
          {goal.period_end && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(goal.period_end).toLocaleDateString()}
            </span>
          )}
        </div>
        {goal.owner_id && (
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <User className="h-3 w-3 text-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
