"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
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
import { JoinNode } from "./nodes/JoinNode";
import { AnimatedEdge } from "./edges/AnimatedEdge";
import type { ExecutionStatus } from "./edges/AnimatedEdge";
import { NodePalette } from "./NodePalette";
import { Plus, X } from "lucide-react";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { WorkflowToolbar } from "./WorkflowToolbar";
import { ExecutionHistory } from "./ExecutionHistory";
import { TestResultsPanel } from "./TestResultsPanel";
import { VersionHistory } from "./VersionHistory";
import { useWorkflowValidation } from "@/hooks/useWorkflowValidation";
import { api } from "@/lib/api";

interface NodeResult {
  node_id: string;
  node_type: string;
  node_label?: string;
  status: "success" | "failed" | "skipped" | "waiting";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  condition_result?: boolean;
  selected_branch?: string;
  error?: string;
  duration_ms?: number;
}

interface TestExecution {
  execution_id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  node_results: NodeResult[];
  error?: string;
  error_node_id?: string;
}

export interface WorkflowCanvasProps {
  automationId: string;
  workspaceId: string;
  module?: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  initialViewport?: { x: number; y: number; zoom: number };
  isPublished?: boolean;
  onSave: (nodes: Node[], edges: Edge[], viewport: { x: number; y: number; zoom: number }) => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onTest: (recordId?: string) => Promise<TestExecution | void>;
}

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  wait: WaitNode,
  agent: AgentNode,
  branch: BranchNode,
  join: JoinNode,
};

const edgeTypes = {
  animated: AnimatedEdge,
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
  module = "crm",
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
  const [showExecutionHistory, setShowExecutionHistory] = useState(false);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [showTestResults, setShowTestResults] = useState(false);
  const [testResult, setTestResult] = useState<TestExecution | null>(null);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
  const [showMobilePalette, setShowMobilePalette] = useState(false);

  // Workflow validation
  const { validationResult, getNodeErrors, hasNodeErrors } = useWorkflowValidation(nodes, edges);

  // Build a map of node results for quick lookup
  const nodeResultsMap = useMemo(() => {
    const map = new Map<string, NodeResult>();
    if (testResult?.node_results) {
      testResult.node_results.forEach((result) => {
        map.set(result.node_id, result);
      });
    }
    return map;
  }, [testResult]);

  // Enhance nodes with error states, highlighting, and execution status
  const enhancedNodes = useMemo(() => {
    return nodes.map((node) => {
      const nodeErrors = getNodeErrors(node.id);
      const hasErrors = nodeErrors.length > 0;
      const errorMessage = hasErrors ? nodeErrors.map((e) => e.message).join(", ") : undefined;
      const isHighlighted = highlightedNodeIds.has(node.id);

      // Get execution status from test results
      const nodeResult = nodeResultsMap.get(node.id);
      let executionStatus: ExecutionStatus = "idle";
      if (isTestRunning && !testResult) {
        // Test is starting, mark trigger as running
        if (node.type === "trigger") {
          executionStatus = "running";
        }
      } else if (nodeResult) {
        // Map node result status to execution status
        switch (nodeResult.status) {
          case "success":
            executionStatus = "success";
            break;
          case "failed":
            executionStatus = "failed";
            break;
          case "skipped":
            executionStatus = "skipped";
            break;
          case "waiting":
            executionStatus = "running";
            break;
        }
      }

      return {
        ...node,
        data: {
          ...node.data,
          hasError: hasErrors,
          errorMessage,
          isHighlighted,
          executionStatus,
          executionDurationMs: nodeResult?.duration_ms,
          conditionResult: nodeResult?.condition_result,
          selectedBranch: nodeResult?.selected_branch,
        },
      };
    });
  }, [nodes, getNodeErrors, highlightedNodeIds, nodeResultsMap, isTestRunning, testResult]);

  // Enhance edges with execution status
  const enhancedEdges = useMemo(() => {
    return edges.map((edge) => {
      // Check if the source node has been executed successfully
      const sourceResult = nodeResultsMap.get(edge.source);
      let executionStatus: ExecutionStatus = "idle";

      if (sourceResult) {
        if (sourceResult.status === "success") {
          // Check if this edge was the taken path for conditions/branches
          if (sourceResult.selected_branch) {
            // For branch/condition nodes, only mark the taken edge
            if (edge.sourceHandle === sourceResult.selected_branch ||
                edge.sourceHandle === (sourceResult.condition_result ? "true" : "false")) {
              executionStatus = "success";
            } else {
              executionStatus = "skipped";
            }
          } else {
            executionStatus = "success";
          }
        } else if (sourceResult.status === "failed") {
          executionStatus = "failed";
        }
      }

      return {
        ...edge,
        type: "animated",
        data: {
          ...edge.data,
          executionStatus,
          durationMs: sourceResult?.duration_ms,
        },
      };
    });
  }, [edges, nodeResultsMap]);

  // Handle test execution
  const handleTest = useCallback(async (recordId?: string) => {
    setShowTestResults(true);
    setIsTestRunning(true);
    setTestResult(null);

    try {
      const result = await onTest(recordId);
      if (result) {
        setTestResult(result);
        // Highlight executed nodes
        const executedNodeIds = new Set(result.node_results.map((r) => r.node_id));
        setHighlightedNodeIds(executedNodeIds);
      }
    } catch (error) {
      console.error("Test execution failed:", error);
    } finally {
      setIsTestRunning(false);
    }
  }, [onTest]);

  const { getViewport, fitView, setViewport, screenToFlowPosition } = useReactFlow();

  // Track if initial viewport has been applied
  const viewportInitialized = useRef(false);

  // Apply initial viewport only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialViewport && !viewportInitialized.current) {
      viewportInitialized.current = true;
      // Use requestAnimationFrame to ensure React Flow is ready
      requestAnimationFrame(() => {
        setViewport(initialViewport);
      });
    }
  }, []); // Intentionally empty - only run on mount

  // Load initial version number
  useEffect(() => {
    // Skip API call for new automations (automationId is "new" before creation)
    if (workspaceId && automationId && automationId !== "new") {
      api.get(`/workspaces/${workspaceId}/crm/automations/${automationId}/workflow`)
        .then((response) => {
          if (response.data?.version) {
            setCurrentVersion(response.data.version);
          }
        })
        .catch(() => {
          // Ignore errors
        });
    }
  }, [workspaceId, automationId]);

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
      const newEdge: Edge = {
        ...connection,
        id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source!,
        target: connection.target!,
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

  const addNode = useCallback((type: string, subtype?: string, position?: { x: number; y: number }) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: position || { x: 250, y: nodes.length * 100 + 50 },
      data: {
        label: getNodeLabel(type, subtype),
        ...(type === "trigger" && { trigger_type: subtype || "record.created" }),
        ...(type === "action" && { action_type: subtype || "update_record" }),
        ...(type === "condition" && { conditions: [], conjunction: "and" }),
        ...(type === "wait" && { wait_type: subtype || "duration", duration_value: 1, duration_unit: "days" }),
        ...(type === "agent" && { agent_type: subtype || "sales_outreach" }),
        ...(type === "branch" && { branches: [{ id: "branch-1", label: "Branch 1" }, { id: "branch-2", label: "Branch 2" }] }),
        ...(type === "join" && { join_type: subtype || "all", incoming_branches: 2 }),
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
    // Also update selectedNode if it's the one being edited
    setSelectedNode((current) =>
      current?.id === nodeId
        ? { ...current, data: { ...current.data, ...data } }
        : current
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

      // Fetch updated version number (skip for new automations)
      if (automationId && automationId !== "new") {
        try {
          const response = await api.get(
            `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow`
          );
          if (response.data?.version) {
            setCurrentVersion(response.data.version);
          }
        } catch {
          // Ignore version fetch errors
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, getViewport, onSave, workspaceId, automationId]);

  // Export workflow as JSON file
  const handleExport = useCallback(async () => {
    if (!automationId || automationId === "new") {
      console.warn("Cannot export workflow for unsaved automation");
      return;
    }
    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/export`
      );
      const exportData = response.data;

      // Create and download the JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `workflow-${automationId}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export workflow:", error);
      throw error;
    }
  }, [workspaceId, automationId]);

  // Import workflow from JSON data
  const handleImport = useCallback(async (data: unknown) => {
    if (!automationId || automationId === "new") {
      console.warn("Cannot import workflow for unsaved automation");
      return;
    }
    try {
      // Import the workflow
      await api.post(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/import`,
        data
      );

      // Fetch the updated workflow to get the remapped nodes/edges
      const workflowResponse = await api.get(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow`
      );

      const workflow = workflowResponse.data;
      if (workflow) {
        setNodes(workflow.nodes || []);
        setEdges(workflow.edges || []);
        if (workflow.viewport) {
          setViewport(workflow.viewport);
        }
        setHasChanges(false); // Data is already saved
        setSelectedNode(null);
      }
    } catch (error) {
      console.error("Failed to import workflow:", error);
      throw error;
    }
  }, [workspaceId, automationId, setViewport]);

  // Handle version restore
  const handleRestoreVersion = useCallback(async () => {
    if (!automationId || automationId === "new") {
      console.warn("Cannot restore version for unsaved automation");
      return;
    }
    // Fetch the updated workflow after restore
    try {
      const workflowResponse = await api.get(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow`
      );

      const workflow = workflowResponse.data;
      if (workflow) {
        setNodes(workflow.nodes || []);
        setEdges(workflow.edges || []);
        if (workflow.viewport) {
          setViewport(workflow.viewport);
        }
        setCurrentVersion(workflow.version || 1);
        setHasChanges(false);
        setSelectedNode(null);
      }
    } catch (error) {
      console.error("Failed to refresh workflow after restore:", error);
    }
  }, [workspaceId, automationId, setViewport]);

  // Drag and drop handlers for palette nodes
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData("application/reactflow");
      if (!data) return;

      try {
        const { type, subtype } = JSON.parse(data);

        // Get the position where the node was dropped
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        addNode(type, subtype, position);
      } catch (error) {
        console.error("Failed to parse drop data:", error);
      }
    },
    [screenToFlowPosition, addNode]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const isMac = typeof navigator !== "undefined" && navigator.userAgent.toUpperCase().indexOf("MAC") >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      // Delete / Backspace - delete selected node
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNode) {
        e.preventDefault();
        deleteNode(selectedNode.id);
      }

      // Cmd+S - save workflow
      if (cmdKey && e.key === "s") {
        e.preventDefault();
        if (hasChanges && !isSaving) {
          handleSave();
        }
      }

      // Cmd+Enter - test workflow
      if (cmdKey && e.key === "Enter") {
        e.preventDefault();
        if (!isTestRunning) {
          handleTest();
        }
      }

      // Escape - deselect / close panels
      if (e.key === "Escape") {
        if (showTestResults) {
          setShowTestResults(false);
        } else if (showExecutionHistory) {
          setShowExecutionHistory(false);
        } else if (selectedNode) {
          setSelectedNode(null);
        }
      }

      // Cmd+F - fit view
      if (cmdKey && e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        fitView({ padding: 0.2 });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedNode,
    deleteNode,
    hasChanges,
    isSaving,
    isTestRunning,
    showTestResults,
    showExecutionHistory,
    fitView,
    handleSave,
    handleTest,
  ]);

  return (
    <div className="h-full flex">
      {/* Node Palette (left sidebar) - responsive */}
      <div className="hidden md:block">
        <NodePalette
          workspaceId={workspaceId}
          module={module}
          onAddNode={addNode}
          isCollapsed={isPaletteCollapsed}
          onToggleCollapse={() => setIsPaletteCollapsed(!isPaletteCollapsed)}
        />
      </div>

      {/* Mobile palette overlay */}
      {showMobilePalette && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setShowMobilePalette(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-muted z-50 md:hidden">
            <NodePalette
              workspaceId={workspaceId}
              module={module}
              onAddNode={(type, subtype) => {
                addNode(type, subtype);
                setShowMobilePalette(false);
              }}
            />
          </div>
        </>
      )}

      {/* Mobile FAB to toggle palette */}
      <button
        onClick={() => setShowMobilePalette(!showMobilePalette)}
        className="fixed bottom-6 left-6 z-30 md:hidden p-4 bg-indigo-500 text-white rounded-full shadow-lg hover:bg-indigo-600 transition-colors"
      >
        {showMobilePalette ? (
          <X className="h-6 w-6" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
      </button>

      {/* Main Canvas */}
      <div className="flex-1 h-full bg-background">
        <ReactFlow
          nodes={enhancedNodes}
          edges={enhancedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          className="bg-background"
        >
          <Background color="#334155" gap={15} />
          <Controls className="bg-muted border-border" />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node: Node) => {
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
                case "join":
                  return "#14b8a6";
                default:
                  return "#64748b";
              }
            }}
            className="bg-muted border-border"
          />
          <Panel position="top-center">
            <WorkflowToolbar
              hasChanges={hasChanges}
              isSaving={isSaving}
              isPublished={isPublished}
              isTestRunning={isTestRunning}
              validationErrors={validationResult.errors.length}
              validationWarnings={validationResult.warnings.length}
              onSave={handleSave}
              onPublish={onPublish}
              onUnpublish={onUnpublish}
              onTest={handleTest}
              onFitView={() => fitView()}
              onHistoryOpen={() => setShowExecutionHistory(true)}
              onVersionHistoryOpen={() => setShowVersionHistory(true)}
              onTestResultsOpen={() => setShowTestResults(true)}
              onExport={handleExport}
              onImport={handleImport}
              currentVersion={currentVersion}
            />
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Config Panel (right sidebar) */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          workspaceId={workspaceId}
          automationId={automationId}
          module={module}
          onUpdate={(data) => updateNodeData(selectedNode.id, data)}
          onDelete={() => deleteNode(selectedNode.id)}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* Execution History Panel */}
      <ExecutionHistory
        workspaceId={workspaceId}
        automationId={automationId}
        isOpen={showExecutionHistory}
        onClose={() => {
          setShowExecutionHistory(false);
          setHighlightedNodeIds(new Set());
        }}
        onSelectExecution={(execution) => {
          // Highlight nodes that were executed
          const executedNodeIds = new Set(execution.steps.map((s) => s.node_id));
          setHighlightedNodeIds(executedNodeIds);
        }}
      />

      {/* Test Results Panel */}
      <TestResultsPanel
        workspaceId={workspaceId}
        automationId={automationId}
        isOpen={showTestResults}
        onClose={() => {
          setShowTestResults(false);
          setHighlightedNodeIds(new Set());
        }}
        testResult={testResult}
        isRunning={isTestRunning}
        onSelectNode={(nodeId) => {
          // Find and select the node
          const node = nodes.find((n) => n.id === nodeId);
          if (node) {
            setSelectedNode(node);
          }
        }}
        highlightedNodeIds={highlightedNodeIds}
      />

      {/* Version History Panel */}
      <VersionHistory
        workspaceId={workspaceId}
        automationId={automationId}
        currentVersion={currentVersion}
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        onRestore={handleRestoreVersion}
      />
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
      // CRM triggers
      record_created: "Record Created",
      record_updated: "Record Updated",
      record_deleted: "Record Deleted",
      field_changed: "Field Changed",
      stage_changed: "Stage Changed",
      "record.created": "Record Created",
      "record.updated": "Record Updated",
      "record.deleted": "Record Deleted",
      "field.changed": "Field Changed",
      "stage.changed": "Stage Changed",
      // Ticket triggers
      "ticket.created": "Ticket Created",
      "ticket.updated": "Ticket Updated",
      "ticket.status_changed": "Status Changed",
      "ticket.assigned": "Ticket Assigned",
      "ticket.priority_changed": "Priority Changed",
      "sla.breached": "SLA Breached",
      "sla.warning": "SLA Warning",
      // Hiring triggers
      "candidate.created": "Candidate Added",
      "candidate.updated": "Candidate Updated",
      "candidate.stage_changed": "Stage Changed",
      "assessment.completed": "Assessment Completed",
      "interview.scheduled": "Interview Scheduled",
      "interview.completed": "Interview Completed",
      "offer.sent": "Offer Sent",
      "offer.accepted": "Offer Accepted",
      "offer.rejected": "Offer Rejected",
      // Email marketing triggers
      "campaign.sent": "Campaign Sent",
      "campaign.scheduled": "Campaign Scheduled",
      "email.opened": "Email Opened",
      "email.clicked": "Link Clicked",
      "email.bounced": "Email Bounced",
      "email.unsubscribed": "Unsubscribed",
      "list.member_added": "Added to List",
      // Uptime triggers
      "monitor.created": "Monitor Created",
      "monitor.down": "Monitor Down",
      "monitor.up": "Monitor Up",
      "monitor.degraded": "Monitor Degraded",
      "incident.created": "Incident Created",
      "incident.resolved": "Incident Resolved",
      "incident.acknowledged": "Incident Acknowledged",
      "ssl.expiring": "SSL Expiring",
      // Sprint triggers
      "task.created": "Task Created",
      "task.status_changed": "Task Status Changed",
      "task.assigned": "Task Assigned",
      "sprint.started": "Sprint Started",
      "sprint.completed": "Sprint Completed",
      // Form triggers
      "form.submitted": "Form Submitted",
      // Booking triggers
      "booking.created": "Booking Created",
      "booking.confirmed": "Booking Confirmed",
      "booking.cancelled": "Booking Cancelled",
      "booking.rescheduled": "Booking Rescheduled",
      // Common triggers
      scheduled: "Scheduled",
      webhook_received: "Webhook Received",
      form_submitted: "Form Submitted",
      email_received: "Email Received",
      manual: "Manual Trigger",
    },
    action: {
      // Common actions
      send_email: "Send Email",
      send_slack: "Send Slack",
      send_sms: "Send SMS",
      webhook_call: "Webhook Call",
      api_request: "API Request",
      notify_user: "Notify User",
      notify_team: "Notify Team",
      run_agent: "Run AI Agent",
      // CRM actions
      update_record: "Update Record",
      create_record: "Create Record",
      delete_record: "Delete Record",
      create_task: "Create Task",
      add_to_list: "Add to List",
      remove_from_list: "Remove from List",
      enroll_sequence: "Enroll in Sequence",
      unenroll_sequence: "Unenroll from Sequence",
      assign_owner: "Assign Owner",
      link_records: "Link Records",
      enrich_record: "Enrich Record",
      classify_record: "Classify Record",
      generate_summary: "Generate Summary",
      // Ticket actions
      update_ticket: "Update Ticket",
      assign_ticket: "Assign Ticket",
      add_response: "Add Response",
      escalate: "Escalate",
      change_priority: "Change Priority",
      add_tag: "Add Tag",
      remove_tag: "Remove Tag",
      // Hiring actions
      update_candidate: "Update Candidate",
      move_stage: "Move Stage",
      schedule_interview: "Schedule Interview",
      send_rejection: "Send Rejection",
      create_offer: "Create Offer",
      add_note: "Add Note",
      assign_recruiter: "Assign Recruiter",
      // Email marketing actions
      send_campaign: "Send Campaign",
      update_contact: "Update Contact",
      // Uptime actions
      create_incident: "Create Incident",
      resolve_incident: "Resolve Incident",
      pause_monitor: "Pause Monitor",
      resume_monitor: "Resume Monitor",
      // Sprint actions
      update_task: "Update Task",
      assign_task: "Assign Task",
      move_task: "Move Task",
      create_subtask: "Create Subtask",
      add_comment: "Add Comment",
      // Form actions
      send_response: "Send Response",
      // Booking actions
      confirm_booking: "Confirm Booking",
      cancel_booking: "Cancel Booking",
      reschedule_booking: "Reschedule",
      send_reminder: "Send Reminder",
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
    join: {
      all: "Wait for All",
      any: "Wait for Any",
      count: "Wait for Count",
      default: "Join",
    },
  };

  return labels[type]?.[subtype || "default"] || subtype?.replace(/[._]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || type.charAt(0).toUpperCase() + type.slice(1);
}
