"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  Edge,
} from "@xyflow/react";

interface RelationshipEdgeData extends Record<string, unknown> {
  relationshipType: string;
  strength: number;
}

type RelationshipEdgeType = Edge<RelationshipEdgeData>;

// Colors for different relationship types
const RELATIONSHIP_COLORS: Record<string, string> = {
  mentions: "#94a3b8", // gray
  related_to: "#a78bfa", // purple
  depends_on: "#f97316", // orange
  authored_by: "#f472b6", // pink
  implements: "#34d399", // green
  references: "#60a5fa", // blue
  links_to: "#fbbf24", // yellow
  shares_entity: "#06b6d4", // cyan
  mentioned_in: "#94a3b8", // gray
};

// Labels for relationship types
const RELATIONSHIP_LABELS: Record<string, string> = {
  mentions: "mentions",
  related_to: "related",
  depends_on: "depends",
  authored_by: "author",
  implements: "implements",
  references: "refs",
  links_to: "links",
  shares_entity: "shares",
  mentioned_in: "in",
};

export const RelationshipEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  }: EdgeProps<RelationshipEdgeType>) => {
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const relationshipType = data?.relationshipType || "related_to";
    const strength = data?.strength || 0.5;

    const color = RELATIONSHIP_COLORS[relationshipType] || "#94a3b8";
    const label = RELATIONSHIP_LABELS[relationshipType] || relationshipType;

    // Calculate stroke width based on strength
    const strokeWidth = 1 + strength * 2;

    // Calculate opacity based on strength
    const opacity = 0.3 + strength * 0.7;

    return (
      <>
        {/* Background glow for stronger connections */}
        {strength > 0.6 && (
          <path
            d={edgePath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth + 4}
            strokeOpacity={0.15}
          />
        )}

        {/* Main edge */}
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth,
            strokeOpacity: opacity,
          }}
        />

        {/* Animated dots for active connections */}
        {strength > 0.7 && (
          <circle
            r="3"
            fill={color}
            filter={`drop-shadow(0 0 3px ${color})`}
          >
            <animateMotion
              dur="3s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        )}

        {/* Relationship label (only for stronger connections) */}
        {strength > 0.5 && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: "none",
                borderColor: `${color}50`,
                color,
              }}
              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800/90 border"
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }
);

RelationshipEdge.displayName = "RelationshipEdge";
