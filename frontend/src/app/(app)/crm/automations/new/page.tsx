"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Node, Edge } from "@xyflow/react";

import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { WorkflowCanvas } from "@/components/workflow-builder";
import { api } from "@/lib/api";

const defaultNodes: Node[] = [
  {
    id: "trigger-1",
    type: "trigger",
    position: { x: 250, y: 50 },
    data: {
      label: "Record Created",
      trigger_type: "record_created",
    },
  },
];

const defaultEdges: Edge[] = [];

export default function NewAutomationPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
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
      const response = await api.post(`/workspaces/${workspaceId}/crm/automations`, {
        name,
        description,
        trigger_type: "record.created",
        trigger_config: {},
        actions: [{ type: "update_record", config: {}, order: 0 }],
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
  }, [workspaceId, name, description, isCreating]);

  const handleSave = useCallback(
    async (nodes: Node[], edges: Edge[], viewport: { x: number; y: number; zoom: number }) => {
      if (!workspaceId) return;

      let currentAutomationId = automationId;

      // Create automation if not exists
      if (!currentAutomationId) {
        currentAutomationId = await handleCreateAutomation();
        if (!currentAutomationId) return;
      }

      // Update workflow
      try {
        await api.put(
          `/workspaces/${workspaceId}/crm/automations/${currentAutomationId}/workflow`,
          {
            nodes,
            edges,
            viewport,
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
            record_id: recordId,
            dry_run: true,
          }
        );
        console.log("Test execution result:", response.data);
        // Could show results in a modal
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to test workflow";
        setError(errorMessage);
      }
    },
    [workspaceId, automationId]
  );

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-slate-900">
<div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
<div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/crm/automations")}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-lg font-semibold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -ml-2"
                placeholder="Automation name"
              />
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
        </div>

        {/* Workflow Canvas */}
        <div className="flex-1">
          <WorkflowCanvas
            automationId={automationId || "new"}
            workspaceId={workspaceId}
            initialNodes={defaultNodes}
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
