"use client";

import { useState } from "react";
import {
  Bot,
  Plus,
  Trash2,
  Settings2,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpTooltip } from "@/components/ui/tooltip";
import {
  AutomationAgentTriggerListItem,
  AutomationAgentTriggerCreate,
  AutomationAgentTriggerUpdate,
  CRMAgent,
} from "@/lib/api";
import {
  useAutomationAgentTriggers,
} from "@/hooks/useAutomationAgents";
import { useAgents } from "@/hooks/useAgents";

interface AgentTriggerConfigProps {
  workspaceId: string;
  automationId: string;
  className?: string;
}

const TRIGGER_POINTS = [
  {
    value: "on_start",
    label: "On Start",
    description: "Run agent when automation starts",
    tooltip: "Agent runs immediately when the automation workflow begins",
  },
  {
    value: "on_condition_match",
    label: "On Condition Match",
    description: "Run agent when conditions are met",
    tooltip: "Agent runs only when specified conditions evaluate to true",
  },
  {
    value: "as_action",
    label: "As Action",
    description: "Run agent as an action step",
    tooltip: "Agent is invoked as an explicit step in the workflow",
  },
] as const;

export function AgentTriggerConfig({
  workspaceId,
  automationId,
  className,
}: AgentTriggerConfigProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [expandedTriggerId, setExpandedTriggerId] = useState<string | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<AutomationAgentTriggerListItem | null>(null);

  const {
    triggers,
    isLoading,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    isCreating,
    isUpdating,
    isDeleting,
  } = useAutomationAgentTriggers(workspaceId, automationId);

  const { agents } = useAgents(workspaceId, { isActive: true });

  const handleAddTrigger = async (data: AutomationAgentTriggerCreate) => {
    try {
      await createTrigger(data);
      setIsAdding(false);
    } catch (error) {
      console.error("Failed to create trigger:", error);
    }
  };

  const handleUpdateTrigger = async (triggerId: string, data: AutomationAgentTriggerUpdate) => {
    try {
      await updateTrigger({ triggerId, data });
      setEditingTrigger(null);
    } catch (error) {
      console.error("Failed to update trigger:", error);
    }
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    if (!confirm("Are you sure you want to remove this agent trigger?")) return;
    try {
      await deleteTrigger(triggerId);
    } catch (error) {
      console.error("Failed to delete trigger:", error);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("p-4", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading agent triggers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Agent Triggers</h3>
          <p className="text-xs text-muted-foreground">
            Configure AI agents to run at specific points in this automation
          </p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add Agent
        </button>
      </div>

      {/* Add Trigger Form */}
      {isAdding && (
        <AddTriggerForm
          agents={agents}
          existingTriggerPoints={triggers.map(t => t.trigger_point)}
          onSubmit={handleAddTrigger}
          onCancel={() => setIsAdding(false)}
          isSubmitting={isCreating}
        />
      )}

      {/* Trigger List */}
      {triggers.length > 0 ? (
        <div className="space-y-2">
          {triggers.map((trigger) => (
            <TriggerItem
              key={trigger.id}
              trigger={trigger}
              isExpanded={expandedTriggerId === trigger.id}
              onToggleExpand={() =>
                setExpandedTriggerId(expandedTriggerId === trigger.id ? null : trigger.id)
              }
              onEdit={() => setEditingTrigger(trigger)}
              onDelete={() => handleDeleteTrigger(trigger.id)}
              onToggleActive={(isActive) =>
                handleUpdateTrigger(trigger.id, { is_active: isActive })
              }
              isUpdating={isUpdating}
              isDeleting={isDeleting}
            />
          ))}
        </div>
      ) : !isAdding && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No agent triggers configured yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add an agent to run when this automation triggers
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface AddTriggerFormProps {
  agents: CRMAgent[];
  existingTriggerPoints: string[];
  onSubmit: (data: AutomationAgentTriggerCreate) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function AddTriggerForm({
  agents,
  existingTriggerPoints,
  onSubmit,
  onCancel,
  isSubmitting,
}: AddTriggerFormProps) {
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedTriggerPoint, setSelectedTriggerPoint] = useState<string>("as_action");
  const [waitForCompletion, setWaitForCompletion] = useState(true);
  const [timeoutSeconds, setTimeoutSeconds] = useState(300);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId || !selectedTriggerPoint) return;

    onSubmit({
      agent_id: selectedAgentId,
      trigger_point: selectedTriggerPoint as "on_start" | "on_condition_match" | "as_action",
      wait_for_completion: waitForCompletion,
      timeout_seconds: timeoutSeconds,
    });
  };

  const availableTriggerPoints = TRIGGER_POINTS.filter(
    tp => !existingTriggerPoints.includes(tp.value) || tp.value === selectedTriggerPoint
  );

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Agent Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Agent</label>
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            required
          >
            <option value="">Select an agent...</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.agent_type})
              </option>
            ))}
          </select>
        </div>

        {/* Trigger Point */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium">Trigger Point</label>
            <HelpTooltip content={TRIGGER_POINTS.find(tp => tp.value === selectedTriggerPoint)?.tooltip || "When the agent should run in the workflow"} />
          </div>
          <select
            value={selectedTriggerPoint}
            onChange={(e) => setSelectedTriggerPoint(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            required
          >
            {availableTriggerPoints.map((tp) => (
              <option key={tp.value} value={tp.value}>
                {tp.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {TRIGGER_POINTS.find(tp => tp.value === selectedTriggerPoint)?.description}
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={waitForCompletion}
            onChange={(e) => setWaitForCompletion(e.target.checked)}
            className="rounded"
          />
          Wait for completion
          <HelpTooltip content="Blocks the workflow until the agent finishes responding. Use timeout to prevent indefinite hanging" />
        </label>

        {waitForCompletion && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <input
              type="number"
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(parseInt(e.target.value) || 300)}
              min={30}
              max={3600}
              className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <span className="text-sm text-muted-foreground">seconds timeout</span>
            <HelpTooltip content="Maximum seconds to wait for agent response before the workflow continues without it" />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-3 py-1.5 text-sm font-medium rounded-md hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !selectedAgentId}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Add Trigger
        </button>
      </div>
    </form>
  );
}

interface TriggerItemProps {
  trigger: AutomationAgentTriggerListItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (isActive: boolean) => void;
  isUpdating: boolean;
  isDeleting: boolean;
}

function TriggerItem({
  trigger,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleActive,
  isUpdating,
  isDeleting,
}: TriggerItemProps) {
  const triggerPointInfo = TRIGGER_POINTS.find(tp => tp.value === trigger.trigger_point);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-colors",
        !trigger.is_active && "opacity-60"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <div className="flex-shrink-0 rounded-lg bg-primary/10 p-2">
          <Bot className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{trigger.agent_name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {trigger.agent_type}
            </span>
            {!trigger.agent_is_active && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                Agent inactive
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {triggerPointInfo?.label || trigger.trigger_point}
            {trigger.wait_for_completion && (
              <span className="ml-2 text-xs">
                (wait up to {trigger.timeout_seconds}s)
              </span>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleActive(!trigger.is_active)}
            disabled={isUpdating}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              trigger.is_active ? "text-green-600 hover:bg-green-50" : "text-muted-foreground hover:bg-muted"
            )}
            title={trigger.is_active ? "Disable" : "Enable"}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : trigger.is_active ? (
              <Check className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={onToggleExpand}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
            title="Remove trigger"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t px-3 py-3 space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-1 text-muted-foreground">Trigger Point: <HelpTooltip content={TRIGGER_POINTS.find(tp => tp.value === trigger.trigger_point)?.tooltip || ""} /></span>{" "}
              <span className="font-medium">{triggerPointInfo?.label}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-muted-foreground">Wait for Completion: <HelpTooltip content="Blocks the workflow until the agent finishes responding. Use timeout to prevent indefinite hanging" /></span>{" "}
              <span className="font-medium">{trigger.wait_for_completion ? "Yes" : "No"}</span>
            </div>
            {trigger.wait_for_completion && (
              <div>
                <span className="inline-flex items-center gap-1 text-muted-foreground">Timeout: <HelpTooltip content="Maximum seconds to wait for agent response before the workflow continues without it" /></span>{" "}
                <span className="font-medium">{trigger.timeout_seconds} seconds</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Created:</span>{" "}
              <span className="font-medium">
                {new Date(trigger.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
