"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Merge } from "lucide-react";
import { useExecutionState, ExecutionStatus } from "./useExecutionState";

interface JoinNodeData {
  label: string;
  join_type?: "all" | "any" | "count";
  expected_count?: number;
  on_failure?: "fail" | "continue" | "skip";
  incoming_branches?: number;
  hasError?: boolean;
  errorMessage?: string;
  isHighlighted?: boolean;
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
  completedBranches?: number;
}

const joinTypeLabels: Record<string, string> = {
  all: "Wait for all",
  any: "Wait for any",
  count: "Wait for count",
};

export const JoinNode = memo(({ data, selected }: NodeProps<JoinNodeData>) => {
  const joinType = data.join_type || "all";
  const expectedCount = data.expected_count || 1;
  const incomingBranches = data.incoming_branches || 2;
  const isHighlighted = data.isHighlighted;
  const { isRunning, isSuccess, isFailed, isSkipped, StatusIndicator, DurationBadge } = useExecutionState(data);

  const getStyles = () => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return "border-teal-400 shadow-teal-500/30";
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-slate-500 shadow-slate-500/20 opacity-60";
    if (data.hasError) return "border-red-500 shadow-red-500/20";
    if (selected) return "border-teal-400 shadow-teal-500/20";
    return "border-teal-500/50";
  };

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[200px] relative
        bg-gradient-to-br from-teal-500/20 to-teal-600/10
        border-2 transition-all
        ${getStyles()}
        ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900" : ""}
      `}
    >
      {StatusIndicator}
      {DurationBadge}

      {/* Multiple input handles for branches */}
      {Array.from({ length: Math.max(incomingBranches, 2) }).map((_, i) => (
        <Handle
          key={`input-${i}`}
          type="target"
          position={Position.Top}
          id={`input-${i}`}
          className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-teal-400 !border-teal-600"}`}
          style={{ left: `${((i + 1) / (Math.max(incomingBranches, 2) + 1)) * 100}%` }}
        />
      ))}

      <div className="flex items-center gap-3 mb-1">
        <div className={`p-2 rounded-lg ${data.hasError ? "bg-red-500/30" : "bg-teal-500/30"}`}>
          <Merge className={`h-5 w-5 ${data.hasError ? "text-red-400" : "text-teal-400"}`} />
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider font-medium ${data.hasError ? "text-red-400/70" : "text-teal-400/70"}`}>
            Join
          </div>
          <div className="text-white font-medium text-sm">
            {data.label || "Merge Paths"}
          </div>
        </div>
      </div>

      {/* Join type indicator */}
      {!data.hasError && !isSuccess && (
        <div className="mt-2 text-xs text-teal-300 bg-teal-500/10 px-2 py-1 rounded flex items-center justify-between">
          <span>{joinTypeLabels[joinType] || "Wait for all"}</span>
          {joinType === "count" && (
            <span className="font-medium">({expectedCount})</span>
          )}
        </div>
      )}

      {/* Show completed branches when running */}
      {isRunning && data.completedBranches !== undefined && (
        <div className="mt-2 text-xs text-blue-300 bg-blue-500/10 px-2 py-1 rounded">
          {data.completedBranches}/{incomingBranches} branches complete
        </div>
      )}

      {/* Show success summary */}
      {isSuccess && (
        <div className="mt-2 text-xs text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded">
          All branches merged
        </div>
      )}

      {/* Error message tooltip */}
      {data.hasError && data.errorMessage && !isRunning && !isSuccess && !isFailed && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
          {data.errorMessage}
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-teal-400 !border-teal-600"}`}
      />
    </div>
  );
});

JoinNode.displayName = "JoinNode";
