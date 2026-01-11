"use client";

import React from "react";
import { TrendingUp, TrendingDown, Minus, Edit2 } from "lucide-react";
import { OKRGoal, OKRGoalStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<OKRGoalStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-slate-400" },
  active: { label: "Active", color: "text-blue-400" },
  on_track: { label: "On Track", color: "text-green-400" },
  at_risk: { label: "At Risk", color: "text-amber-400" },
  behind: { label: "Behind", color: "text-red-400" },
  achieved: { label: "Achieved", color: "text-green-400" },
  cancelled: { label: "Cancelled", color: "text-slate-500" },
};

interface KeyResultProgressProps {
  keyResult: OKRGoal;
  onUpdateProgress?: (currentValue: number) => void;
  editable?: boolean;
  className?: string;
}

export function KeyResultProgress({
  keyResult,
  onUpdateProgress,
  editable = false,
  className,
}: KeyResultProgressProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(keyResult.current_value.toString());

  const statusConfig = STATUS_CONFIG[keyResult.status];

  const getTrendIcon = () => {
    if (keyResult.progress_percentage >= 70) return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (keyResult.progress_percentage <= 30) return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-slate-400" />;
  };

  const handleSave = () => {
    const value = parseFloat(inputValue);
    if (!isNaN(value) && onUpdateProgress) {
      onUpdateProgress(value);
    }
    setIsEditing(false);
  };

  const getProgressColor = () => {
    if (keyResult.progress_percentage >= 100) return "bg-green-500";
    if (keyResult.progress_percentage >= 70) return "bg-blue-500";
    if (keyResult.progress_percentage >= 30) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className={cn("bg-slate-800/30 rounded-lg p-3", className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm text-white font-medium flex-1">{keyResult.title}</h4>
        <span className={cn("text-xs", statusConfig.color)}>{statusConfig.label}</span>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300", getProgressColor())}
            style={{ width: `${Math.min(keyResult.progress_percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Values */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setIsEditing(false);
                }}
                className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                autoFocus
              />
              <span className="text-xs text-slate-400">
                / {keyResult.target_value} {keyResult.unit || ""}
              </span>
              <button
                onClick={handleSave}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-500"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-2 py-1 text-slate-400 text-xs hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <span className="text-sm text-white font-medium">
                {keyResult.current_value} / {keyResult.target_value} {keyResult.unit || ""}
              </span>
              {editable && onUpdateProgress && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-slate-500 hover:text-white transition-colors"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {getTrendIcon()}
          <span className="text-sm font-medium text-white">
            {keyResult.progress_percentage.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}
