"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { useExecutionState, ExecutionStatus } from "./useExecutionState";

interface ConditionNodeData {
  label: string;
  conditions?: Array<{ field: string; operator: string; value: string }>;
  hasError?: boolean;
  errorMessage?: string;
  isHighlighted?: boolean;
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
  conditionResult?: boolean;
}

export const ConditionNode = memo(({ data, selected }: NodeProps<ConditionNodeData>) => {
  const conditions = (data.conditions as Array<{ field: string; operator: string; value: string }>) || [];
  const isHighlighted = data.isHighlighted;
  const { isRunning, isSuccess, isFailed, isSkipped, StatusIndicator, DurationBadge } = useExecutionState(data);

  const getStyles = () => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return "border-amber-400 shadow-amber-500/30";
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-slate-500 shadow-slate-500/20 opacity-60";
    if (data.hasError) return "border-red-500 shadow-red-500/20";
    if (selected) return "border-amber-400 shadow-amber-500/20";
    return "border-amber-500/50";
  };

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[200px] relative
        bg-gradient-to-br from-amber-500/20 to-amber-600/10
        border-2 transition-all
        ${getStyles()}
        ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900" : ""}
      `}
    >
      {StatusIndicator}
      {DurationBadge}

      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-amber-400 !border-amber-600"}`}
      />

      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${data.hasError ? "bg-red-500/30" : "bg-amber-500/30"}`}>
          <GitBranch className={`h-5 w-5 ${data.hasError ? "text-red-400" : "text-amber-400"}`} />
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider font-medium ${data.hasError ? "text-red-400/70" : "text-amber-400/70"}`}>
            Condition
          </div>
          <div className="text-white font-medium text-sm">
            {data.label as string || "If/Else"}
          </div>
        </div>
      </div>

      {data.hasError && data.errorMessage && !isRunning && !isSuccess && !isFailed && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
          {data.errorMessage}
        </div>
      )}

      {/* Show condition result when executed */}
      {isSuccess && data.conditionResult !== undefined && (
        <div className={`mt-2 text-xs px-2 py-1 rounded ${
          data.conditionResult
            ? "text-green-400 bg-green-500/10"
            : "text-red-400 bg-red-500/10"
        }`}>
          Result: {data.conditionResult ? "True" : "False"}
        </div>
      )}

      {!data.hasError && !isSuccess && conditions.length > 0 && (
        <div className="mt-2 text-xs text-amber-300/70 bg-amber-900/30 rounded px-2 py-1">
          {conditions.length} condition{conditions.length > 1 ? "s" : ""}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600"
        style={{ left: "30%" }}
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!w-3 !h-3 !bg-red-400 !border-2 !border-red-600"
        style={{ left: "70%" }}
      />

      <div className="flex justify-between mt-2 px-2 text-[10px]">
        <span className="text-green-400">True</span>
        <span className="text-red-400">False</span>
      </div>
    </div>
  );
});

ConditionNode.displayName = "ConditionNode";
