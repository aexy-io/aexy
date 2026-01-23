"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { FileText } from "lucide-react";

interface DocumentNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  metadata: {
    icon?: string;
    space_id?: string;
    created_at?: string;
    updated_at?: string;
    activity_score?: number;
  };
  color: string;
  isSelected: boolean;
  activityScore: number;
}

type DocumentNodeType = Node<DocumentNodeData>;

export const DocumentNode = memo(({ data, selected }: NodeProps<DocumentNodeType>) => {
  const isSelected = data.isSelected || selected;
  const activityScore = data.activityScore || 0;

  // Calculate opacity/intensity based on activity score
  const activityOpacity = 0.3 + activityScore * 0.7;

  return (
    <div
      className={`
        relative px-4 py-3 rounded-lg border-2 min-w-[120px] max-w-[200px]
        transition-all duration-200 cursor-pointer
        ${isSelected
          ? "border-blue-400 bg-blue-500/20 shadow-lg shadow-blue-500/20 scale-110"
          : "border-blue-500/50 bg-slate-800 hover:border-blue-400 hover:bg-slate-750"
        }
      `}
      style={{
        opacity: isSelected ? 1 : activityOpacity,
      }}
    >
      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-slate-800"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-slate-800"
      />

      {/* Node content */}
      <div className="flex items-center gap-2">
        <div
          className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
          style={{ backgroundColor: `${data.color}20` }}
        >
          {data.metadata.icon ? (
            <span className="text-lg">{data.metadata.icon}</span>
          ) : (
            <FileText className="h-4 w-4" style={{ color: data.color }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate" title={data.label}>
            {data.label}
          </p>
          <p className="text-xs text-slate-400">Document</p>
        </div>
      </div>

      {/* Activity indicator */}
      {activityScore > 0.5 && (
        <div
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 animate-pulse"
          title={`High activity (${Math.round(activityScore * 100)}%)`}
        />
      )}
    </div>
  );
});

DocumentNode.displayName = "DocumentNode";
