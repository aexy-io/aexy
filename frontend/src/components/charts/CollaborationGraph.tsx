"use client";

import { useMemo } from "react";

interface Node {
  id: string;
  name: string;
  activity_level: number;
}

interface Edge {
  source: string;
  target: string;
  weight: number;
  interaction_type: string;
}

interface CollaborationData {
  nodes: Node[];
  edges: Edge[];
  density: number;
}

interface CollaborationGraphProps {
  data: CollaborationData | null;
  isLoading?: boolean;
}

export function CollaborationGraph({
  data,
  isLoading,
}: CollaborationGraphProps) {
  // Simple force-directed layout simulation
  const layout = useMemo(() => {
    if (!data || data.nodes.length === 0) return { nodes: [], edges: [] };

    const centerX = 200;
    const centerY = 150;
    const radius = 100;

    // Position nodes in a circle
    const nodePositions = data.nodes.map((node, idx) => {
      const angle = (2 * Math.PI * idx) / data.nodes.length;
      return {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    const nodeMap = new Map(nodePositions.map((n) => [n.id, n]));

    const edges = data.edges.map((edge) => ({
      ...edge,
      sourceNode: nodeMap.get(edge.source),
      targetNode: nodeMap.get(edge.target),
    }));

    return { nodes: nodePositions, edges };
  }, [data]);

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-72 bg-accent rounded-lg" />
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-72 text-muted-foreground">
        No collaboration data available
      </div>
    );
  }

  const getNodeColor = (activityLevel: number) => {
    if (activityLevel >= 0.7) return "#10B981"; // green
    if (activityLevel >= 0.4) return "#F59E0B"; // amber
    return "#6B7280"; // gray
  };

  const getEdgeColor = (type: string) => {
    switch (type) {
      case "review":
        return "#6366F1"; // indigo
      case "co_commit":
        return "#10B981"; // green
      case "pr_interaction":
        return "#F59E0B"; // amber
      default:
        return "#4B5563"; // gray
    }
  };

  return (
    <div>
      <svg viewBox="0 0 400 320" className="w-full h-72">
        {/* Edges */}
        {layout.edges.map((edge, idx) => {
          if (!edge.sourceNode || !edge.targetNode) return null;
          return (
            <line
              key={`edge-${idx}`}
              x1={edge.sourceNode.x}
              y1={edge.sourceNode.y}
              x2={edge.targetNode.x}
              y2={edge.targetNode.y}
              stroke={getEdgeColor(edge.interaction_type)}
              strokeWidth={Math.max(1, edge.weight / 3)}
              strokeOpacity={0.6}
            />
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((node) => (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={15 + node.activity_level * 10}
              fill={getNodeColor(node.activity_level)}
              stroke="#1E293B"
              strokeWidth={2}
            />
            <text
              x={node.x}
              y={node.y + 30}
              textAnchor="middle"
              fill="#D1D5DB"
              fontSize={11}
              fontWeight={500}
            >
              {node.name.split(" ")[0]}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="font-medium">Edge types:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-indigo-500" />
            <span>Review</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-green-500" />
            <span>Co-commit</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-amber-500" />
            <span>PR</span>
          </div>
        </div>
        <div>
          Density: <span className="text-foreground">{(data.density * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
