"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Node, Edge } from "@xyflow/react";

import { useWorkspace } from "@/hooks/useWorkspace";
import { WorkflowCanvas } from "@/components/workflow-builder";
import { api, AutomationModule } from "@/lib/api";

const moduleLabels: Record<AutomationModule, string> = {
  crm: "CRM",
  tickets: "Tickets",
  hiring: "Hiring",
  email_marketing: "Email Marketing",
  uptime: "Uptime",
  sprints: "Sprints",
  forms: "Forms",
  booking: "Booking",
  tracking: "Tracking",
  compliance: "Compliance",
};

// Default trigger types per module
const defaultTriggerTypes: Record<string, { type: string; label: string }> = {
  crm: { type: "record.created", label: "Record Created" },
  tickets: { type: "ticket.created", label: "Ticket Created" },
  hiring: { type: "candidate.created", label: "Candidate Created" },
  email_marketing: { type: "campaign.sent", label: "Campaign Sent" },
  uptime: { type: "monitor.created", label: "Monitor Created" },
  sprints: { type: "task.created", label: "Task Created" },
  forms: { type: "form.submitted", label: "Form Submitted" },
  booking: { type: "booking.created", label: "Booking Created" },
  tracking: { type: "standup.submitted", label: "Standup Submitted" },
  compliance: { type: "training.assigned", label: "Training Assigned" },
};

// Template definitions for pre-filling automation from /templates page
interface AutomationTemplate {
  name: string;
  description: string;
  module: AutomationModule;
  triggerType: string;
  triggerLabel: string;
  actions: { type: string; label: string; config: Record<string, unknown> }[];
}

const AUTOMATION_TEMPLATES: Record<string, AutomationTemplate> = {
  "missed-standup": {
    name: "Missed Standup Follow-up",
    description: "When a team member misses their standup, create a follow-up task and send a reminder.",
    module: "tracking",
    triggerType: "standup.missed",
    triggerLabel: "Standup Missed",
    actions: [
      { type: "create_task", label: "Create Follow-up Task", config: { title: "Missed standup follow-up", priority: "medium" } },
      { type: "send_notification", label: "Send Reminder", config: { channel: "slack" } },
    ],
  },
  "blocker-escalation": {
    name: "Blocker Auto-Escalation",
    description: "Escalate blockers that remain unresolved for more than 2 days to the engineering manager.",
    module: "tracking",
    triggerType: "blocker.unresolved",
    triggerLabel: "Blocker Unresolved",
    actions: [
      { type: "send_notification", label: "Notify Manager", config: { channel: "slack", recipient: "manager" } },
      { type: "update_priority", label: "Increase Priority", config: { priority: "high" } },
    ],
  },
  "velocity-alert": {
    name: "Sprint Velocity Alert",
    description: "Notify when sprint burndown deviates more than 20% from the ideal trajectory.",
    module: "sprints",
    triggerType: "sprint.velocity_deviation",
    triggerLabel: "Velocity Deviation",
    actions: [
      { type: "send_notification", label: "Alert Team", config: { channel: "slack", threshold: 20 } },
    ],
  },
  "lead-followup": {
    name: "Lead Follow-up Sequence",
    description: "Send follow-up emails to new CRM leads after 1, 3, and 7 days.",
    module: "crm",
    triggerType: "record.created",
    triggerLabel: "Lead Created",
    actions: [
      { type: "send_email", label: "Day 1 Follow-up", config: { delay_days: 1 } },
      { type: "send_email", label: "Day 3 Follow-up", config: { delay_days: 3 } },
      { type: "send_email", label: "Day 7 Follow-up", config: { delay_days: 7 } },
    ],
  },
  "welcome-sequence": {
    name: "Welcome Email Sequence",
    description: "Send onboarding emails when a new contact is added to CRM.",
    module: "crm",
    triggerType: "record.created",
    triggerLabel: "Contact Created",
    actions: [
      { type: "send_email", label: "Welcome Email", config: { delay_days: 0 } },
      { type: "send_email", label: "Getting Started", config: { delay_days: 2 } },
      { type: "send_email", label: "Tips & Resources", config: { delay_days: 5 } },
    ],
  },
  "compliance-alert": {
    name: "Compliance Due Date Alert",
    description: "Alert team members 7 days before compliance deadlines and escalate overdue items.",
    module: "compliance",
    triggerType: "compliance.deadline_approaching",
    triggerLabel: "Deadline Approaching",
    actions: [
      { type: "send_notification", label: "7-Day Warning", config: { days_before: 7 } },
      { type: "send_notification", label: "Escalate Overdue", config: { on_overdue: true } },
    ],
  },
  "ai-triage": {
    name: "AI Ticket Triage",
    description: "Use AI to classify and route incoming tickets by priority and department.",
    module: "tickets",
    triggerType: "ticket.created",
    triggerLabel: "Ticket Created",
    actions: [
      { type: "ai_classify", label: "AI Classification", config: { model: "auto" } },
      { type: "assign_ticket", label: "Route to Team", config: { based_on: "classification" } },
    ],
  },
  "deal-stage-alert": {
    name: "Deal Stage Notification",
    description: "Notify the sales team when a deal moves to a new pipeline stage.",
    module: "crm",
    triggerType: "deal.stage_changed",
    triggerLabel: "Deal Stage Changed",
    actions: [
      { type: "send_notification", label: "Notify Sales Team", config: { channel: "slack" } },
    ],
  },
};

const getDefaultNodes = (module: string, tmpl?: AutomationTemplate | null): Node[] => {
  const trigger = tmpl
    ? { type: tmpl.triggerType, label: tmpl.triggerLabel }
    : defaultTriggerTypes[module] || defaultTriggerTypes.crm;

  const nodes: Node[] = [
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 250, y: 50 },
      data: {
        label: trigger.label,
        trigger_type: trigger.type,
      },
    },
  ];

  // Add action nodes from template
  if (tmpl?.actions) {
    tmpl.actions.forEach((action, i) => {
      nodes.push({
        id: `action-${i + 1}`,
        type: "action",
        position: { x: 250, y: 200 + i * 150 },
        data: {
          label: action.label,
          action_type: action.type,
          config: action.config,
        },
      });
    });
  }

  return nodes;
};

const getDefaultEdges = (tmpl?: AutomationTemplate | null): Edge[] => {
  if (!tmpl?.actions?.length) return [];

  const edges: Edge[] = [
    { id: "e-trigger-action-1", source: "trigger-1", target: "action-1" },
  ];
  for (let i = 1; i < tmpl.actions.length; i++) {
    edges.push({
      id: `e-action-${i}-action-${i + 1}`,
      source: `action-${i}`,
      target: `action-${i + 1}`,
    });
  }
  return edges;
};

export default function NewAutomationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();

  // Get module and template from URL query params
  const moduleParam = searchParams.get("module") as AutomationModule | null;
  const templateParam = searchParams.get("template");
  const template = templateParam ? AUTOMATION_TEMPLATES[templateParam] : null;

  const [module, setModule] = useState<AutomationModule>(
    template?.module || moduleParam || "crm"
  );
  const [name, setName] = useState(template?.name || "New Automation");
  const [description, setDescription] = useState(template?.description || "");
  const [isCreating, setIsCreating] = useState(false);
  const [automationId, setAutomationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workspaceId = currentWorkspace?.id;

  const handleCreateAutomation = useCallback(async () => {
    if (!workspaceId || isCreating) return null;

    setIsCreating(true);
    setError(null);

    try {
      // Use the correct default trigger type for the module
      const defaultTrigger = defaultTriggerTypes[module] || defaultTriggerTypes.crm;
      const response = await api.post(`/workspaces/${workspaceId}/automations`, {
        name,
        description,
        module,
        trigger_type: defaultTrigger.type,
        trigger_config: {},
        actions: [], // Start with empty actions, user will add via workflow canvas
      });
      setAutomationId(response.data.id);
      return response.data.id;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create automation";
      setError(errorMessage);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [workspaceId, name, description, module, isCreating]);

  const handleSave = useCallback(
    async (nodes: Node[], edges: Edge[], viewport: { x: number; y: number; zoom: number }) => {
      if (!workspaceId) return;

      let currentAutomationId = automationId;

      // Extract trigger type from the trigger node
      const triggerNode = nodes.find((n) => n.type === "trigger");
      const triggerType = (triggerNode?.data?.trigger_type as string) || "record.created";
      
      // Create automation if not exists
      if (!currentAutomationId) {
        currentAutomationId = await handleCreateAutomation();
        if (!currentAutomationId) return;
      }

      // Update workflow (workflow endpoints are under /crm/automations)
      try {
        await api.put(
          `/workspaces/${workspaceId}/crm/automations/${currentAutomationId}/workflow`,
          {
            nodes,
            edges,
            viewport,
          }
        );

        // Also update the automation's trigger_type to match the trigger node
        await api.patch(
          `/workspaces/${workspaceId}/automations/${currentAutomationId}`,
          {
            trigger_type: triggerType,
          }
        );
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to save workflow";
        setError(errorMessage);
      }
    },
    [workspaceId, automationId, handleCreateAutomation]
  );

  const handlePublish = useCallback(async () => {
    if (!workspaceId || !automationId) return;

    try {
      await api.post(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/publish`
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to publish workflow";
      setError(errorMessage);
    }
  }, [workspaceId, automationId]);

  const handleUnpublish = useCallback(async () => {
    if (!workspaceId || !automationId) return;

    try {
      await api.post(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/unpublish`
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to unpublish workflow";
      setError(errorMessage);
    }
  }, [workspaceId, automationId]);

  const handleTest = useCallback(
    async (recordId?: string) => {
      if (!workspaceId || !automationId) return;

      try {
        const response = await api.post(
          `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/execute`,
          {
            dry_run: true,
            // Only include record_id if provided and non-empty
            ...(recordId?.trim() ? { record_id: recordId.trim() } : {}),
          }
        );
        console.log("Test execution result:", response.data);
        return response.data;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to test workflow";
        setError(errorMessage);
      }
    },
    [workspaceId, automationId]
  );

  const handleBack = () => {
    const backUrl = moduleParam ? `/automations?module=${moduleParam}` : "/automations";
    router.push(backUrl);
  };

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-background animate-pulse">
        <div className="h-[calc(100vh-64px)] flex flex-col">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="h-9 w-9 bg-accent rounded-lg" />
              <div>
                <div className="h-5 w-48 bg-accent rounded mb-2" />
                <div className="h-3 w-32 bg-accent rounded" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-20 bg-accent rounded-lg" />
              <div className="h-9 w-24 bg-accent rounded-lg" />
            </div>
          </div>
          <div className="flex-1 flex">
            <div className="flex-1 p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-muted border border-border rounded-xl p-4">
                  <div className="h-4 w-32 bg-accent rounded mb-3" />
                  <div className="h-10 w-full bg-accent rounded-lg" />
                </div>
              ))}
            </div>
            <div className="w-80 border-l border-border p-4 space-y-3">
              <div className="h-4 w-24 bg-accent rounded" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 w-full bg-accent rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-border bg-muted/50 relative z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-semibold text-foreground bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -ml-2"
                  placeholder="Automation name"
                />
                <select
                  value={module}
                  onChange={(e) => setModule(e.target.value as AutomationModule)}
                  className="text-sm bg-accent border border-border rounded-lg px-3 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(moduleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block text-sm text-muted-foreground bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-0.5 -ml-2 w-full max-w-md"
                placeholder="Add a description..."
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 px-3 py-1 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Template Banner */}
        {template && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/20 text-sm">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="text-muted-foreground">
              Pre-filled from template: <span className="text-foreground font-medium">{template.name}</span>
              {" "}&mdash; customize the workflow below, then save.
            </span>
          </div>
        )}

        {/* Workflow Canvas */}
        <div className="flex-1">
          <WorkflowCanvas
            key={module}  // Force re-render when module changes
            automationId={automationId || "new"}
            workspaceId={workspaceId}
            module={module}
            initialNodes={getDefaultNodes(module, template)}
            initialEdges={getDefaultEdges(template)}
            onSave={handleSave}
            onPublish={handlePublish}
            onUnpublish={handleUnpublish}
            onTest={handleTest}
          />
        </div>
      </div>
    </div>
  );
}
