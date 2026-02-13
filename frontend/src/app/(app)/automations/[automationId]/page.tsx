"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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

interface WorkflowDefinition {
  id: string;
  automation_id: string;
  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number } | null;
  version: number;
  is_published: boolean;
}

interface Automation {
  id: string;
  name: string;
  description: string | null;
  module: AutomationModule;
  is_active: boolean;
}

export default function EditAutomationPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const automationId = params.automationId as string;

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const workspaceId = currentWorkspace?.id;

  // Load automation and workflow
  useEffect(() => {
    if (!workspaceId || !automationId) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Load automation from new API endpoint
        const automationResponse = await api.get(
          `/workspaces/${workspaceId}/automations/${automationId}`
        );
        setAutomation(automationResponse.data);
        setName(automationResponse.data.name);
        setDescription(automationResponse.data.description || "");

        // Try to load workflow (may not exist for new automations)
        try {
          const workflowResponse = await api.get(
            `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow`
          );
          setWorkflow(workflowResponse.data);
        } catch {
          // Workflow doesn't exist yet, that's okay
          setWorkflow(null);
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load automation";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [workspaceId, automationId]);

  // Update automation name/description when changed
  useEffect(() => {
    if (!workspaceId || !automationId || !automation) return;

    const updateAutomation = async () => {
      if (name !== automation.name || description !== (automation.description || "")) {
        try {
          await api.patch(`/workspaces/${workspaceId}/automations/${automationId}`, {
            name,
            description,
          });
          setAutomation((prev) => (prev ? { ...prev, name, description } : prev));
        } catch (err) {
          console.error("Failed to update automation:", err);
        }
      }
    };

    const timeout = setTimeout(updateAutomation, 1000);
    return () => clearTimeout(timeout);
  }, [workspaceId, automationId, automation, name, description]);

  const handleSave = useCallback(
    async (nodes: Node[], edges: Edge[], viewport: { x: number; y: number; zoom: number }) => {
      if (!workspaceId || !automationId) return;

      try {
        const response = await api.put(
          `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow`,
          {
            nodes,
            edges,
            viewport,
          }
        );
        setWorkflow(response.data);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to save workflow";
        setError(errorMessage);
      }
    },
    [workspaceId, automationId]
  );

  const handlePublish = useCallback(async () => {
    if (!workspaceId || !automationId) return;

    try {
      const response = await api.post(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/publish`
      );
      setWorkflow(response.data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to publish workflow";
      setError(errorMessage);
    }
  }, [workspaceId, automationId]);

  const handleUnpublish = useCallback(async () => {
    if (!workspaceId || !automationId) return;

    try {
      const response = await api.post(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/unpublish`
      );
      setWorkflow(response.data);
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
    const moduleFilter = automation?.module;
    const backUrl = moduleFilter ? `/automations?module=${moduleFilter}` : "/automations";
    router.push(backUrl);
  };

  if (isLoading || !workspaceId) {
    return (
      <div className="min-h-screen bg-slate-900">
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  if (error && !workflow && !automation) {
    return (
      <div className="min-h-screen bg-slate-900">
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-red-400 text-lg mb-4">{error}</div>
          <button
            onClick={() => router.push("/automations")}
            className="text-blue-400 hover:text-blue-300"
          >
            Back to Automations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-slate-700 bg-slate-800/50 relative z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-semibold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -ml-2"
                  placeholder="Automation name"
                />
                {automation?.module && (
                  <span className="text-sm text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
                    {moduleLabels[automation.module] || automation.module}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block text-sm text-slate-400 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-0.5 -ml-2 w-full max-w-md"
                placeholder="Add a description..."
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 px-3 py-1 rounded-lg">
              {error}
            </div>
          )}

          <div className="text-sm text-slate-400">
            Version {workflow?.version || 1}
          </div>
        </div>

        {/* Workflow Canvas */}
        <div className="flex-1">
          <WorkflowCanvas
            automationId={automationId}
            workspaceId={workspaceId}
            module={automation?.module || "crm"}
            initialNodes={workflow?.nodes || []}
            initialEdges={workflow?.edges || []}
            initialViewport={workflow?.viewport || { x: 0, y: 0, zoom: 1 }}
            isPublished={workflow?.is_published || false}
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
