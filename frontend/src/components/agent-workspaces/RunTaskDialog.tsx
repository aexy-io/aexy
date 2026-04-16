"use client";

import { useState } from "react";
import { useRunTask } from "@/hooks/useAgentWorkspaces";
import { X } from "lucide-react";
import { toast } from "sonner";

interface RunTaskDialogProps {
  workspaceId: string;
  agentWorkspaceId: string;
  onClose: () => void;
}

export function RunTaskDialog({ workspaceId, agentWorkspaceId, onClose }: RunTaskDialogProps) {
  const [task, setTask] = useState("");
  const runMutation = useRunTask(workspaceId, agentWorkspaceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;

    try {
      const result = await runMutation.mutateAsync({ task: task.trim() });
      toast.success(`Orchestration started: ${result.temporal_workflow_id}`);
      onClose();
    } catch {
      toast.error("Failed to start orchestration");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold">Run Task</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Task Description</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe the task for the orchestrator agent..."
              rows={5}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-none"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              The orchestrator will decompose this into specialized blocks executed by researcher, analyst, and writer agents.
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md hover:bg-muted text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!task.trim() || runMutation.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
            >
              {runMutation.isPending ? "Starting..." : "Start Orchestration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
