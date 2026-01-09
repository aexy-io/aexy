"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitMerge } from "lucide-react";

export const BranchNode = memo(({ data, selected }: NodeProps) => {
  const branches = (data.branches as Array<{ id: string; label: string }>) || [];
  const branchCount = Math.max(branches.length, 2);

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[220px]
        bg-gradient-to-br from-indigo-500/20 to-indigo-600/10
        border-2 transition-all
        ${selected ? "border-indigo-400 shadow-indigo-500/20" : "border-indigo-500/50"}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-indigo-600"
      />

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-indigo-500/30">
          <GitMerge className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-indigo-400/70 font-medium">
            Branch
          </div>
          <div className="text-white font-medium text-sm">
            {data.label as string || "Split Path"}
          </div>
        </div>
      </div>

      {/* Branch labels */}
      <div className="flex justify-around mt-2 text-[10px] text-indigo-300">
        {branches.length > 0 ? (
          branches.map((branch, i) => (
            <span key={branch.id || i}>{branch.label || `Path ${i + 1}`}</span>
          ))
        ) : (
          <>
            <span>Path A</span>
            <span>Path B</span>
          </>
        )}
      </div>

      {/* Output handles for each branch */}
      {branches.length > 0 ? (
        branches.map((branch, i) => (
          <Handle
            key={branch.id || i}
            type="source"
            position={Position.Bottom}
            id={branch.id || `branch-${i}`}
            className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-indigo-600"
            style={{ left: `${((i + 1) / (branches.length + 1)) * 100}%` }}
          />
        ))
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="branch-a"
            className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-indigo-600"
            style={{ left: "33%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="branch-b"
            className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-indigo-600"
            style={{ left: "67%" }}
          />
        </>
      )}
    </div>
  );
});

BranchNode.displayName = "BranchNode";
