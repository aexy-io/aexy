"use client";

import { useState } from "react";
import {
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EXECUTION_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";
import {
  AutomationAgentExecutionListItem,
  AutomationAgentExecution,
} from "@/lib/api";
import {
  useAutomationAgentExecutions,
  useAutomationAgentExecution,
} from "@/hooks/useAutomationAgents";

interface AgentExecutionLogProps {
  workspaceId: string;
  automationId: string;
  className?: string;
}

const STATUS_ICONS: Record<string, { icon: typeof Clock; label: string; animate?: boolean }> = {
  pending: { icon: Clock, label: "Pending" },
  running: { icon: Loader2, label: "Running", animate: true },
  completed: { icon: CheckCircle2, label: "Completed" },
  failed: { icon: XCircle, label: "Failed" },
  timeout: { icon: AlertTriangle, label: "Timeout" },
};

export function AgentExecutionLog({
  workspaceId,
  automationId,
  className,
}: AgentExecutionLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { executions, isLoading, refetch } = useAutomationAgentExecutions(
    workspaceId,
    automationId,
    { limit: 20 }
  );

  if (isLoading) {
    return (
      <div className={cn("p-4", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading agent executions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Agent Execution History</h3>
          <p className="text-xs text-muted-foreground">
            Recent AI agent executions triggered by this automation
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Execution List */}
      {executions.length > 0 ? (
        <div className="space-y-2">
          {executions.map((execution) => (
            <ExecutionItem
              key={execution.id}
              workspaceId={workspaceId}
              automationId={automationId}
              execution={execution}
              isExpanded={expandedId === execution.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === execution.id ? null : execution.id)
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No agent executions yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Agent executions will appear here when the automation runs
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface ExecutionItemProps {
  workspaceId: string;
  automationId: string;
  execution: AutomationAgentExecutionListItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function ExecutionItem({
  workspaceId,
  automationId,
  execution,
  isExpanded,
  onToggleExpand,
}: ExecutionItemProps) {
  const iconConfig = STATUS_ICONS[execution.status as keyof typeof STATUS_ICONS] || STATUS_ICONS.pending;
  const StatusIcon = iconConfig.icon;
  const execColor = getStatusColor(EXECUTION_STATUS_COLORS, execution.status);

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
      >
        <div className={cn("rounded-full p-1.5", execColor.bg)}>
          <StatusIcon
            className={cn(
              "h-4 w-4",
              execColor.text,
              iconConfig.animate && "animate-spin"
            )}
          />
        </div>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium truncate">{execution.agent_name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {execution.trigger_point}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{formatDate(execution.created_at)}</span>
            {execution.duration_ms !== null && (
              <span>{formatDuration(execution.duration_ms)}</span>
            )}
            <span className={cn("font-medium", execColor.text)}>
              {iconConfig.label}
            </span>
          </div>
        </div>

        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <ExecutionDetails
          workspaceId={workspaceId}
          automationId={automationId}
          executionId={execution.id}
        />
      )}
    </div>
  );
}

interface ExecutionDetailsProps {
  workspaceId: string;
  automationId: string;
  executionId: string;
}

function ExecutionDetails({
  workspaceId,
  automationId,
  executionId,
}: ExecutionDetailsProps) {
  const { execution, isLoading } = useAutomationAgentExecution(
    workspaceId,
    automationId,
    executionId
  );

  if (isLoading) {
    return (
      <div className="border-t px-3 py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading details...
        </div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="border-t px-3 py-4">
        <p className="text-sm text-muted-foreground">Failed to load details</p>
      </div>
    );
  }

  return (
    <div className="border-t px-3 py-3 space-y-3 text-sm">
      {/* Error Message */}
      {execution.error_message && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">
              <p className="font-medium">Error</p>
              <p className="text-xs mt-1">{execution.error_message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Timing */}
      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        <div>
          <span className="text-muted-foreground">Started:</span>{" "}
          <span className="font-medium">
            {execution.started_at ? formatDate(execution.started_at) : "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Completed:</span>{" "}
          <span className="font-medium">
            {execution.completed_at ? formatDate(execution.completed_at) : "—"}
          </span>
        </div>
        {execution.duration_ms !== null && (
          <div>
            <span className="text-muted-foreground">Duration:</span>{" "}
            <span className="font-medium">{formatDuration(execution.duration_ms)}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Trigger Point:</span>{" "}
          <span className="font-medium">{execution.trigger_point}</span>
        </div>
      </div>

      {/* Input Context */}
      {execution.input_context && Object.keys(execution.input_context).length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Input Context</p>
          <pre className="text-xs bg-muted rounded-md p-2 overflow-auto max-h-32">
            {JSON.stringify(execution.input_context, null, 2)}
          </pre>
        </div>
      )}

      {/* Output Result */}
      {execution.output_result && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Output Result</p>
          <pre className="text-xs bg-muted rounded-md p-2 overflow-auto max-h-32">
            {JSON.stringify(execution.output_result, null, 2)}
          </pre>
        </div>
      )}

      {/* Link to Agent Execution */}
      {execution.agent_execution_id && (
        <div className="pt-2 border-t">
          <a
            href={`/agents/${execution.agent_id}/executions/${execution.agent_execution_id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View full agent execution trace
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
