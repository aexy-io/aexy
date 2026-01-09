"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { TriggerNode } from "./nodes/TriggerNode";
import { ActionNode } from "./nodes/ActionNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { WaitNode } from "./nodes/WaitNode";
import { AgentNode } from "./nodes/AgentNode";
import { BranchNode } from "./nodes/BranchNode";
import { NodePalette } from "./NodePalette";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { WorkflowToolbar } from "./WorkflowToolbar";

export interface WorkflowCanvasProps {
  automationId: string;
  workspaceId: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  initialViewport?: { x: number; y: number; zoom: number };
  isPublished?: boolean;
  onSave: (nodes: Node[], edges: Edge[], viewport: { x: number; y: number; zoom: number }) => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onTest: (recordId?: string) => Promise<void>;
}

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  wait: WaitNode,
  agent: AgentNode,
  branch: BranchNode,
};

const defaultEdgeOptions = {
  animated: true,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
    color: "#6366f1",
  },
  style: {
    strokeWidth: 2,
    stroke: "#6366f1",
  },
};

function WorkflowCanvasInner({
  automationId,
  workspaceId,
  initialNodes = [],
  initialEdges = [],
  initialViewport = { x: 0, y: 0, zoom: 1 },
  isPublished = false,
  onSave,
  onPublish,
  onUnpublish,
  onTest,
}: WorkflowCanvasProps) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { getViewport, fitView, setViewport } = useReactFlow();

  // Apply initial viewport
  useMemo(() => {
    if (initialViewport) {
      setTimeout(() => {
        setViewport(initialViewport);
      }, 0);
    }
  }, [initialViewport, setViewport]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      setHasChanges(true);
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      setHasChanges(true);
    },
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: "#6366f1",
        },
        style: {
          strokeWidth: 2,
          stroke: "#6366f1",
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      setHasChanges(true);
    },
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const addNode = useCallback((type: string, subtype?: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 250, y: nodes.length * 100 + 50 },
      data: {
        label: getNodeLabel(type, subtype),
        ...(type === "trigger" && { trigger_type: subtype || "record_created" }),
        ...(type === "action" && { action_type: subtype || "update_record" }),
        ...(type === "wait" && { wait_type: subtype || "duration", duration_value: 1, duration_unit: "days" }),
        ...(type === "agent" && { agent_type: subtype || "sales_outreach" }),
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);
    setHasChanges(true);
  }, [nodes.length]);

  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    );
    setHasChanges(true);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const viewport = getViewport();
      await onSave(nodes, edges, viewport);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, getViewport, onSave]);

  return (
    <div className="h-full flex">
      {/* Node Palette (left sidebar) */}
      <NodePalette onAddNode={addNode} />

      {/* Main Canvas */}
      <div className="flex-1 h-full bg-slate-900">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          className="bg-slate-900"
        >
          <Background color="#334155" gap={15} />
          <Controls className="bg-slate-800 border-slate-700" />
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case "trigger":
                  return "#10b981";
                case "action":
                  return "#3b82f6";
                case "condition":
                  return "#f59e0b";
                case "wait":
                  return "#8b5cf6";
                case "agent":
                  return "#ec4899";
                case "branch":
                  return "#6366f1";
                default:
                  return "#64748b";
              }
            }}
            className="bg-slate-800 border-slate-700"
          />
          <Panel position="top-center">
            <WorkflowToolbar
              hasChanges={hasChanges}
              isSaving={isSaving}
              isPublished={isPublished}
              onSave={handleSave}
              onPublish={onPublish}
              onUnpublish={onUnpublish}
              onTest={onTest}
              onFitView={() => fitView()}
            />
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Config Panel (right sidebar) */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          workspaceId={workspaceId}
          onUpdate={(data) => updateNodeData(selectedNode.id, data)}
          onDelete={() => deleteNode(selectedNode.id)}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function getNodeLabel(type: string, subtype?: string): string {
  const labels: Record<string, Record<string, string>> = {
    trigger: {
      record_created: "Record Created",
      record_updated: "Record Updated",
      record_deleted: "Record Deleted",
      field_changed: "Field Changed",
      stage_changed: "Stage Changed",
      scheduled: "Scheduled",
      webhook_received: "Webhook Received",
      form_submitted: "Form Submitted",
      email_received: "Email Received",
      manual: "Manual Trigger",
    },
    action: {
      update_record: "Update Record",
      create_record: "Create Record",
      delete_record: "Delete Record",
      send_email: "Send Email",
      send_slack: "Send Slack",
      send_sms: "Send SMS",
      create_task: "Create Task",
      add_to_list: "Add to List",
      remove_from_list: "Remove from List",
      enroll_sequence: "Enroll in Sequence",
      unenroll_sequence: "Unenroll from Sequence",
      webhook_call: "Webhook Call",
      assign_owner: "Assign Owner",
    },
    wait: {
      duration: "Wait Duration",
      datetime: "Wait Until",
      event: "Wait for Event",
    },
    agent: {
      sales_outreach: "Sales Outreach",
      lead_scoring: "Lead Scoring",
      email_drafter: "Email Drafter",
      data_enrichment: "Data Enrichment",
      custom: "Custom Agent",
    },
    condition: {
      default: "Condition",
    },
    branch: {
      default: "Branch",
    },
  };

  return labels[type]?.[subtype || "default"] || type.charAt(0).toUpperCase() + type.slice(1);
}
