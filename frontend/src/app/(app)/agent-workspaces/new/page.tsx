"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCreateAgentWorkspace } from "@/hooks/useAgentWorkspaces";
import { toast } from "sonner";

export default function NewAgentWorkspacePage() {
  const router = useRouter();
  const { currentWorkspaceId } = useWorkspace();
  const createMutation = useCreateAgentWorkspace(currentWorkspaceId ?? undefined);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceModule, setSourceModule] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const workspace = await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        source_module: sourceModule || undefined,
      });
      toast.success("Workspace created");
      router.push(`/agent-workspaces/${workspace.id}`);
    } catch {
      toast.error("Failed to create workspace");
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Agent Workspace</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Market Analysis for Q1"
            className="w-full px-3 py-2 rounded-md border bg-background text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the task or objective..."
            rows={3}
            className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Source Module (optional)</label>
          <select
            value={sourceModule}
            onChange={(e) => setSourceModule(e.target.value)}
            className="w-full px-3 py-2 rounded-md border bg-background text-sm"
          >
            <option value="">Standalone</option>
            <option value="crm">CRM</option>
            <option value="sprints">Sprints</option>
            <option value="analytics">Analytics</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={createMutation.isPending || !title.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Create Workspace"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border rounded-md hover:bg-muted text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
