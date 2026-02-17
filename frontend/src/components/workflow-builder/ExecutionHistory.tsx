"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  Play,
  ChevronRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

interface ExecutionStep {
  id: string;
  node_id: string;
  node_type: string;
  node_label: string | null;
  status: string;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  condition_result: boolean | null;
  selected_branch: string | null;
  error: string | null;
  duration_ms: number | null;
  executed_at: string;
}

interface Execution {
  id: string;
  workflow_id: string;
  automation_id: string;
  record_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  is_dry_run: boolean;
  created_at: string;
}

interface ExecutionDetail extends Execution {
  current_node_id: string | null;
  next_node_id: string | null;
  context: Record<string, unknown>;
  trigger_data: Record<string, unknown>;
  resume_at: string | null;
  wait_event_type: string | null;
  paused_at: string | null;
  error_node_id: string | null;
  steps: ExecutionStep[];
}

interface ExecutionHistoryProps {
  workspaceId: string;
  automationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectExecution?: (execution: ExecutionDetail) => void;
}

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  completed: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
  failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  running: { icon: Play, color: "text-blue-400", bg: "bg-blue-500/10" },
  paused: { icon: Pause, color: "text-amber-400", bg: "bg-amber-500/10" },
  pending: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted-foreground/10" },
  cancelled: { icon: AlertCircle, color: "text-muted-foreground", bg: "bg-muted-foreground/10" },
};

const stepStatusConfig: Record<string, { color: string; bg: string }> = {
  success: { color: "text-green-400", bg: "bg-green-500" },
  failed: { color: "text-red-400", bg: "bg-red-500" },
  running: { color: "text-blue-400", bg: "bg-blue-500" },
  waiting: { color: "text-amber-400", bg: "bg-amber-500" },
  skipped: { color: "text-muted-foreground", bg: "bg-muted" },
  pending: { color: "text-muted-foreground", bg: "bg-muted" },
};

export function ExecutionHistory({
  workspaceId,
  automationId,
  isOpen,
  onClose,
  onSelectExecution,
}: ExecutionHistoryProps) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExecutions = useCallback(async () => {
    if (!workspaceId || !automationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/executions`
      );
      setExecutions(response.data);
    } catch (err) {
      setError("Failed to load executions");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, automationId]);

  const loadExecutionDetail = useCallback(
    async (executionId: string) => {
      if (!workspaceId || !automationId) return;

      setIsLoadingDetail(true);

      try {
        const response = await api.get(
          `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/executions/${executionId}`
        );
        setSelectedExecution(response.data);
        onSelectExecution?.(response.data);
      } catch (err) {
        console.error("Failed to load execution detail:", err);
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [workspaceId, automationId, onSelectExecution]
  );

  const cancelExecution = useCallback(
    async (executionId: string) => {
      if (!workspaceId || !automationId) return;

      try {
        await api.post(
          `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/executions/${executionId}/cancel`
        );
        loadExecutions();
        if (selectedExecution?.id === executionId) {
          loadExecutionDetail(executionId);
        }
      } catch (err) {
        console.error("Failed to cancel execution:", err);
      }
    },
    [workspaceId, automationId, loadExecutions, loadExecutionDetail, selectedExecution]
  );

  useEffect(() => {
    // Skip API call for new automations (automationId is "new" before creation)
    if (isOpen && automationId !== "new") {
      loadExecutions();
    }
  }, [isOpen, loadExecutions, automationId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-muted border-l border-border shadow-xl z-[100] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Execution History</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadExecutions}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedExecution ? (
          // Execution Detail View
          <div className="flex-1 overflow-y-auto">
            {/* Back button */}
            <button
              onClick={() => setSelectedExecution(null)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              Back to list
            </button>

            {isLoadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <div className="px-4 py-2">
                {/* Execution Status Header */}
                <div className={`rounded-lg p-3 mb-4 ${statusConfig[selectedExecution.status]?.bg || "bg-accent"}`}>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const config = statusConfig[selectedExecution.status];
                      const Icon = config?.icon || Clock;
                      return <Icon className={`h-5 w-5 ${config?.color || "text-muted-foreground"}`} />;
                    })()}
                    <span className={`font-medium capitalize ${statusConfig[selectedExecution.status]?.color || "text-muted-foreground"}`}>
                      {selectedExecution.status}
                    </span>
                    {selectedExecution.is_dry_run && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                        Test Run
                      </span>
                    )}
                  </div>
                  {selectedExecution.error && (
                    <p className="text-sm text-red-400 mt-2">{selectedExecution.error}</p>
                  )}
                  {selectedExecution.resume_at && (
                    <p className="text-sm text-amber-400 mt-2">
                      Resumes at: {formatDate(selectedExecution.resume_at)}
                    </p>
                  )}
                </div>

                {/* Timestamps */}
                <div className="text-sm text-muted-foreground mb-4 space-y-1">
                  {selectedExecution.started_at && (
                    <div>Started: {formatDate(selectedExecution.started_at)}</div>
                  )}
                  {selectedExecution.completed_at && (
                    <div>Completed: {formatDate(selectedExecution.completed_at)}</div>
                  )}
                </div>

                {/* Cancel button for running/paused */}
                {["running", "paused", "pending"].includes(selectedExecution.status) && (
                  <button
                    onClick={() => cancelExecution(selectedExecution.id)}
                    className="w-full mb-4 px-3 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel Execution
                  </button>
                )}

                {/* Steps */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    Steps ({selectedExecution.steps.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedExecution.steps.map((step, index) => (
                      <div
                        key={step.id}
                        className="bg-accent/50 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${stepStatusConfig[step.status]?.bg || "bg-muted"}`}
                            />
                            <span className="text-sm font-medium text-foreground">
                              {step.node_label || step.node_type}
                            </span>
                          </div>
                          <span className={`text-xs ${stepStatusConfig[step.status]?.color || "text-muted-foreground"}`}>
                            {step.status}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {step.node_type}
                          {step.duration_ms != null && (
                            <span className="ml-2">{formatDuration(step.duration_ms)}</span>
                          )}
                        </div>
                        {step.condition_result !== null && (
                          <div className="text-xs mt-1">
                            <span className={step.condition_result ? "text-green-400" : "text-amber-400"}>
                              Condition: {step.condition_result ? "true" : "false"}
                            </span>
                          </div>
                        )}
                        {step.selected_branch && (
                          <div className="text-xs text-purple-400 mt-1">
                            Branch: {step.selected_branch}
                          </div>
                        )}
                        {step.error && (
                          <div className="text-xs text-red-400 mt-1">{step.error}</div>
                        )}
                        {step.output_data && Object.keys(step.output_data).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              View output
                            </summary>
                            <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto bg-muted rounded p-2">
                              {JSON.stringify(step.output_data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                    {selectedExecution.steps.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No steps executed yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Executions List
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-400">{error}</div>
            ) : executions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No executions yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {executions.map((execution) => {
                  const config = statusConfig[execution.status];
                  const Icon = config?.icon || Clock;

                  return (
                    <button
                      key={execution.id}
                      onClick={() => loadExecutionDetail(execution.id)}
                      className="w-full px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${config?.color || "text-muted-foreground"}`} />
                          <span className={`text-sm font-medium capitalize ${config?.color || "text-muted-foreground"}`}>
                            {execution.status}
                          </span>
                          {execution.is_dry_run && (
                            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                              Test
                            </span>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(execution.created_at)}
                      </div>
                      {execution.error && (
                        <div className="text-xs text-red-400 mt-1 truncate">
                          {execution.error}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
