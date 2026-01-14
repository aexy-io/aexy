"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  Edge,
} from "@xyflow/react";

export type ExecutionStatus = "idle" | "pending" | "running" | "success" | "failed" | "skipped";

interface AnimatedEdgeData extends Record<string, unknown> {
  executionStatus?: ExecutionStatus;
  durationMs?: number;
  label?: string;
}

type AnimatedEdge = Edge<AnimatedEdgeData>;

const statusColors: Record<ExecutionStatus, { stroke: string; glow: string }> = {
  idle: { stroke: "#6366f1", glow: "none" },
  pending: { stroke: "#64748b", glow: "none" },
  running: { stroke: "#3b82f6", glow: "0 0 8px #3b82f6" },
  success: { stroke: "#10b981", glow: "0 0 6px #10b981" },
  failed: { stroke: "#ef4444", glow: "0 0 6px #ef4444" },
  skipped: { stroke: "#64748b", glow: "none" },
};

export const AnimatedEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
  }: EdgeProps<AnimatedEdge>) => {
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const executionStatus = data?.executionStatus || "idle";
    const durationMs = data?.durationMs;
    const colors = statusColors[executionStatus];

    const isAnimating = executionStatus === "running";
    const showDuration = executionStatus === "success" && durationMs !== undefined;

    return (
      <>
        {/* Glow effect for running/completed edges */}
        {(executionStatus === "running" || executionStatus === "success" || executionStatus === "failed") && (
          <path
            d={edgePath}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={6}
            strokeOpacity={0.3}
            className={isAnimating ? "animate-pulse" : ""}
          />
        )}

        {/* Main edge path */}
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...style,
            stroke: colors.stroke,
            strokeWidth: 2,
            filter: colors.glow !== "none" ? `drop-shadow(${colors.glow})` : undefined,
          }}
        />

        {/* Animated particles for running state */}
        {isAnimating && (
          <circle r="4" fill="#3b82f6" filter="drop-shadow(0 0 4px #3b82f6)">
            <animateMotion dur="1s" repeatCount="indefinite" path={edgePath} />
          </circle>
        )}

        {/* Duration label for completed edges */}
        {showDuration && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: "all",
              }}
              className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-emerald-500/30 text-[10px] text-emerald-400 font-medium"
            >
              {durationMs}ms
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }
);

AnimatedEdge.displayName = "AnimatedEdge";
