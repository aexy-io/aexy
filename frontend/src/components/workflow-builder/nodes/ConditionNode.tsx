"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";

export const ConditionNode = memo(({ data, selected }: NodeProps) => {
  const conditions = (data.conditions as Array<{ field: string; operator: string; value: string }>) || [];

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[200px]
        bg-gradient-to-br from-amber-500/20 to-amber-600/10
        border-2 transition-all
        ${selected ? "border-amber-400 shadow-amber-500/20" : "border-amber-500/50"}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-400 !border-2 !border-amber-600"
      />

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-amber-500/30">
          <GitBranch className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-amber-400/70 font-medium">
            Condition
          </div>
          <div className="text-white font-medium text-sm">
            {data.label as string || "If/Else"}
          </div>
        </div>
      </div>

      {/* Show conditions preview */}
      {conditions.length > 0 && (
        <div className="mt-2 text-xs text-amber-300/70 bg-amber-900/30 rounded px-2 py-1">
          {conditions.length} condition{conditions.length > 1 ? "s" : ""}
        </div>
      )}

      {/* True output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600"
        style={{ left: "30%" }}
      />

      {/* False output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!w-3 !h-3 !bg-red-400 !border-2 !border-red-600"
        style={{ left: "70%" }}
      />

      {/* Handle labels */}
      <div className="flex justify-between mt-2 px-2 text-[10px]">
        <span className="text-green-400">True</span>
        <span className="text-red-400">False</span>
      </div>
    </div>
  );
});

ConditionNode.displayName = "ConditionNode";
