"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import {
  User,
  Lightbulb,
  Cpu,
  FolderKanban,
  Building2,
  Code2,
  ExternalLink,
} from "lucide-react";

interface EntityNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  metadata: {
    description?: string;
    confidence_score?: number;
    occurrence_count?: number;
    aliases?: string[];
    first_seen_at?: string;
    last_seen_at?: string;
  };
  color: string;
  isSelected: boolean;
  activityScore: number;
}

type EntityNodeType = Node<EntityNodeData>;

// Icon mapping for entity types
const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  person: User,
  concept: Lightbulb,
  technology: Cpu,
  project: FolderKanban,
  organization: Building2,
  code: Code2,
  external: ExternalLink,
};

export const EntityNode = memo(({ data, selected }: NodeProps<EntityNodeType>) => {
  const isSelected = data.isSelected || selected;
  const activityScore = data.activityScore || 0;
  const occurrenceCount = data.metadata.occurrence_count || 1;

  // Get icon for entity type
  const Icon = ENTITY_ICONS[data.nodeType] || Lightbulb;

  // Calculate size based on occurrence count
  const baseSize = 48;
  const maxSize = 80;
  const sizeFactor = Math.min(1 + Math.log10(occurrenceCount) * 0.3, 2);
  const size = Math.min(baseSize * sizeFactor, maxSize);

  // Calculate opacity based on activity
  const activityOpacity = 0.4 + activityScore * 0.6;

  return (
    <div
      className={`
        relative flex flex-col items-center
        transition-all duration-200 cursor-pointer
        ${isSelected ? "scale-125" : "hover:scale-110"}
      `}
      style={{ opacity: isSelected ? 1 : activityOpacity }}
    >
      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !border-none !opacity-0"
        style={{ background: data.color }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border-none !opacity-0"
        style={{ background: data.color }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border-none !opacity-0"
        style={{ background: data.color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border-none !opacity-0"
        style={{ background: data.color }}
      />

      {/* Entity circle */}
      <div
        className={`
          flex items-center justify-center rounded-full
          transition-all duration-200
          ${isSelected
            ? "ring-4 ring-white/30 shadow-lg"
            : "hover:ring-2 hover:ring-white/20"
          }
        `}
        style={{
          width: size,
          height: size,
          backgroundColor: `${data.color}30`,
          borderWidth: 2,
          borderColor: data.color,
          boxShadow: isSelected ? `0 0 20px ${data.color}50` : undefined,
        }}
      >
        <Icon
          className="transition-transform"
          style={{
            width: size * 0.4,
            height: size * 0.4,
            color: data.color,
          }}
        />
      </div>

      {/* Label */}
      <div
        className={`
          mt-2 px-2 py-1 rounded-md text-center max-w-[120px]
          transition-all duration-200
          ${isSelected
            ? "bg-slate-700/90"
            : "bg-slate-800/70"
          }
        `}
      >
        <p
          className="text-xs font-medium text-white truncate"
          title={data.label}
        >
          {data.label}
        </p>
        <p className="text-[10px] text-slate-400 capitalize">
          {data.nodeType}
        </p>
      </div>

      {/* Occurrence count badge */}
      {occurrenceCount > 1 && (
        <div
          className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-medium"
          style={{
            backgroundColor: data.color,
            color: "#1e293b",
          }}
          title={`Found in ${occurrenceCount} documents`}
        >
          {occurrenceCount}
        </div>
      )}

      {/* Confidence indicator */}
      {data.metadata.confidence_score !== undefined && data.metadata.confidence_score < 0.7 && (
        <div
          className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
          title={`Confidence: ${Math.round(data.metadata.confidence_score * 100)}%`}
        >
          {Math.round(data.metadata.confidence_score * 100)}%
        </div>
      )}
    </div>
  );
});

EntityNode.displayName = "EntityNode";
