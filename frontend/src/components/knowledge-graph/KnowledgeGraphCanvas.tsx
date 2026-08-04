"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { DocumentNode } from "./nodes/DocumentNode";
import { EntityNode } from "./nodes/EntityNode";
import { RelationshipEdge } from "./edges/RelationshipEdge";
import { useThemeStore } from "@/stores/themeStore";

export interface GraphNode {
  id: string;
  label: string;
  node_type: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship_type: string;
  strength: number;
}

export interface TemporalData {
  entity_timeline?: Array<{ date: string; count: number } | { entity_id: string; first_seen: string; last_seen: string }>;
  activity_heatmap?: Array<{ date: string; count: number }>;
  document_activity?: Array<{ date: string; count: number }>;
  activity_scores?: Record<string, number>;
  date_range?: { from: string; to: string };
}

interface KnowledgeGraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeSelect: (nodeId: string, nodeType: string) => void;
  onNodeDeselect: () => void;
  selectedNodeId: string | null;
  temporal?: TemporalData | null;
}

const nodeTypes = {
  document: DocumentNode,
  entity: EntityNode,
};

const edgeTypes = {
  relationship: RelationshipEdge,
};

/** Stable 0..1 value from a string, so layout jitter is deterministic per node. */
function hashToUnit(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

// Entity type colors
const ENTITY_TYPE_COLORS: Record<string, string> = {
  person: "#f472b6", // pink
  concept: "#a78bfa", // purple
  technology: "#34d399", // green
  project: "#60a5fa", // blue
  organization: "#fbbf24", // yellow
  code: "#f97316", // orange
  external: "#94a3b8", // gray
  document: "#3b82f6", // blue for documents
};

function KnowledgeGraphCanvasInner({
  nodes: graphNodes,
  edges: graphEdges,
  onNodeSelect,
  onNodeDeselect,
  selectedNodeId,
  temporal,
}: KnowledgeGraphCanvasProps) {
  const { fitView } = useReactFlow();
  const lastFittedCount = useRef<number | null>(null);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  // Convert graph data to React Flow nodes
  const nodes: Node[] = useMemo(() => {
    // Simple force-directed layout simulation
    const nodeCount = graphNodes.length;
    const radius = Math.max(300, nodeCount * 15);
    const angleStep = (2 * Math.PI) / nodeCount;

    return graphNodes.map((gNode, index) => {
      const isDocument = gNode.node_type === "document";
      const activityScore = temporal?.activity_scores?.[gNode.id] || 0;

      // Circular layout, jittered so same-radius nodes don't overlap. The
      // jitter is derived from the node id rather than Math.random(): a random
      // value in render is impure (the lint rule's complaint) and, more to the
      // point, it gave every node a new position on each recompute, so the
      // graph visibly reshuffled whenever the temporal filter changed.
      const angle = angleStep * index;
      const jitter = (hashToUnit(gNode.id) * 50) - 25;
      const x = Math.cos(angle) * (radius + jitter) + 500;
      const y = Math.sin(angle) * (radius + jitter) + 400;

      return {
        id: gNode.id,
        type: isDocument ? "document" : "entity",
        position: { x, y },
        data: {
          label: gNode.label,
          nodeType: gNode.node_type,
          metadata: gNode.metadata,
          color: ENTITY_TYPE_COLORS[gNode.node_type] || "#94a3b8",
          isSelected: selectedNodeId === gNode.id,
          activityScore,
        },
      };
    });
  }, [graphNodes, selectedNodeId, temporal]);

  // Convert graph edges to React Flow edges
  const edges: Edge[] = useMemo(() => {
    return graphEdges.map((gEdge, index) => ({
      id: `edge-${gEdge.source}-${gEdge.target}-${index}`,
      source: gEdge.source,
      target: gEdge.target,
      type: "relationship",
      data: {
        relationshipType: gEdge.relationship_type,
        strength: gEdge.strength,
      },
    }));
  }, [graphEdges]);

  // Fit the view once per change in node count. This used to be a boolean state
  // plus a second effect that reset it, which meant calling setState during an
  // effect on every graph change — cascading renders for something the render
  // output never depends on. A ref holds the same fact without re-rendering.
  useEffect(() => {
    if (nodes.length === 0 || lastFittedCount.current === graphNodes.length) return;
    const timer = setTimeout(() => {
      fitView({ padding: 0.2 });
      lastFittedCount.current = graphNodes.length;
    }, 100);
    return () => clearTimeout(timer);
  }, [nodes, graphNodes.length, fitView]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node.id, node.type || "entity");
    },
    [onNodeSelect]
  );

  const handlePaneClick = useCallback(() => {
    onNodeDeselect();
  }, [onNodeDeselect]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      connectionMode={ConnectionMode.Loose}
      fitView
      // React Flow's own dark token set, instead of overriding its light one
      // button-by-button. Without it the controls keep light defaults (#fefefe
      // buttons, icons inheriting near-white text) and vanish in dark mode.
      colorMode={resolvedTheme}
      className="bg-background"
      minZoom={0.1}
      maxZoom={2}
    >
      <Background color="#334155" gap={20} />
      <Controls className="bg-muted border-border" />
      <MiniMap
        nodeColor={(node) => {
          const color = ENTITY_TYPE_COLORS[node.data?.nodeType as string];
          return color || "#64748b";
        }}
        className="bg-muted border-border"
        maskColor="rgb(30 41 59 / 0.7)"
      />
    </ReactFlow>
  );
}

export function KnowledgeGraphCanvas(props: KnowledgeGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
