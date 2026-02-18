"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
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
};

const getDefaultNodes = (module: string): Node[] => {
  const trigger = defaultTriggerTypes[module] || defaultTriggerTypes.crm;
  return [
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
};

const defaultEdges: Edge[] = [];

export default function NewAutomationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();

  // Get module from URL query param
  const moduleParam = searchParams.get("module") as AutomationModule | null;
  const [module, setModule] = useState<AutomationModule>(moduleParam || "crm");
  const [name, setName] = useState("New Automation");
  const [description, setDescription] = useState("");
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
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
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

        {/* Workflow Canvas */}
        <div className="flex-1">
          <WorkflowCanvas
            key={module}  // Force re-render when module changes
            automationId={automationId || "new"}
            workspaceId={workspaceId}
            module={module}
            initialNodes={getDefaultNodes(module)}
            initialEdges={defaultEdges}
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
