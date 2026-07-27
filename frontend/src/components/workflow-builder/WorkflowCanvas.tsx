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
import { toast } from "sonner";

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

  // UX-WFL-006: React Flow's Background takes a raw color string and
  // applies it as an SVG fill — it can't honor CSS variables or
  // currentColor. We mirror the project's --muted-foreground / hsl
  // values into a plain string and re-read on theme toggle so the
  // dotgrid stays legible across light + dark without overpowering
  // either. Defaults to a slate mid-tone for first paint.
  const [backgroundColor, setBackgroundColor] = useState("#94a3b8");
  useEffect(() => {
    const readColor = () => {
      if (typeof window === "undefined") return;
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--muted-foreground")
        .trim();
      if (!value) return;
      // Tailwind CSS vars are usually `H S% L%` triplets (sometimes
      // `HSL(...)`, sometimes already `hsl(...)`). Wrap in hsl() if
      // it's just numbers; otherwise pass through.
      const formatted = /^\d/.test(value) ? `hsl(${value})` : value;
      setBackgroundColor(formatted);
    };
    readColor();
    // Theme toggles flip the class on <html>; observe that to refresh
    // the computed value when the user switches.
    const observer = new MutationObserver(readColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => observer.disconnect();
  }, []);

  // Hoisted above the callbacks that need it. The original placement
  // was below the test/save flows, which created a TDZ trap when
  // handleTest's auto-save path tried to capture getViewport in
  // useCallback deps.
  const { getViewport, fitView, setViewport, screenToFlowPosition } = useReactFlow();

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

  // UX-WFL-007: Per-node memo cache. React Flow reconciles by id; if
  // we return the *same* enhanced object reference for an unchanged
  // node, RF skips that node's rerender. The prior implementation
  // produced new objects every render (since useMemo's `nodes`
  // dependency changes on every position drag + every config keystroke
  // in NodeConfigPanel), reflowing all 20+ nodes on each keystroke.
  // Cache keyed by nodeId; invalidates when the per-node inputs
  // actually change (deep-equal would be overkill — we compare the
  // primitive inputs we use to build the augmentation).
  const enhancedNodeCacheRef = useRef(new Map<string, { node: Node; key: string }>());
  const enhancedNodes = useMemo(() => {
    const cache = enhancedNodeCacheRef.current;
    const nextCache = new Map<string, { node: Node; key: string }>();
    const result = nodes.map((node) => {
      const nodeErrors = getNodeErrors(node.id);
      const hasErrors = nodeErrors.length > 0;
      const errorMessage = hasErrors ? nodeErrors.map((e) => e.message).join(", ") : undefined;
      const isHighlighted = highlightedNodeIds.has(node.id);
      const nodeResult = nodeResultsMap.get(node.id);
      let executionStatus: ExecutionStatus = "idle";
      if (isTestRunning && !testResult) {
        if (node.type === "trigger") executionStatus = "running";
      } else if (nodeResult) {
        switch (nodeResult.status) {
          case "success": executionStatus = "success"; break;
          case "failed": executionStatus = "failed"; break;
          case "skipped": executionStatus = "skipped"; break;
          case "waiting": executionStatus = "running"; break;
        }
      }

      // Cache key encodes every input that affects the augmented data.
      // `node` itself is part of identity — when its data changes
      // (config edit), the upstream reducer hands us a new reference,
      // and the cached entry below misses on `cached.node !== node`.
      const augmentationKey = [
        errorMessage ?? "",
        isHighlighted ? "1" : "0",
        executionStatus,
        nodeResult?.duration_ms ?? "",
        nodeResult?.condition_result ?? "",
        nodeResult?.selected_branch ?? "",
      ].join("|");

      const cached = cache.get(node.id);
      if (cached && cached.node === node && cached.key === augmentationKey) {
        nextCache.set(node.id, cached);
        return cached.node;
      }

      const enhanced: Node = {
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
      nextCache.set(node.id, { node: enhanced, key: augmentationKey });
      return enhanced;
    });
    enhancedNodeCacheRef.current = nextCache;
    return result;
  }, [nodes, getNodeErrors, highlightedNodeIds, nodeResultsMap, isTestRunning, testResult]);

  // Enhance edges with execution status
  // UX-DEF-008 (branch-edge labels): derive a label from the source
  // node's branch/condition definition so multi-branch workflows are
  // readable. Lives in enhancedEdges (not onConnect) so renaming a
  // branch's label propagates to the connected edges automatically.
  // Indexed by node.id so the lookup is O(1) per edge.
  const nodeIndex = useMemo(() => {
    const map = new Map<string, Node>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

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

      // Resolve a branch label for the edge. Branch nodes carry
      // `branches: [{id, label}]`; condition nodes use hard-coded
      // true/false handles. Other source types have no branch label.
      let branchLabel: string | undefined;
      const sourceNode = nodeIndex.get(edge.source);
      if (sourceNode && edge.sourceHandle) {
        if (sourceNode.type === "branch") {
          const branches = (sourceNode.data?.branches as Array<{ id: string; label: string }> | undefined) || [];
          const match = branches.find((b) => b.id === edge.sourceHandle);
          if (match?.label) branchLabel = match.label;
        } else if (sourceNode.type === "condition") {
          if (edge.sourceHandle === "true") branchLabel = "Yes";
          else if (edge.sourceHandle === "false") branchLabel = "No";
        }
      }

      return {
        ...edge,
        type: "animated",
        data: {
          ...edge.data,
          executionStatus,
          durationMs: sourceResult?.duration_ms,
          label: branchLabel,
        },
      };
    });
  }, [edges, nodeResultsMap, nodeIndex]);

  // Handle test execution
  const handleTest = useCallback(async (recordId?: string) => {
    // UX-DEF-001 (partial): close sibling drawers when test results
    // open so the stacks don't pile on top of each other.
    setShowExecutionHistory(false);
    setShowVersionHistory(false);
    setShowTestResults(true);
    setIsTestRunning(true);
    setTestResult(null);

    try {
      // Auto-save before testing. On /automations/new the parent's
      // onTest bails when automationId is still "new" — the user
      // would click "Run Test", a record ID would be generated, and
      // nothing would fire. Force a save first so the automation
      // exists server-side and the workflow nodes are persisted.
      // Same gate as Export/Import/Restore — the test endpoint needs
      // a real automation to execute against.
      const isUnsaved = !automationId || automationId === "new";
      if (isUnsaved || hasChanges) {
        try {
          const viewport = getViewport();
          await onSave(nodes, edges, viewport);
          setHasChanges(false);
        } catch (saveErr) {
          console.error("Auto-save before test failed:", saveErr);
          toast.error("Couldn't save the workflow before testing");
          return;
        }
      }
      const result = await onTest(recordId);
      if (result) {
        setTestResult(result);
        // Highlight executed nodes
        const executedNodeIds = new Set(result.node_results.map((r) => r.node_id));
        setHighlightedNodeIds(executedNodeIds);
      }
    } catch (error) {
      console.error("Test execution failed:", error);
      toast.error("Test execution failed");
    } finally {
      setIsTestRunning(false);
    }
  }, [onTest, onSave, automationId, hasChanges, nodes, edges, getViewport]);


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

  // UX-DEF-002: One-shot auto-layout. BFS from the set of "root"
  // nodes (no incoming edges, in practice triggers) and assigns each
  // node a `(depth, lane)` slot which maps to `(x, y)` on canvas. Pure
  // frontend — no dagre dep. Gets a messy canvas tidy enough that the
  // user can keep working without nodes overlapping the palette / FAB.
  // Multi-root automations spread horizontally; cycles fall back to
  // their existing position so we don't infinite-loop.
  const onAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;
    const HORIZONTAL_GAP = 280;
    const VERTICAL_GAP = 140;
    const ORIGIN = { x: 80, y: 80 };

    const incomingByNode = new Map<string, string[]>();
    const outgoingByNode = new Map<string, string[]>();
    nodes.forEach((n) => {
      incomingByNode.set(n.id, []);
      outgoingByNode.set(n.id, []);
    });
    edges.forEach((e) => {
      incomingByNode.get(e.target)?.push(e.source);
      outgoingByNode.get(e.source)?.push(e.target);
    });

    // Roots = nodes with no incoming edge. Sorted by id for stable
    // placement so re-running the layout doesn't shuffle lanes.
    const roots = nodes
      .filter((n) => (incomingByNode.get(n.id) ?? []).length === 0)
      .map((n) => n.id)
      .sort();

    const depthByNode = new Map<string, number>();
    const queue: Array<{ id: string; depth: number }> = roots.map((id) => ({ id, depth: 0 }));
    const seen = new Set<string>();
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (seen.has(id)) {
        // Cycle — keep the earlier depth.
        depthByNode.set(id, Math.max(depthByNode.get(id) ?? 0, depth));
        continue;
      }
      seen.add(id);
      depthByNode.set(id, Math.max(depthByNode.get(id) ?? 0, depth));
      (outgoingByNode.get(id) ?? []).forEach((tgt) => {
        queue.push({ id: tgt, depth: depth + 1 });
      });
    }
    // Orphaned nodes (unreachable from any root) get depth 0 so they
    // line up next to roots instead of vanishing.
    nodes.forEach((n) => {
      if (!depthByNode.has(n.id)) depthByNode.set(n.id, 0);
    });

    // Lane assignment per depth column. Stable order = source id then
    // node id so repeated layout runs are idempotent.
    const byDepth = new Map<number, string[]>();
    nodes
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((n) => {
        const d = depthByNode.get(n.id) ?? 0;
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d)!.push(n.id);
      });

    setNodes((current) =>
      current.map((n) => {
        const depth = depthByNode.get(n.id) ?? 0;
        const lane = byDepth.get(depth)?.indexOf(n.id) ?? 0;
        return {
          ...n,
          position: {
            x: ORIGIN.x + depth * HORIZONTAL_GAP,
            y: ORIGIN.y + lane * VERTICAL_GAP,
          },
        };
      }),
    );
    setHasChanges(true);
    // Re-fit after layout so the user immediately sees the result.
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }));
  }, [nodes, edges, setNodes, fitView]);

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
    // UX-WFL-008: viewport-aware default position. The hardcoded
    // (250, 50) misses the visible area entirely on small viewports
    // or after the user has panned away — the new node spawns off-
    // screen and the canvas appears not to have responded. Falls back
    // to (250, 50) for SSR / pre-mount.
    const fallbackPosition = (() => {
      if (typeof window === "undefined") return { x: 250, y: 50 };
      try {
        const center = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: 220,
        });
        // Stagger chained adds so they don't stack on the same pixel.
        return { x: center.x - 90, y: center.y + nodes.length * 100 };
      } catch {
        return { x: 250, y: nodes.length * 100 + 50 };
      }
    })();
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: position || fallbackPosition,
      data: {
        label: getNodeLabel(type, subtype),
        ...(type === "trigger" && { trigger_type: subtype || "record.created" }),
        ...(type === "action" && {
          action_type: subtype || "update_record",
          ...(subtype === "notify_user" && {
            notify_type: "email",
            channel: "email",
          }),
        }),
        ...(type === "condition" && { conditions: [], conjunction: "and" }),
        ...(type === "wait" && { wait_type: subtype || "duration", duration_value: 1, duration_unit: "days" }),
        ...(type === "agent" && { agent_type: "existing" }),
        ...(type === "branch" && {
          branches: [
            {
              id: "branch-1",
              label: "Path 1",
              field: "",
              operator: "equals",
              value: "",
            },
            { id: "else", label: "Else", is_else: true },
          ],
        }),
        ...(type === "join" && { join_type: subtype || "all", incoming_branches: 2 }),
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);
    setHasChanges(true);
  }, [nodes.length, screenToFlowPosition]);

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
    } catch (error) {
      // The page already shows the specific save error. Catch it here so a
      // rejected click handler does not create a development-overlay error.
      console.error("Workflow save failed:", error);
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, getViewport, onSave, workspaceId, automationId]);

  // Export workflow as JSON file
  const handleExport = useCallback(async () => {
    if (!automationId || automationId === "new") {
      // UX-AUT-DTL-005: surface the precondition to the user instead of
      // silently no-op'ing into the console — the Export button stays
      // clickable in this state, so a click that does nothing visible
      // reads as "Export is broken." Telling the user "save first"
      // points them at the only action that unblocks export.
      toast.error("Save the automation before exporting");
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
      toast.error("Failed to export workflow");
      throw error;
    }
  }, [workspaceId, automationId]);

  // Import workflow from JSON data
  const handleImport = useCallback(async (data: unknown) => {
    if (!automationId || automationId === "new") {
      toast.error("Save the automation before importing");
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
      toast.error("Failed to import workflow");
      throw error;
    }
  }, [workspaceId, automationId, setViewport]);

  // Handle version restore
  const handleRestoreVersion = useCallback(async () => {
    if (!automationId || automationId === "new") {
      toast.error("Save the automation before restoring a version");
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

      {/* Mobile FAB to toggle palette — pinned bottom-right so it
          doesn't collide with React Flow's built-in Controls (zoom in /
          zoom out / fit-view), which live at bottom-left by default. */}
      <button
        onClick={() => setShowMobilePalette(!showMobilePalette)}
        aria-label={showMobilePalette ? "Close palette" : "Open palette"}
        className="fixed bottom-6 right-6 z-30 md:hidden p-4 bg-indigo-500 text-white rounded-full shadow-lg hover:bg-indigo-600 transition-colors"
      >
        {showMobilePalette ? (
          <X className="h-6 w-6" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
      </button>

      {/* Main Canvas */}
      <div className="flex-1 h-full bg-background relative">
        {/* Empty-canvas onboarding — overlaid above the snap grid when
            the user has no nodes yet. Closes the "blank Figma board"
            cold-start cliff. Pointer-events-none on the wrapper lets
            users still pan/zoom around it; the inner CTA opts back in. */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            <div className="pointer-events-auto max-w-sm text-center px-6">
              <div className="mx-auto mb-4 h-24 w-48 rounded-2xl border-2 border-dashed border-border bg-muted/40 flex items-center justify-center">
                <Plus className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Start with a Trigger
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick what kicks this workflow off - a record created, a form
                submitted, a webhook fired. Then chain actions to it.
              </p>
              <button
                type="button"
                onClick={() => addNode("trigger")}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add a Trigger
              </button>
              <p className="mt-2 text-xs text-muted-foreground/70">
                Or drag any node from the palette on the left.
              </p>
            </div>
          </div>
        )}
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
          <Background color={backgroundColor} gap={15} bgColor="transparent" />
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
              // UX-WFL-005: hand the toolbar the full issue list +
              // a reveal callback so the validation chip becomes a
              // jump-to-error popover. The label resolves from the
              // live `nodes` array so renames flow through.
              validationItems={[
                ...validationResult.errors,
                ...validationResult.warnings,
              ].map((err) => {
                const node = nodes.find((n) => n.id === err.nodeId);
                const label =
                  (node?.data as { label?: string } | undefined)?.label ??
                  undefined;
                return {
                  nodeId: err.nodeId,
                  nodeLabel: label,
                  message: err.message,
                  severity: err.severity,
                };
              })}
              onRevealNode={(nodeId) => {
                const node = nodes.find((n) => n.id === nodeId);
                if (!node) return;
                setSelectedNode(node);
                // Center on the node and zoom in a touch so it stands
                // out from a dense canvas.
                fitView({
                  nodes: [{ id: nodeId }],
                  duration: 400,
                  padding: 0.4,
                });
              }}
              workspaceId={workspaceId}
              onSave={handleSave}
              onPublish={onPublish}
              onUnpublish={onUnpublish}
              onTest={handleTest}
              onFitView={() => fitView()}
              onAutoLayout={onAutoLayout}
              // UX-DEF-001 (partial): right-drawer cohesion. Toolbar
              // openers now close the other panels first so only one
              // right-drawer is ever visible at a time. Full tabbed
              // Inspector consolidation is deferred — this kills the
              // stacking artifact without restructuring each panel's
              // lifecycle.
              onHistoryOpen={() => {
                setShowTestResults(false);
                setShowVersionHistory(false);
                setShowExecutionHistory(true);
              }}
              onVersionHistoryOpen={() => {
                setShowTestResults(false);
                setShowExecutionHistory(false);
                setShowVersionHistory(true);
              }}
              onTestResultsOpen={() => {
                setShowExecutionHistory(false);
                setShowVersionHistory(false);
                setShowTestResults(true);
              }}
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
          triggerObjectId={
            // A blank canvas carries a starter trigger node with no object;
            // prefer whichever trigger actually has one chosen.
            (nodes.find((n) => n.type === "trigger" && n.data?.object_id)?.data
              ?.object_id as string) || undefined
          }
          module={module}
          onUpdate={(data) => updateNodeData(selectedNode.id, data)}
          onDelete={() => deleteNode(selectedNode.id)}
          onClose={() => setSelectedNode(null)}
          // The same handler the toolbar and the keyboard shortcut use, so a
          // save started from the node panel is the identical request and
          // cannot drift from the rest of the builder. It covers a brand-new
          // automation too: the parent's save creates it before writing the
          // graph, which is why the panel needs no id of its own.
          onSave={handleSave}
          isSaving={isSaving}
          hasChanges={hasChanges}
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
