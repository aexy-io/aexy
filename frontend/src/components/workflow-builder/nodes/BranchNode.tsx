"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { GitMerge } from "lucide-react";
import { useExecutionState, ExecutionStatus } from "./useExecutionState";

interface BranchNodeData extends Record<string, unknown> {
  label: string;
  branches?: Array<{ id: string; label: string }>;
  hasError?: boolean;
  errorMessage?: string;
  isHighlighted?: boolean;
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
  selectedBranch?: string;
}

type BranchNodeType = Node<BranchNodeData>;

export const BranchNode = memo(({ data, selected }: NodeProps<BranchNodeType>) => {
  const branches = (data.branches as Array<{ id: string; label: string }>) || [];
  const isHighlighted = data.isHighlighted;
  const { isRunning, isSuccess, isFailed, isSkipped, StatusIndicator, DurationBadge } = useExecutionState(data);

  const getStyles = () => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return "border-indigo-400 shadow-indigo-500/30";
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-muted-foreground shadow-muted-foreground/20 opacity-60";
    if (data.hasError) return "border-red-500 shadow-red-500/20";
    if (selected) return "border-indigo-400 shadow-indigo-500/20";
    return "border-indigo-500/50";
  };

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[220px] relative
        bg-gradient-to-br from-indigo-500/20 to-indigo-600/10
        border-2 transition-all
        ${getStyles()}
        ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background" : ""}
      `}
    >
      {StatusIndicator}
      {DurationBadge}

      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-indigo-400 !border-indigo-600"}`}
      />

      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${data.hasError ? "bg-red-500/30" : "bg-indigo-500/30"}`}>
          <GitMerge className={`h-5 w-5 ${data.hasError ? "text-red-400" : "text-indigo-400"}`} />
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider font-medium ${data.hasError ? "text-red-400/70" : "text-indigo-400/70"}`}>
            Branch
          </div>
          <div className="text-foreground font-medium text-sm">
            {data.label as string || "Split Path"}
          </div>
        </div>
      </div>

      {data.hasError && data.errorMessage && !isRunning && !isSuccess && !isFailed && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
          {data.errorMessage}
        </div>
      )}

      {!data.hasError && (
        <div className="flex justify-around mt-2 text-[10px] text-indigo-300">
          {branches.length > 0 ? (
            branches.map((branch, i) => (
              <span
                key={branch.id || i}
                className={data.selectedBranch === branch.id ? "text-emerald-400 font-medium" : ""}
              >
                {branch.label || `Path ${i + 1}`}
              </span>
            ))
          ) : (
            <>
              <span className={data.selectedBranch === "branch-a" ? "text-emerald-400 font-medium" : ""}>Path A</span>
              <span className={data.selectedBranch === "branch-b" ? "text-emerald-400 font-medium" : ""}>Path B</span>
            </>
          )}
        </div>
      )}

      {branches.length > 0 ? (
        branches.map((branch, i) => (
          <Handle
            key={branch.id || i}
            type="source"
            position={Position.Bottom}
            id={branch.id || `branch-${i}`}
            className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-indigo-400 !border-indigo-600"}`}
            style={{ left: `${((i + 1) / (branches.length + 1)) * 100}%` }}
          />
        ))
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="branch-a"
            className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-indigo-400 !border-indigo-600"}`}
            style={{ left: "33%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="branch-b"
            className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-indigo-400 !border-indigo-600"}`}
            style={{ left: "67%" }}
          />
        </>
      )}
    </div>
  );
});

BranchNode.displayName = "BranchNode";
