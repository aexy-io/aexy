"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Play,
  Pause,
  Settings,
  Trash2,
  Activity,
  Clock,
  TrendingUp,
  Calendar,
  BarChart3,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  MoreVertical,
  Zap,
  X,
  Loader2,
  Wrench,
  MessageSquare,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgent, useAgentExecutions, useAgentMetrics } from "@/hooks/useAgents";
import { CRMAgentExecution, getAgentTypeConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AgentTypeBadge,
  AgentStatusBadge,
  ExecutionStatusBadge,
  ToolBadges,
  LLMConfigDisplay,
  WorkingHoursDisplay,
  ConfidenceIndicator,
} from "@/components/agents/shared";

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// Run Agent Dialog Component
function RunAgentDialog({
  isOpen,
  onClose,
  onRun,
  isRunning,
  agentName,
  tools,
}: {
  isOpen: boolean;
  onClose: () => void;
  onRun: (context: Record<string, unknown>) => void;
  isRunning: boolean;
  agentName: string;
  tools: string[];
}) {
  const [task, setTask] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRun({ task: task || `Execute the ${agentName} agent` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-muted border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Zap className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Run {agentName}</h2>
              <p className="text-sm text-muted-foreground">Provide context for the agent</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Task Input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Task Description
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="e.g., Search for contacts in the tech industry and draft a personalized email..."
              className="w-full px-4 py-3 bg-accent border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-none"
              rows={4}
              autoFocus
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Be specific about what you want the agent to do. The agent will use its available tools to complete the task.
            </p>
          </div>

          {/* Available Tools */}
          {tools.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Wrench className="h-4 w-4" />
                <span>Available Tools</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {tools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-1 bg-accent text-muted-foreground rounded text-xs"
                  >
                    {tool.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRunning}
              className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Run Agent
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ExecutionItemProps {
  execution: CRMAgentExecution;
  isSelected: boolean;
  onClick: () => void;
}

function ExecutionItem({ execution, isSelected, onClick }: ExecutionItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg transition border",
        isSelected
          ? "bg-purple-500/10 border-purple-500/30"
          : "bg-accent/30 border-transparent hover:border-border"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <ExecutionStatusBadge status={execution.status} size="sm" />
        <span className="text-xs text-muted-foreground">
          {formatDate(execution.started_at || execution.created_at)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {execution.steps?.length || 0} steps
        </span>
        <span className="text-muted-foreground">
          {formatDuration(execution.duration_ms)}
        </span>
      </div>
    </button>
  );
}

interface ExecutionDetailProps {
  execution: CRMAgentExecution;
}

function ExecutionDetail({ execution }: ExecutionDetailProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <ExecutionStatusBadge status={execution.status} />
        <span className="text-sm text-muted-foreground">
          {formatDate(execution.started_at || execution.created_at)}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-accent/50 rounded-lg p-3">
          <div className="text-xl font-semibold text-foreground">
            {execution.steps?.length || 0}
          </div>
          <div className="text-xs text-muted-foreground">Steps</div>
        </div>
        <div className="bg-accent/50 rounded-lg p-3">
          <div className="text-xl font-semibold text-foreground">
            {formatDuration(execution.duration_ms)}
          </div>
          <div className="text-xs text-muted-foreground">Duration</div>
        </div>
        <div className="bg-accent/50 rounded-lg p-3">
          <div className="text-xl font-semibold text-foreground">
            {(execution.input_tokens || 0) + (execution.output_tokens || 0)}
          </div>
          <div className="text-xs text-muted-foreground">Tokens</div>
        </div>
      </div>

      {/* Error */}
      {execution.error_message && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-red-400 mb-1">
            <XCircle className="h-4 w-4" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-sm text-red-300">{execution.error_message}</p>
        </div>
      )}

      {/* Steps */}
      {execution.steps && execution.steps.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-3">Execution Steps</h4>
          <div className="space-y-2">
            {execution.steps.map((step, index) => (
              <div
                key={index}
                className="bg-accent/50 rounded-lg p-3 text-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                  <span className="text-foreground font-medium">
                    Step {step.step_number}
                    {step.tool_name && (
                      <span className="ml-2 text-purple-400">{step.tool_name}</span>
                    )}
                  </span>
                  {step.timestamp && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {step.thought && (
                  <p className="text-muted-foreground italic mb-2">"{step.thought}"</p>
                )}
                {step.tool_output && (
                  <pre className="text-xs text-muted-foreground bg-muted rounded p-2 overflow-x-auto">
                    {typeof step.tool_output === "string"
                      ? step.tool_output.slice(0, 500)
                      : JSON.stringify(step.tool_output, null, 2).slice(0, 500)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output */}
      {execution.output_result && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">Output</h4>
          <pre className="text-xs text-muted-foreground bg-accent/50 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(execution.output_result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const {
    agent,
    isLoading: agentLoading,
    toggleAgent,
    deleteAgent,
    executeAgent,
    isToggling,
    isDeleting,
    isExecuting,
  } = useAgent(currentWorkspaceId, agentId);

  const { executions, isLoading: executionsLoading, refetch: refetchExecutions } = useAgentExecutions(
    currentWorkspaceId,
    agentId
  );

  const { metrics, isLoading: metricsLoading } = useAgentMetrics(currentWorkspaceId, agentId);

  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);

  const selectedExecution = executions.find((e) => e.id === selectedExecutionId);

  const handleToggle = async () => {
    try {
      await toggleAgent();
    } catch (error) {
      console.error("Failed to toggle agent:", error);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent? This action cannot be undone.")) {
      return;
    }
    try {
      await deleteAgent();
      router.push("/agents");
    } catch (error) {
      console.error("Failed to delete agent:", error);
    }
  };

  const handleExecute = async (context: Record<string, unknown>) => {
    try {
      const execution = await executeAgent({ context });
      setSelectedExecutionId(execution.id);
      setShowRunDialog(false);
      refetchExecutions();
    } catch (error) {
      console.error("Failed to execute agent:", error);
    }
  };

  const isLoading = currentWorkspaceLoading || agentLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-foreground">Loading agent...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-medium text-foreground mb-2">Agent Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The agent you're looking for doesn't exist or has been deleted.
          </p>
          <Link
            href="/agents"
            className="text-purple-400 hover:text-purple-300"
          >
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  const successRate =
    agent.total_executions > 0
      ? Math.round((agent.successful_executions / agent.total_executions) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 space-y-3 sm:space-y-0">
          {/* Desktop: single row / Mobile: two rows */}
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/agents"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div
                className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${getAgentTypeConfig(agent.agent_type).color}20`,
                }}
              >
                <Bot
                  className="h-5 w-5 sm:h-6 sm:w-6"
                  style={{
                    color: getAgentTypeConfig(agent.agent_type).color,
                  }}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <h1 className="text-base sm:text-xl font-semibold text-foreground truncate">{agent.name}</h1>
                  <AgentStatusBadge isActive={agent.is_active} size="sm" />
                </div>
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <AgentTypeBadge type={agent.agent_type} size="sm" showLabel={false} />
                  <span>{getAgentTypeConfig(agent.agent_type).label}</span>
                  {agent.mention_handle && (
                    <>
                      <span>-</span>
                      <span>@{agent.mention_handle}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Actions - desktop only (inline) */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/agents/${agent.id}/chat`}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm font-medium"
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </Link>
              <button
                onClick={() => setShowRunDialog(true)}
                disabled={isExecuting || !agent.is_active}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-foreground rounded-lg transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Run
                  </>
                )}
              </button>
              <button
                onClick={handleToggle}
                disabled={isToggling}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition text-sm font-medium",
                  agent.is_active
                    ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                    : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                )}
              >
                {isToggling ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : agent.is_active ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {agent.is_active ? "Pause" : "Activate"}
              </button>
              <Link
                href={`/agents/${agent.id}/edit`}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg transition text-sm font-medium"
              >
                <Settings className="h-4 w-4" />
                Edit
              </Link>
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-accent rounded-lg shadow-xl z-20 py-1">
                      <button
                        onClick={() => {
                          handleDelete();
                          setShowMenu(false);
                        }}
                        disabled={isDeleting}
                        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-muted flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Agent
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions - mobile only (second row) */}
          <div className="flex sm:hidden items-center gap-1">
            <Link
              href={`/agents/${agent.id}/chat`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-xs font-medium"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </Link>
            <button
              onClick={() => setShowRunDialog(true)}
              disabled={isExecuting || !agent.is_active}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-foreground rounded-lg transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Run
            </button>
            <button
              onClick={handleToggle}
              disabled={isToggling}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-xs font-medium",
                agent.is_active
                  ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                  : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
              )}
            >
              {isToggling ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : agent.is_active ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {agent.is_active ? "Pause" : "Activate"}
            </button>
            <Link
              href={`/agents/${agent.id}/edit`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg transition text-xs font-medium"
            >
              <Settings className="h-3.5 w-3.5" />
              Edit
            </Link>
            <div className="relative ml-auto">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-accent rounded-lg shadow-xl z-20 py-1">
                    <button
                      onClick={() => {
                        handleDelete();
                        setShowMenu(false);
                      }}
                      disabled={isDeleting}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-muted flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Agent
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Run Agent Dialog */}
      <RunAgentDialog
        isOpen={showRunDialog}
        onClose={() => setShowRunDialog(false)}
        onRun={handleExecute}
        isRunning={isExecuting}
        agentName={agent.name}
        tools={agent.tools}
      />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-12 gap-6">
          {/* Left: Stats & Config */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            {/* Stats */}
            <div className="bg-muted rounded-xl border border-border p-4 space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Statistics
              </h3>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    <span className="text-sm">Total Runs</span>
                  </div>
                  <span className="text-foreground font-medium">
                    {agent.total_executions}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm">Success Rate</span>
                  </div>
                  <span
                    className={cn(
                      "font-medium",
                      successRate >= 90
                        ? "text-green-400"
                        : successRate >= 70
                        ? "text-amber-400"
                        : "text-red-400"
                    )}
                  >
                    {successRate}%
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">Avg Duration</span>
                  </div>
                  <span className="text-foreground font-medium">
                    {formatDuration(agent.avg_duration_ms || 0)}
                  </span>
                </div>
                {agent.avg_confidence && (
                  <div>
                    <ConfidenceIndicator value={agent.avg_confidence} size="sm" />
                  </div>
                )}
              </div>
            </div>

            {/* Configuration Summary */}
            <div className="bg-muted rounded-xl border border-border p-4 space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Configuration
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">LLM</span>
                  <div className="mt-1">
                    <LLMConfigDisplay
                      provider={agent.llm_provider || "gemini"}
                      model={agent.llm_model || agent.model}
                    />
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Temperature</span>
                  <div className="mt-1 text-foreground">{agent.temperature}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Working Hours</span>
                  <div className="mt-1">
                    <WorkingHoursDisplay config={agent.working_hours} />
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Tools</span>
                  <div className="mt-2">
                    <ToolBadges tools={agent.tools} max={5} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Center: Executions List */}
          <div className="col-span-12 lg:col-span-4">
            <div className="bg-muted rounded-xl border border-border h-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-border">
                <h3 className="font-medium text-foreground">Execution History</h3>
                <button
                  onClick={() => refetchExecutions()}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
                {executionsLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Loading executions...</p>
                  </div>
                ) : executions.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">No executions yet</p>
                  </div>
                ) : (
                  executions.map((execution) => (
                    <ExecutionItem
                      key={execution.id}
                      execution={execution}
                      isSelected={execution.id === selectedExecutionId}
                      onClick={() => setSelectedExecutionId(execution.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: Execution Detail */}
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-muted rounded-xl border border-border h-full">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-medium text-foreground">Execution Details</h3>
              </div>
              <div className="p-4">
                {selectedExecution ? (
                  <ExecutionDetail execution={selectedExecution} />
                ) : (
                  <div className="text-center py-12">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      Select an execution to view details
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
