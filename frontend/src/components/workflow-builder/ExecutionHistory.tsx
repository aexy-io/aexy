"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  Play,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { EXECUTION_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ExecutionStep {
  type: string;
  order: number;
  status: string;
  result?: Record<string, unknown>;
  error: string | null;
  executed_at: string;
}

interface Execution {
  id: string;
  automation_id: string;
  record_id: string | null;
  trigger_data: Record<string, unknown>;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
  steps_executed: ExecutionStep[];
}

type ExecutionDetail = Execution;

interface ExecutionHistoryProps {
  workspaceId: string;
  automationId: string;
  isOpen: boolean;
  onClose: () => void;
}

const statusIcons: Record<string, typeof CheckCircle> = {
  completed: CheckCircle,
  failed: XCircle,
  running: Play,
  queued: Clock,
  paused: Pause,
  pending: Clock,
  cancelled: AlertCircle,
};

const stepStatusConfig: Record<string, { color: string; bg: string }> = {
  success: { color: "text-green-600 dark:text-green-400", bg: "bg-green-500" },
  failed: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500" },
  running: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500" },
  waiting: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500" },
  queued: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500" },
  sent: { color: "text-green-600 dark:text-green-400", bg: "bg-green-500" },
  skipped: { color: "text-muted-foreground", bg: "bg-muted" },
  pending: { color: "text-muted-foreground", bg: "bg-muted" },
};

const automationRunStatusColors = {
  ...EXECUTION_STATUS_COLORS,
  queued: { bg: "bg-blue-500/20", text: "text-blue-400", dot: "bg-blue-500" },
};

export function ExecutionHistory({
  workspaceId,
  automationId,
  isOpen,
  onClose,
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
        `/workspaces/${workspaceId}/crm/automations/${automationId}/runs`
      );
      setExecutions(response.data);
    } catch (err) {
      setError("Failed to load CRM automation history");
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
          `/workspaces/${workspaceId}/crm/automation-runs/${executionId}`
        );
        setSelectedExecution(response.data);
      } catch (err) {
        console.error("Failed to load execution detail:", err);
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [workspaceId, automationId]
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="p-0 flex flex-col">
        <SheetHeader className="flex-row items-center justify-between px-4 py-3 space-y-0">
          <SheetTitle>CRM Automation History</SheetTitle>
          <button
            onClick={loadExecutions}
            aria-label="Refresh execution history"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors mr-8"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </SheetHeader>

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
              <div className="px-4 py-4 space-y-4 animate-pulse">
                <div className="rounded-lg p-3 bg-accent">
                  <div className="h-4 w-32 bg-muted rounded mb-2" />
                  <div className="h-3 w-48 bg-muted rounded" />
                </div>
                {[1, 2].map((i) => (
                  <div key={i} className="border border-border rounded-lg p-3">
                    <div className="h-4 w-24 bg-accent rounded mb-2" />
                    <div className="h-3 w-full bg-accent rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-2">
                {/* Execution Status Header */}
                <div className={`rounded-lg p-3 mb-4 ${getStatusColor(automationRunStatusColors, selectedExecution.status).bg}`}>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const Icon = statusIcons[selectedExecution.status] || Clock;
                      return <Icon className={`h-5 w-5 ${getStatusColor(automationRunStatusColors, selectedExecution.status).text}`} />;
                    })()}
                    <span className={`font-medium capitalize ${getStatusColor(automationRunStatusColors, selectedExecution.status).text}`}>
                      {selectedExecution.status}
                    </span>
                  </div>
                  {selectedExecution.error_message && (
                    <p className="text-sm text-red-400 mt-2">{selectedExecution.error_message}</p>
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

                {/* Steps */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    Steps ({selectedExecution.steps_executed.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedExecution.steps_executed.map((step) => (
                      <div
                        key={`${step.order}-${step.type}`}
                        className="bg-accent/50 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${stepStatusConfig[step.status]?.bg || "bg-muted"}`}
                            />
                            <span className="text-sm font-medium text-foreground">
                              {step.type.replaceAll("_", " ")}
                            </span>
                          </div>
                          <span className={`text-xs ${stepStatusConfig[step.status]?.color || "text-muted-foreground"}`}>
                            {step.status}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {step.executed_at && formatDate(step.executed_at)}
                        </div>
                        {step.error && (
                          <div className="text-xs text-red-400 mt-1">{step.error}</div>
                        )}
                        {step.result && Object.keys(step.result).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              View result
                            </summary>
                            <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto bg-muted rounded p-2">
                              {JSON.stringify(step.result, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                    {selectedExecution.steps_executed.length === 0 && (
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
              <div className="space-y-2 p-2 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
                    <div className="h-6 w-6 bg-accent rounded-full" />
                    <div className="flex-1">
                      <div className="h-3 w-24 bg-accent rounded mb-1" />
                      <div className="h-2 w-16 bg-accent rounded" />
                    </div>
                    <div className="h-5 w-14 bg-accent rounded-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-400">{error}</div>
            ) : executions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No CRM automation runs yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {executions.map((execution) => {
                  const Icon = statusIcons[execution.status] || Clock;
                  const execColor = getStatusColor(automationRunStatusColors, execution.status);

                  return (
                    <button
                      key={execution.id}
                      onClick={() => loadExecutionDetail(execution.id)}
                      className="w-full px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${execColor.text}`} />
                          <span className={`text-sm font-medium capitalize ${execColor.text}`}>
                            {execution.status}
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(execution.created_at)}
                      </div>
                      {execution.error_message && (
                        <div className="text-xs text-red-400 mt-1 truncate">
                          {execution.error_message}
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
      </SheetContent>
    </Sheet>
  );
}
