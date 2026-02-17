"use client";

import { useState, useEffect } from "react";
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  AlertCircle,
  SkipForward,
} from "lucide-react";
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

interface TestResultsPanelProps {
  workspaceId: string;
  automationId: string;
  isOpen: boolean;
  onClose: () => void;
  testResult: TestExecution | null;
  isRunning: boolean;
  onSelectNode: (nodeId: string) => void;
  highlightedNodeIds: Set<string>;
}

const statusIcons: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  failed: <XCircle className="h-4 w-4 text-red-400" />,
  skipped: <SkipForward className="h-4 w-4 text-muted-foreground" />,
  waiting: <Clock className="h-4 w-4 text-amber-400" />,
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
};

const statusColors: Record<string, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10",
  failed: "border-red-500/30 bg-red-500/10",
  skipped: "border-muted-foreground/30 bg-muted-foreground/10",
  waiting: "border-amber-500/30 bg-amber-500/10",
  pending: "border-muted-foreground/30 bg-muted-foreground/10",
};

const nodeTypeLabels: Record<string, string> = {
  trigger: "Trigger",
  action: "Action",
  condition: "Condition",
  wait: "Wait",
  agent: "AI Agent",
  branch: "Branch",
};

export function TestResultsPanel({
  workspaceId,
  automationId,
  isOpen,
  onClose,
  testResult,
  isRunning,
  onSelectNode,
  highlightedNodeIds,
}: TestResultsPanelProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-expand failed nodes
  useEffect(() => {
    if (testResult) {
      const failedNodes = testResult.node_results
        .filter((r) => r.status === "failed")
        .map((r) => r.node_id);
      setExpandedNodes(new Set(failedNodes));
    }
  }, [testResult]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const getTotalDuration = () => {
    if (!testResult?.node_results) return 0;
    return testResult.node_results.reduce(
      (sum, r) => sum + (r.duration_ms || 0),
      0
    );
  };

  const getStatusCounts = () => {
    if (!testResult?.node_results) return { success: 0, failed: 0, skipped: 0 };
    return testResult.node_results.reduce(
      (acc, r) => {
        acc[r.status as keyof typeof acc] = (acc[r.status as keyof typeof acc] || 0) + 1;
        return acc;
      },
      { success: 0, failed: 0, skipped: 0 }
    );
  };

  if (!isOpen) return null;

  const statusCounts = getStatusCounts();

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-muted/95 backdrop-blur-sm border-l border-border shadow-2xl z-[100] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Play className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-foreground font-semibold">Test Results</h3>
            <p className="text-xs text-muted-foreground">
              {isRunning ? "Running..." : testResult?.status === "completed" ? "Completed" : testResult?.status || "Ready"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Status summary */}
      {testResult && (
        <div className="p-4 border-b border-border bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {testResult.status === "completed" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : testResult.status === "failed" ? (
                <XCircle className="h-5 w-5 text-red-400" />
              ) : (
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
              )}
              <span className="text-foreground font-medium capitalize">
                {testResult.status}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {(getTotalDuration() / 1000).toFixed(2)}s
            </span>
          </div>

          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-foreground">{statusCounts.success}</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-400" />
              <span className="text-foreground">{statusCounts.failed}</span>
            </div>
            <div className="flex items-center gap-1">
              <SkipForward className="h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">{statusCounts.skipped}</span>
            </div>
          </div>

          {testResult.error && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">{testResult.error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Node results */}
      <div className="flex-1 overflow-y-auto p-4">
        {isRunning && !testResult && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
            <p className="text-muted-foreground">Executing workflow...</p>
          </div>
        )}

        {testResult?.node_results && (
          <div className="space-y-2">
            {testResult.node_results.map((result) => (
              <div
                key={result.node_id}
                className={`border rounded-lg overflow-hidden transition-all ${
                  statusColors[result.status]
                } ${
                  highlightedNodeIds.has(result.node_id)
                    ? "ring-2 ring-blue-500"
                    : ""
                }`}
              >
                {/* Node header */}
                <button
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/30"
                  onClick={() => {
                    toggleNode(result.node_id);
                    onSelectNode(result.node_id);
                  }}
                >
                  {expandedNodes.has(result.node_id) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  {statusIcons[result.status]}
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground font-medium text-sm truncate">
                      {result.node_label || result.node_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {nodeTypeLabels[result.node_type] || result.node_type}
                      {result.duration_ms !== undefined && (
                        <span className="ml-2">({result.duration_ms}ms)</span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {expandedNodes.has(result.node_id) && (
                  <div className="border-t border-border/50 p-3 space-y-3 bg-background/30">
                    {/* Condition result */}
                    {result.condition_result !== undefined && (
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                          Condition Result
                        </div>
                        <div className="flex items-center gap-2">
                          {result.condition_result ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              <span className="text-emerald-400">True</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-red-400" />
                              <span className="text-red-400">False</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Selected branch */}
                    {result.selected_branch && (
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                          Selected Branch
                        </div>
                        <div className="text-sm text-blue-400">
                          {result.selected_branch}
                        </div>
                      </div>
                    )}

                    {/* Input data */}
                    {result.input && Object.keys(result.input).length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                          Input
                        </div>
                        <pre className="text-xs text-foreground bg-background/50 rounded p-2 overflow-x-auto">
                          {JSON.stringify(result.input, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Output data */}
                    {result.output && Object.keys(result.output).length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                          Output
                        </div>
                        <pre className="text-xs text-foreground bg-background/50 rounded p-2 overflow-x-auto">
                          {JSON.stringify(result.output, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Error */}
                    {result.error && (
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                          Error
                        </div>
                        <div className="text-sm text-red-400 bg-red-500/10 rounded p-2">
                          {result.error}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!isRunning && !testResult && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Play className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">No test results yet</p>
              <p className="text-sm text-muted-foreground">
                Click &quot;Test&quot; in the toolbar to run a test
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer with dry run notice */}
      {testResult && (
        <div className="p-4 border-t border-border bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>
              This was a dry run. No actual actions were performed.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
