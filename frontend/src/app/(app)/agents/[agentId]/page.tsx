"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
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
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// UX-AGT-DTL-008: per-agent-type quick-start prompts. Replaces the
// blank-textarea cold-start with three concrete starting points the user
// can either fire as-is or edit. Keyed by agent_type so each agent gets
// scaffolding that matches what it can actually do. Custom / unknown
// types fall through to the freeform-only flow.
const RUN_QUICK_STARTS: Record<string, string[]> = {
  support: [
    "Triage the latest inbox messages by urgency and surface the top 3.",
    "Draft replies for any unread customer messages from the past 24 hours.",
    "Summarize open issues across the inbox grouped by topic.",
  ],
  sales: [
    "Identify high-intent leads in the inbox and draft warm follow-ups.",
    "Send a check-in to contacts I haven't reached in 14 days.",
    "Score the latest inbound leads and tee up the top 5 for outreach.",
  ],
  scheduling: [
    "Propose times for any pending meeting requests in the inbox.",
    "Confirm tomorrow's meetings and re-send calendar holds where needed.",
    "Find the next 30-minute slot across all attendees in the latest thread.",
  ],
  onboarding: [
    "Send the next onboarding step to users who've completed step 1.",
    "Create tasks for any new signups from the last 24 hours.",
    "Summarize where each onboarding user is in the funnel.",
  ],
  recruiting: [
    "Draft outreach to the latest applicants matched to open roles.",
    "Schedule screening calls with candidates who responded yes.",
    "Summarize candidate pipeline by role and stage.",
  ],
  newsletter: [
    "Draft this week's newsletter from recent shipped activity.",
    "Audit the subscriber list and surface any anomalies.",
    "Summarize last week's open + click rates.",
  ],
  triage: [
    "Classify the open tickets by priority and department.",
    "Re-route any misassigned tickets from the past 24h.",
    "Flag tickets that have been waiting > 48h for response.",
  ],
  insights: [
    "Surface the top 3 team metrics that changed this week.",
    "Identify any burnout-risk signals in the team's activity.",
    "Compare velocity this sprint vs last and explain the delta.",
  ],
  standup: [
    "Draft today's standup summary for the team.",
    "List everyone's blockers from the past 24 hours.",
    "Remind anyone who hasn't posted yet.",
  ],
};

function getRunQuickStarts(agentType: string): string[] {
  return RUN_QUICK_STARTS[agentType] ?? [];
}

// Run Agent Dialog Component
function RunAgentDialog({
  isOpen,
  onClose,
  onRun,
  isRunning,
  agentName,
  agentType,
  tools,
}: {
  isOpen: boolean;
  onClose: () => void;
  onRun: (context: Record<string, unknown>) => void;
  isRunning: boolean;
  agentName: string;
  agentType: string;
  tools: string[];
}) {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const [task, setTask] = useState("");

  // Reset the task field when the dialog closes so the next open starts
  // clean. Without this, a successful run leaves the prior task pre-filled.
  useEffect(() => {
    if (!isOpen) setTask("");
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRun({ task: task || `Execute the ${agentName} agent` });
  };

  return (
    <Dialog open={isOpen} onOpenChange={isRunning ? undefined : (open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full p-2 shrink-0 bg-purple-500/15">
              <Zap className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>
                {t("runDialog.title", { agentName })}
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                {t("runDialog.provideContext")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="run-agent-task"
              className="block text-sm font-medium text-foreground mb-2"
            >
              {t("runDialog.taskDescription")}
            </label>
            {/* UX-AGT-DTL-008: quick-start chips above the textarea.
                Clicking one drops it into the task field; the user can
                edit before running. Empty for agent types without
                presets (custom / unknown) — falls back to freeform. */}
            {getRunQuickStarts(agentType).length > 0 && !task ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {getRunQuickStarts(agentType).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTask(preset)}
                    className="text-left text-xs px-2.5 py-1.5 rounded-full border border-border bg-accent/50 text-muted-foreground hover:text-foreground hover:border-purple-500/40 hover:bg-purple-500/5 transition-colors focus-visible:ring-2 focus-visible:ring-purple-500/40"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            ) : null}
            <textarea
              id="run-agent-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder={t("runDialog.taskPlaceholder")}
              className="w-full px-4 py-3 bg-accent border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 focus:border-purple-500 resize-none"
              rows={4}
              autoFocus
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("runDialog.taskHelp")}
            </p>
          </div>

          {tools.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Wrench className="h-4 w-4" />
                <span>{t("tools.availableTools")}</span>
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

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isRunning}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={isRunning}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("status.running")}
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  {t("actions.runAgent")}
                </>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-1">
            <XCircle className="h-4 w-4" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300">{execution.error_message}</p>
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
                      <span className="ml-2 text-purple-700 dark:text-purple-300">{step.tool_name}</span>
                    )}
                  </span>
                  {step.timestamp && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {step.thought && (
                  <p className="text-muted-foreground italic mb-2">&quot;{step.thought}&quot;</p>
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
  const t = useTranslations("agents");
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    agent,
    isLoading: agentLoading,
    error: agentError,
    refetch: refetchAgent,
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

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
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
      <div className="p-6 max-w-6xl mx-auto animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 bg-accent rounded-lg" />
          <div className="h-6 w-48 bg-accent rounded" />
          <div className="h-5 w-16 bg-accent rounded-full ml-2" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="h-4 w-24 bg-accent rounded" />
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-accent rounded-lg" />
                ))}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="h-4 w-32 bg-accent rounded" />
              <div className="h-48 bg-accent rounded-lg" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="h-4 w-28 bg-accent rounded" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-3 w-20 bg-accent rounded" />
                  <div className="h-3 w-16 bg-accent rounded" />
                </div>
              ))}
            </div>
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="h-4 w-24 bg-accent rounded" />
              <div className="flex gap-2">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-6 w-16 bg-accent rounded" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!agent) {
    // UX-LE-002: distinguish 404 / 403 / network. axios surfaces the
    // HTTP status as `error.response?.status`; absence of `response`
    // means the request never reached the server (CORS / offline /
    // dropped). Each case gets its own copy + appropriate next-action
    // so a workspace-switched user (403) isn't told their agent was
    // deleted (404). Anchor the lift on agentError shape.
    const status =
      (agentError as { response?: { status?: number } } | null | undefined)
        ?.response?.status;
    const variant: "notFound" | "forbidden" | "network" =
      status === 404 ? "notFound" : status === 403 ? "forbidden" : agentError ? "network" : "notFound";
    const copy: Record<typeof variant, { title: string; body: React.ReactNode }> = {
      notFound: {
        title: "Agent Not Found",
        body: (
          <>The agent you&apos;re looking for doesn&apos;t exist or has been deleted.</>
        ),
      },
      forbidden: {
        title: "You don't have access to this agent",
        body: (
          <>
            This agent belongs to a workspace you can&apos;t see. If you
            switched workspaces in another tab, head back to the agents
            list to find what you&apos;re working in now.
          </>
        ),
      },
      network: {
        title: "Couldn't load this agent",
        body: (
          <>
            The request failed before it reached the server — check your
            connection and try again.
          </>
        ),
      },
    };
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" aria-hidden />
          <h2 className="text-xl font-medium text-foreground mb-2">{copy[variant].title}</h2>
          <p className="text-muted-foreground mb-4">{copy[variant].body}</p>
          <div className="flex items-center justify-center gap-2">
            {variant === "network" ? (
              <button
                type="button"
                onClick={() => refetchAgent()}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                Retry
              </button>
            ) : null}
            <Breadcrumb
              items={[{ label: "Agents", href: "/agents" }]}
              className="justify-center"
            />
          </div>
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
          <Breadcrumb
            items={[
              { label: "Agents", href: "/agents" },
              { label: agent.name },
            ]}
            className="mb-3"
          />
          {/* Desktop: single row / Mobile: two rows */}
          <div className="flex items-center gap-2 sm:gap-4">
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

            {/* Actions - desktop only (inline). One decisive primary + a
                status toggle + an overflow. Run / Edit / Delete live under
                the overflow so the header doesn't read like five primaries
                fighting for the same eye. */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              {/* Primary: Chat is the agent's default interaction — always
                  available regardless of active state. */}
              <Link
                href={`/agents/${agent.id}/chat`}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm font-medium shadow-sm"
              >
                <MessageSquare className="h-4 w-4" />
                {t("actions.chat")}
              </Link>

              {/* Status toggle: semantic colors with explicit light/dark
                  contrast (the prior bg-green-600 + text-foreground combo
                  failed in light mode). */}
              <button
                onClick={handleToggle}
                disabled={isToggling}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg transition text-sm font-medium border",
                  agent.is_active
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
                )}
              >
                {isToggling ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : agent.is_active ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {agent.is_active ? t("actions.pause") : t("actions.activate")}
              </button>

              {/* Overflow: Run + Edit + Delete. Run is gated by `is_active`
                  per the underlying mutation; we show a tooltip there
                  instead of disabling a top-level button silently. */}
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-lg shadow-xl z-20 py-1">
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          setShowRunDialog(true);
                        }}
                        disabled={isExecuting || !agent.is_active}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!agent.is_active ? t("status.inactive") : undefined}
                      >
                        {isExecuting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        {isExecuting ? t("status.running") : t("actions.run")}
                      </button>
                      <Link
                        href={`/agents/${agent.id}/edit`}
                        onClick={() => setShowMenu(false)}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        {t("actions.editAgent")}
                      </Link>
                      <div className="h-px bg-border my-1" />
                      <button
                        onClick={() => {
                          handleDelete();
                          setShowMenu(false);
                        }}
                        disabled={isDeleting}
                        className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("actions.deleteAgent")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Live status strip — last execution at a glance, with a pulse
              dot when a run is currently active. Avoids the "ops dashboard
              is a 3-card report" feel called out in the audit. */}
          {(() => {
            const lastExec = executions?.[0] ?? null;
            const isRunning =
              lastExec?.status === "running" || lastExec?.status === "pending";
            const statusToneClass: Record<string, string> = {
              running: "text-blue-600 dark:text-blue-400",
              pending: "text-blue-600 dark:text-blue-400",
              completed: "text-emerald-600 dark:text-emerald-400",
              failed: "text-red-600 dark:text-red-400",
              cancelled: "text-muted-foreground",
            };
            const haloColor = getAgentTypeConfig(agent.agent_type).color;
            return (
              <div
                // UX-A11Y-008: live region so screen readers announce
                // execution status transitions (running -> completed /
                // failed). aria-atomic so the whole strip is re-spoken
                // each tick rather than just the diff — the strip is
                // short and the context matters. role="status" is
                // implicit-polite, but we set both to be explicit.
                role="status"
                aria-live="polite"
                aria-atomic="true"
                aria-label="Agent execution status"
                className="hidden sm:flex items-center gap-3 mt-3 px-3 py-2 rounded-lg border border-border bg-background/40"
                style={{
                  boxShadow: isRunning
                    ? `inset 0 0 0 1px ${haloColor}40`
                    : undefined,
                }}
              >
                <span className="relative inline-flex items-center justify-center">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      lastExec
                        ? statusToneClass[lastExec.status] ?? "text-muted-foreground"
                        : "text-muted-foreground",
                    )}
                    style={{
                      backgroundColor: lastExec
                        ? "currentColor"
                        : "var(--muted-foreground)",
                    }}
                  />
                  {isRunning ? (
                    // motion-safe: gate the always-on ping so users with
                    // prefers-reduced-motion don't get a heartbeat per
                    // active execution. UX-A11Y-005.
                    <span
                      className="absolute h-2 w-2 rounded-full motion-safe:animate-ping opacity-75"
                      style={{ backgroundColor: haloColor }}
                    />
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {lastExec
                    ? isRunning
                      ? `Running since ${formatDate(lastExec.started_at)}`
                      : `Last run ${formatDate(lastExec.completed_at ?? lastExec.started_at)} - ${lastExec.status}`
                    : t("detail.noExecutionsYet")}
                </span>
                <span className="text-xs text-muted-foreground/60">-</span>
                <span className="text-xs text-muted-foreground">
                  {agent.total_executions} {t("stats.totalRuns").toLowerCase()}
                </span>
                <span className="text-xs text-muted-foreground/60">-</span>
                <span className="text-xs text-muted-foreground">
                  {successRate}% {t("stats.successRate").toLowerCase()}
                </span>
                {executionsLoading ? (
                  <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin ml-auto" />
                ) : null}
              </div>
            );
          })()}

          {/* Actions - mobile only (second row). Mirrors the desktop
              vocabulary: one primary (Chat), the status toggle, and an
              overflow that holds Run / Edit / Delete. */}
          <div className="flex sm:hidden items-center gap-1">
            <Link
              href={`/agents/${agent.id}/chat`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-xs font-medium"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t("actions.chat")}
            </Link>
            <button
              onClick={handleToggle}
              disabled={isToggling}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-xs font-medium border",
                agent.is_active
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {isToggling ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : agent.is_active ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {agent.is_active ? t("actions.pause") : t("actions.activate")}
            </button>
            <div className="relative ml-auto">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                aria-label="More actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-lg shadow-xl z-20 py-1">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowRunDialog(true);
                      }}
                      disabled={isExecuting || !agent.is_active}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isExecuting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      {isExecuting ? t("status.running") : t("actions.run")}
                    </button>
                    <Link
                      href={`/agents/${agent.id}/edit`}
                      onClick={() => setShowMenu(false)}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      {t("actions.editAgent")}
                    </Link>
                    <div className="h-px bg-border my-1" />
                    <button
                      onClick={() => {
                        handleDelete();
                        setShowMenu(false);
                      }}
                      disabled={isDeleting}
                      className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("actions.deleteAgent")}
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
        agentType={agent.agent_type}
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
                        ? "text-emerald-700 dark:text-emerald-400"
                        : successRate >= 70
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-red-700 dark:text-red-400"
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
                  aria-label="Refresh execution history"
                  title="Refresh"
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              {/* 600px = ~10 execution rows at typical row height.
                  Past that the panel scrolls; the user opens the full
                  Executions sheet from the toolbar for deeper paging. */}
              <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
                {executionsLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Loading executions...</p>
                  </div>
                ) : executions.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm mb-4">
                      No executions yet
                    </p>
                    {/* UX-AGT-DTL-010: surface a primary action here so
                        users coming straight to the detail page have
                        an obvious next step instead of having to
                        discover the Run option in the overflow menu. */}
                    {!agent.is_system && agent.is_active ? (
                      <button
                        type="button"
                        onClick={() => setShowRunDialog(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium"
                      >
                        <Zap className="h-4 w-4" />
                        Run agent now
                      </button>
                    ) : !agent.is_active ? (
                      <p className="text-xs text-muted-foreground">
                        Activate the agent to start running it.
                      </p>
                    ) : null}
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

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("confirmations.deleteAgentTitle")}
        description={t("confirmations.deleteAgentDescription")}
        confirmLabel={t("actions.deleteAgent")}
        onConfirm={confirmDelete}
        tone="danger"
      />
    </div>
  );
}
