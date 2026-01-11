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
} from "lucide-react";
import { OKRGoal, OKRGoalStatus, OKRGoalType } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<OKRGoalStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: "Draft", color: "text-slate-400", bgColor: "bg-slate-500" },
  active: { label: "Active", color: "text-blue-400", bgColor: "bg-blue-500" },
  on_track: { label: "On Track", color: "text-green-400", bgColor: "bg-green-500" },
  at_risk: { label: "At Risk", color: "text-amber-400", bgColor: "bg-amber-500" },
  behind: { label: "Behind", color: "text-red-400", bgColor: "bg-red-500" },
  achieved: { label: "Achieved", color: "text-green-400", bgColor: "bg-green-600" },
  cancelled: { label: "Cancelled", color: "text-slate-500", bgColor: "bg-slate-600" },
};

const TYPE_CONFIG: Record<OKRGoalType, { label: string; icon: React.ReactNode }> = {
  objective: { label: "Objective", icon: <Target className="h-4 w-4" /> },
  key_result: { label: "Key Result", icon: <TrendingUp className="h-4 w-4" /> },
  initiative: { label: "Initiative", icon: <ChevronRight className="h-4 w-4" /> },
};

interface GoalCardProps {
  goal: OKRGoal;
  onClick?: (goal: OKRGoal) => void;
  onDelete?: (goalId: string) => void;
  showKeyResults?: boolean;
  keyResults?: OKRGoal[];
  className?: string;
}

export function GoalCard({
  goal,
  onClick,
  onDelete,
  showKeyResults = false,
  keyResults = [],
  className,
}: GoalCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const statusConfig = STATUS_CONFIG[goal.status];
  const typeConfig = TYPE_CONFIG[goal.goal_type];

  const getTrendIcon = () => {
    if (goal.progress_percentage >= 70) return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (goal.progress_percentage <= 30) return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-slate-400" />;
  };

  return (
    <div
      className={cn(
        "group relative bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600/50 hover:bg-slate-800/70 transition-all cursor-pointer",
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
          <span className="text-xs font-mono text-slate-400">{goal.key}</span>
          <span className={cn("text-xs px-1.5 py-0.5 rounded", statusConfig.bgColor, "text-white")}>
            {statusConfig.label}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 rounded hover:bg-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-white mb-2 line-clamp-2">{goal.title}</h3>

      {/* Description */}
      {goal.description && (
        <p className="text-xs text-slate-400 mb-3 line-clamp-2">{goal.description}</p>
      )}

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-400">Progress</span>
          <div className="flex items-center gap-2">
            {getTrendIcon()}
            <span className="text-white font-medium">{goal.progress_percentage.toFixed(0)}%</span>
          </div>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
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
        <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
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
        <div className="border-t border-slate-700/50 pt-3 mt-3">
          <div className="text-xs text-slate-400 mb-2">Key Results ({keyResults.length})</div>
          <div className="space-y-1">
            {keyResults.slice(0, 3).map((kr) => (
              <div key={kr.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate flex-1">{kr.title}</span>
                <span className={cn("ml-2", STATUS_CONFIG[kr.status].color)}>
                  {kr.progress_percentage.toFixed(0)}%
                </span>
              </div>
            ))}
            {keyResults.length > 3 && (
              <div className="text-xs text-slate-500">+{keyResults.length - 3} more</div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
        <div className="flex items-center gap-2 text-xs text-slate-500">
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
          <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center">
            <User className="h-3 w-3 text-slate-300" />
          </div>
        )}
      </div>
    </div>
  );
}
